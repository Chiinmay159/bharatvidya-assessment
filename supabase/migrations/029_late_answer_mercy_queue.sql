-- ================================================================
-- 029: Late-answer mercy queue (Phase 2 — network resilience)
-- ================================================================
-- When a student's connection dies near the deadline, answers buffered
-- on their device can arrive after the window closed. Policy: the
-- server-authoritative deadline stands — late answers are NEVER scored
-- automatically. They land quarantined here, visible to the operator,
-- who accepts (answer applied + attempt rescored) or rejects each one.
-- Never silently accepted, never silently discarded.

CREATE TABLE IF NOT EXISTS public.late_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      uuid NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_answer text NOT NULL CHECK (selected_answer IN ('A','B','C','D')),
  time_spent_ms   int CHECK (time_spent_ms IS NULL OR time_spent_ms >= 0),
  client_seq      bigint,
  client_saved_at timestamptz,          -- client clock: display context only, never trusted
  received_at     timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'quarantined'
                  CHECK (status IN ('quarantined','accepted','rejected')),
  reviewed_by     text,
  reviewed_at     timestamptz,
  CONSTRAINT late_responses_attempt_question_unique UNIQUE (attempt_id, question_id)
);

ALTER TABLE public.late_responses ENABLE ROW LEVEL SECURITY;

-- Admins read their org's quarantine queue; all writes go through RPCs.
CREATE POLICY late_responses_select_admin ON public.late_responses
  FOR SELECT TO authenticated
  USING (is_admin() AND attempt_in_my_org(attempt_id));

-- ----------------------------------------------------------------
-- Student-side deposit: session-token gated, grace-window bounded.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_late_buffer(
  p_attempt_id    uuid,
  p_session_token uuid,
  p_responses     jsonb
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch_id   uuid;
  v_deadline   timestamptz;
  v_item       jsonb;
  v_qid        uuid;
  v_ans        text;
  v_saved      int := 0;
  v_rows       int;
BEGIN
  -- Ownership: the token issued to this device for this attempt.
  SELECT a.batch_id,
         b.scheduled_start + (b.duration_minutes + a.extra_time_minutes) * interval '1 minute'
  INTO v_batch_id, v_deadline
  FROM public.attempts a
  JOIN public.batches b ON b.id = a.batch_id
  WHERE a.id = p_attempt_id AND a.session_token = p_session_token;
  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Invalid session';
  END IF;

  -- Only meaningful after the deadline, and only within a bounded grace
  -- window — this is outage recovery, not an open submission channel.
  IF now() <= v_deadline THEN
    RAISE EXCEPTION 'Exam is still open — use the normal save path';
  END IF;
  IF now() > v_deadline + interval '30 minutes' THEN
    RAISE EXCEPTION 'The late-delivery window has closed';
  END IF;

  IF p_responses IS NULL OR jsonb_typeof(p_responses) != 'array'
     OR jsonb_array_length(p_responses) > 200 THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_responses) LOOP
    v_qid := (v_item->>'question_id')::uuid;
    v_ans := upper(v_item->>'selected_answer');
    IF v_ans NOT IN ('A','B','C','D') THEN CONTINUE; END IF;
    -- Question must belong to this exam (no cross-batch writes).
    IF NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.id = v_qid AND q.batch_id = v_batch_id) THEN
      CONTINUE;
    END IF;
    -- Skip answers the server already has identically — nothing to review.
    IF EXISTS (SELECT 1 FROM public.responses r
               WHERE r.attempt_id = p_attempt_id AND r.question_id = v_qid
                 AND r.selected_answer = v_ans) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.late_responses
      (attempt_id, question_id, selected_answer, time_spent_ms, client_seq, client_saved_at)
    VALUES (
      p_attempt_id, v_qid, v_ans,
      NULLIF((v_item->>'time_spent_ms'), '')::int,
      NULLIF((v_item->>'client_seq'), '')::bigint,
      to_timestamp(NULLIF((v_item->>'client_saved_at'), '')::double precision / 1000.0)
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE
      SET selected_answer = EXCLUDED.selected_answer,
          time_spent_ms   = EXCLUDED.time_spent_ms,
          client_seq      = EXCLUDED.client_seq,
          client_saved_at = EXCLUDED.client_saved_at,
          received_at     = now()
      WHERE public.late_responses.status = 'quarantined';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_saved := v_saved + v_rows;
  END LOOP;

  RETURN v_saved;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_late_buffer(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_late_buffer(uuid, uuid, jsonb) TO anon, authenticated;

-- ----------------------------------------------------------------
-- Operator review: accept applies the answer and rescores; reject
-- keeps the record. Both stamp reviewer + audit_log.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_late_response(p_late_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row        public.late_responses%ROWTYPE;
  v_correct    text;
  v_is_correct boolean;
  v_email      text := (SELECT auth.jwt() ->> 'email');
BEGIN
  SELECT * INTO v_row FROM public.late_responses WHERE id = p_late_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF NOT public.is_admin() OR NOT public.attempt_in_my_org(v_row.attempt_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF v_row.status != 'quarantined' THEN
    RAISE EXCEPTION 'Already reviewed';
  END IF;

  IF p_accept THEN
    SELECT q.correct_answer INTO v_correct FROM public.questions q WHERE q.id = v_row.question_id;
    v_is_correct := (v_row.selected_answer = v_correct);
    -- is_correct set explicitly: immune to the responses trigger being
    -- INSERT-only (the upsert may take the UPDATE path).
    INSERT INTO public.responses (attempt_id, question_id, selected_answer, is_correct, time_spent_ms)
    VALUES (v_row.attempt_id, v_row.question_id, v_row.selected_answer, v_is_correct, v_row.time_spent_ms)
    ON CONFLICT (attempt_id, question_id) DO UPDATE
      SET selected_answer = EXCLUDED.selected_answer,
          is_correct      = EXCLUDED.is_correct,
          time_spent_ms   = EXCLUDED.time_spent_ms;
    -- Rescore from ground truth (only meaningful once submitted).
    UPDATE public.attempts a
    SET score = (SELECT count(*) FROM public.responses r
                 WHERE r.attempt_id = a.id AND r.is_correct)
    WHERE a.id = v_row.attempt_id AND a.submitted_at IS NOT NULL;
  END IF;

  UPDATE public.late_responses
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
      reviewed_by = v_email,
      reviewed_at = now()
  WHERE id = p_late_id;

  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES (
    CASE WHEN p_accept THEN 'late_response_accepted' ELSE 'late_response_rejected' END,
    'attempt', v_row.attempt_id, coalesce(v_email, 'unknown'),
    jsonb_build_object('late_id', p_late_id, 'question_id', v_row.question_id,
                       'selected_answer', v_row.selected_answer)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.review_late_response(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_late_response(uuid, boolean) TO authenticated;
