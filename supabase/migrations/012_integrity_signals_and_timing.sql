-- ================================================================
-- 012: Integrity signals + time-per-question telemetry
-- ================================================================
-- 1. responses.time_spent_ms — how long the student spent on each
--    question. Feeds both post-hoc anomaly detection (improbably
--    fast completions) and future item analysis.
-- 2. integrity_events — generic event log (fullscreen exits, etc.)
--    alongside the existing tab_switches table. Logged, never
--    auto-ejecting; surfaced to admins.
-- 3. save_response / save_responses_batch updated to accept timing.
--    Old 4-arg save_response is dropped and replaced by a 5-arg
--    version with a DEFAULT, so existing callers keep working.
-- ================================================================

ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS time_spent_ms int CHECK (time_spent_ms IS NULL OR time_spent_ms >= 0);

-- ----------------------------------------------------------------
-- integrity_events
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integrity_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  uuid NOT NULL REFERENCES public.attempts(id),
  event_type  text NOT NULL CHECK (event_type IN (
    'fullscreen_exit', 'fullscreen_denied', 'copy_attempt', 'paste_attempt'
  )),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  meta        jsonb
);
ALTER TABLE public.integrity_events ENABLE ROW LEVEL SECURITY;

-- Same scoping pattern as tab_switches: only for open attempts in active batches
CREATE POLICY integrity_events_anon_insert ON public.integrity_events
  FOR INSERT TO anon
  WITH CHECK (public.attempt_is_open(attempt_id));
CREATE POLICY integrity_events_admin_read ON public.integrity_events
  FOR SELECT TO authenticated USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_integrity_events_attempt ON public.integrity_events(attempt_id);

-- ----------------------------------------------------------------
-- save_response — add p_time_spent_ms (drop old signature first so
-- named-arg RPC calls don't become ambiguous)
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_response(uuid, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.save_response(
  p_attempt_id      uuid,
  p_question_id     uuid,
  p_selected_answer text,
  p_session_token   uuid,
  p_time_spent_ms   int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.attempts a
    JOIN public.batches b ON b.id = a.batch_id
    WHERE a.id            = p_attempt_id
      AND a.session_token = p_session_token
      AND a.submitted_at  IS NULL
      AND b.status        = 'active'
  ) THEN
    RAISE EXCEPTION 'Invalid session or attempt already closed';
  END IF;

  INSERT INTO public.responses (attempt_id, question_id, selected_answer, is_correct, time_spent_ms)
  VALUES (p_attempt_id, p_question_id, p_selected_answer, false,
          LEAST(p_time_spent_ms, 86400000))  -- cap at 24h to reject garbage
  ON CONFLICT (attempt_id, question_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.save_response(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_response(uuid, uuid, text, uuid, int) TO anon, authenticated;

-- ----------------------------------------------------------------
-- save_responses_batch — accept optional time_spent_ms per item
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_responses_batch(
  p_attempt_id    uuid,
  p_session_token uuid,
  p_responses     jsonb
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.attempts a
    JOIN public.batches b ON b.id = a.batch_id
    WHERE a.id            = p_attempt_id
      AND a.session_token = p_session_token
      AND a.submitted_at  IS NULL
      AND b.status        = 'active'
  ) THEN
    RAISE EXCEPTION 'Invalid session or attempt already closed';
  END IF;

  IF jsonb_array_length(p_responses) > 200 THEN
    RAISE EXCEPTION 'Batch too large';
  END IF;

  INSERT INTO public.responses (attempt_id, question_id, selected_answer, is_correct, time_spent_ms)
  SELECT p_attempt_id,
         (r->>'question_id')::uuid,
         upper(r->>'selected_answer'),
         false,
         LEAST((r->>'time_spent_ms')::int, 86400000)
  FROM jsonb_array_elements(p_responses) AS r
  WHERE upper(r->>'selected_answer') IN ('A','B','C','D')
  ON CONFLICT (attempt_id, question_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.save_responses_batch(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_responses_batch(uuid, uuid, jsonb) TO anon, authenticated;
