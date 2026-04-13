-- ================================================================
-- Migration 007: Authoritative session-token enforcement
-- ================================================================
-- Closes two gaps from round-2 review:
--
-- 1. Session tokens were advisory (client heartbeat only).  Now every
--    write path (save_response, submit_exam) validates the token
--    server-side.  The anon INSERT policy on responses is removed —
--    all inserts go through the save_response RPC.
--
-- 2. submit_exam gains a p_session_token parameter and rejects stale
--    sessions (admin callers are exempt via is_admin()).
-- ================================================================


-- ---------------------------------------------------------------
-- 1. save_response — validates session token, then inserts.
--    Idempotent: ON CONFLICT DO NOTHING for retries after timeouts.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_response(
  p_attempt_id      uuid,
  p_question_id     uuid,
  p_selected_answer text,
  p_session_token   uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Validate session token, attempt open, batch active
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

  -- Insert (idempotent — duplicate silently ignored)
  INSERT INTO public.responses (attempt_id, question_id, selected_answer, is_correct)
  VALUES (p_attempt_id, p_question_id, p_selected_answer, false)
  ON CONFLICT (attempt_id, question_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.save_response(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_response(uuid, uuid, text, uuid) TO anon, authenticated;


-- ---------------------------------------------------------------
-- 2. Remove the anon INSERT policy on responses — all writes now
--    go through save_response, which does its own auth checks.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS responses_insert_anon ON public.responses;


-- ---------------------------------------------------------------
-- 3. Replace submit_exam — add session-token validation.
--    The old (uuid)-only signature is dropped to prevent bypasses.
--    p_session_token DEFAULT NULL keeps admin/dashboard usable;
--    admin callers (is_admin()) are exempt from the token check.
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_exam(uuid);

CREATE OR REPLACE FUNCTION public.submit_exam(
  p_attempt_id    uuid,
  p_session_token uuid DEFAULT NULL
)
RETURNS TABLE (score int, total_questions int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_score        int;
  v_total        int;
  v_batch_status text;
  v_submitted    timestamptz;
  v_session      uuid;
BEGIN
  SELECT a.submitted_at, b.status, a.session_token
  INTO   v_submitted, v_batch_status, v_session
  FROM   public.attempts a
  JOIN   public.batches  b ON b.id = a.batch_id
  WHERE  a.id = p_attempt_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;

  -- Already submitted → return existing score (idempotent)
  IF v_submitted IS NOT NULL THEN
    SELECT a.score, a.total_questions INTO v_score, v_total
    FROM public.attempts a WHERE a.id = p_attempt_id;
    RETURN QUERY SELECT v_score, v_total;
    RETURN;
  END IF;

  IF v_batch_status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'Exam is not accepting submissions';
  END IF;

  -- Validate session token (admin callers exempt)
  IF v_session IS NOT NULL
     AND NOT public.is_admin()
     AND (p_session_token IS NULL OR p_session_token != v_session)
  THEN
    RAISE EXCEPTION 'Invalid session token';
  END IF;

  SELECT COUNT(*) FILTER (WHERE r.is_correct = true), COUNT(*)
  INTO v_score, v_total
  FROM public.responses r WHERE r.attempt_id = p_attempt_id;

  UPDATE public.attempts
  SET submitted_at = now(), score = v_score, total_questions = v_total
  WHERE id = p_attempt_id;

  RETURN QUERY SELECT v_score, v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_exam(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_exam(uuid, uuid) TO anon, authenticated;
