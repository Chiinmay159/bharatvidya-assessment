-- ================================================================
-- 020: Server-side enforcement of identity, deadline, integrity
--      (audit-2 findings C1, C2, M1, H3)
-- ================================================================
-- The migration-019 access model was enforced only in the client.
-- These functions move enforcement into the authoritative write
-- paths so direct anon-key API calls cannot bypass it.
-- ================================================================

-- ----------------------------------------------------------------
-- C2: discovery code becomes 8 chars (routing key, not a secret).
-- Existing 6-char codes keep working; new batches get 8.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gen_exam_code()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  chars  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i      int;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, 1 + floor(random() * 32)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- ----------------------------------------------------------------
-- C1: create_attempt enforces roster identity (roll + email) when a
-- roster exists. This is the real credential — the client check was
-- decorative. Also H3: reject attempt creation after the exam window.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_attempt(
  p_batch_id     uuid,
  p_roll_number  text,
  p_student_name text,
  p_email        text DEFAULT NULL,
  p_access_code  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id             uuid;
  v_status         text;
  v_code           text;
  v_max_attempts   int;
  v_existing_count int;
  v_next_attempt   int;
  v_student_id     uuid;
  v_has_roster     boolean;
  v_roster_name    text;
  v_window_end     timestamptz;
BEGIN
  SELECT status, access_code, max_attempts,
         scheduled_start + (duration_minutes * interval '1 minute')
  INTO   v_status, v_code, v_max_attempts, v_window_end
  FROM   public.batches WHERE id = p_batch_id;

  IF v_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_status != 'active' THEN RAISE EXCEPTION 'Batch is not active'; END IF;

  -- H3: no new attempts after the exam window has closed
  IF now() > v_window_end THEN
    RAISE EXCEPTION 'The exam time window has closed';
  END IF;

  -- Access/discovery code (still required; routing + low-stakes gate)
  IF v_code IS NOT NULL AND v_code != '' THEN
    IF p_access_code IS NULL OR upper(p_access_code) != upper(v_code) THEN
      RAISE EXCEPTION 'Invalid access code';
    END IF;
  END IF;

  -- C1: roster identity is the credential when a roster exists.
  SELECT EXISTS(SELECT 1 FROM public.roster WHERE batch_id = p_batch_id)
  INTO v_has_roster;

  IF v_has_roster THEN
    SELECT student_name INTO v_roster_name
    FROM public.roster
    WHERE batch_id = p_batch_id
      AND roll_number = p_roll_number
      AND lower(email) = lower(coalesce(p_email, ''))
    LIMIT 1;

    IF v_roster_name IS NULL THEN
      RAISE EXCEPTION 'Roll number and email do not match the exam roster';
    END IF;
    -- Trust the roster name, not client input
    p_student_name := v_roster_name;
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM public.attempts
  WHERE batch_id = p_batch_id AND roll_number = p_roll_number;

  v_next_attempt := v_existing_count + 1;
  IF v_next_attempt > v_max_attempts THEN
    RAISE EXCEPTION 'Maximum attempts reached for this exam';
  END IF;

  IF p_email IS NOT NULL AND p_email != '' THEN
    INSERT INTO public.students (email, full_name)
    VALUES (lower(p_email), p_student_name)
    ON CONFLICT (email) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_student_id;
  END IF;

  INSERT INTO public.attempts (batch_id, roll_number, student_name, email, attempt_number, student_id)
  VALUES (p_batch_id, p_roll_number, p_student_name, p_email, v_next_attempt, v_student_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_attempt(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_attempt(uuid, text, text, text, text) TO anon, authenticated;

-- ----------------------------------------------------------------
-- M1 + H3: save_response — question must belong to the batch, and
-- writes are rejected after the (extension-aware) deadline.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_response(
  p_attempt_id      uuid,
  p_question_id     uuid,
  p_selected_answer text,
  p_session_token   uuid,
  p_time_spent_ms   int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch    uuid;
  v_deadline timestamptz;
BEGIN
  SELECT b.id,
         b.scheduled_start + ((b.duration_minutes + a.extra_time_minutes) * interval '1 minute')
  INTO   v_batch, v_deadline
  FROM   public.attempts a
  JOIN   public.batches b ON b.id = a.batch_id
  WHERE  a.id = p_attempt_id
    AND  a.session_token = p_session_token
    AND  a.submitted_at IS NULL
    AND  b.status = 'active';

  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'Invalid session or attempt already closed';
  END IF;

  -- H3: authoritative deadline (30s grace for clock skew / in-flight)
  IF now() > v_deadline + interval '30 seconds' THEN
    RAISE EXCEPTION 'The exam time has ended';
  END IF;

  -- M1: the question must belong to this batch (no foreign-key injection)
  IF NOT EXISTS (
    SELECT 1 FROM public.questions q WHERE q.id = p_question_id AND q.batch_id = v_batch
  ) THEN
    RAISE EXCEPTION 'Question does not belong to this exam';
  END IF;

  INSERT INTO public.responses (attempt_id, question_id, selected_answer, is_correct, time_spent_ms)
  VALUES (p_attempt_id, p_question_id, p_selected_answer, false, LEAST(p_time_spent_ms, 86400000))
  ON CONFLICT (attempt_id, question_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.save_response(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_response(uuid, uuid, text, uuid, int) TO anon, authenticated;

-- ----------------------------------------------------------------
-- M1 + H3: save_responses_batch — same protections; foreign questions
-- are dropped (not errored) so a legitimate queue drain still works.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_responses_batch(
  p_attempt_id    uuid,
  p_session_token uuid,
  p_responses     jsonb
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch    uuid;
  v_deadline timestamptz;
  v_count    int;
BEGIN
  SELECT b.id,
         b.scheduled_start + ((b.duration_minutes + a.extra_time_minutes) * interval '1 minute')
  INTO   v_batch, v_deadline
  FROM   public.attempts a
  JOIN   public.batches b ON b.id = a.batch_id
  WHERE  a.id = p_attempt_id
    AND  a.session_token = p_session_token
    AND  a.submitted_at IS NULL
    AND  b.status = 'active';

  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'Invalid session or attempt already closed';
  END IF;
  IF now() > v_deadline + interval '30 seconds' THEN
    RAISE EXCEPTION 'The exam time has ended';
  END IF;
  IF jsonb_array_length(p_responses) > 200 THEN
    RAISE EXCEPTION 'Batch too large';
  END IF;

  INSERT INTO public.responses (attempt_id, question_id, selected_answer, is_correct, time_spent_ms)
  SELECT p_attempt_id, (r->>'question_id')::uuid, upper(r->>'selected_answer'), false,
         LEAST((r->>'time_spent_ms')::int, 86400000)
  FROM jsonb_array_elements(p_responses) AS r
  WHERE upper(r->>'selected_answer') IN ('A','B','C','D')
    AND EXISTS (  -- M1: only questions belonging to this batch
      SELECT 1 FROM public.questions q
      WHERE q.id = (r->>'question_id')::uuid AND q.batch_id = v_batch
    )
  ON CONFLICT (attempt_id, question_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.save_responses_batch(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_responses_batch(uuid, uuid, jsonb) TO anon, authenticated;
