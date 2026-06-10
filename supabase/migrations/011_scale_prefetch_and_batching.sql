-- ================================================================
-- 011: Scale hardening for 2000+ concurrent students
-- ================================================================
-- 1. Encrypted paper pre-fetch: students download the (encrypted)
--    question paper during the waiting room, spread over minutes.
--    At exam start they fetch only a 64-byte key — turning the
--    start-time spike into a trivial broadcast.
-- 2. Batched response saving: save_responses_batch validates the
--    session once and upserts many answers in one round trip
--    (used to drain the offline queue before submission).
--
-- Security notes:
-- * paper_key is NOT in the anon column grant on batches (the grant
--   is an explicit column list) — anon can never SELECT it directly.
-- * Ciphertext contains questions WITHOUT correct_answer (same
--   stripping as get_exam_questions).
-- * get_paper_key releases the key only when the batch is 'active' —
--   the same condition under which get_exam_questions works today,
--   so pre-fetch leaks nothing earlier than the status quo.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS paper_key bytea;

-- ----------------------------------------------------------------
-- get_exam_paper_encrypted — available while scheduled OR active.
-- Generates the batch key on first call (atomic, idempotent).
-- Returns AES-256-CBC ciphertext (PKCS#7 padded) + per-call IV,
-- both base64 — decryptable in the browser via Web Crypto.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_exam_paper_encrypted(p_batch_id uuid)
RETURNS TABLE (ciphertext text, iv text)
-- search_path includes extensions: pgcrypto (gen_random_bytes, encrypt_iv)
-- lives in the extensions schema on Supabase
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_status text;
  v_key    bytea;
  v_iv     bytea;
  v_json   text;
BEGIN
  SELECT b.status, b.paper_key INTO v_status, v_key
  FROM public.batches b WHERE b.id = p_batch_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_status NOT IN ('scheduled', 'active') THEN
    RAISE EXCEPTION 'Paper not available for this batch';
  END IF;

  -- Generate key once, atomically (concurrent first callers race safely)
  IF v_key IS NULL THEN
    UPDATE public.batches
    SET paper_key = gen_random_bytes(32)
    WHERE id = p_batch_id AND paper_key IS NULL;
    SELECT b.paper_key INTO v_key FROM public.batches b WHERE b.id = p_batch_id;
  END IF;

  -- Same shape as get_exam_questions (correct_answer stripped)
  SELECT json_agg(json_build_object(
    'id', q.id,
    'question_text', q.question_text,
    'option_a', q.option_a,
    'option_b', q.option_b,
    'option_c', q.option_c,
    'option_d', q.option_d,
    'sort_order', q.sort_order
  ) ORDER BY q.sort_order)::text
  INTO v_json
  FROM public.questions q WHERE q.batch_id = p_batch_id;

  IF v_json IS NULL THEN RAISE EXCEPTION 'No questions found for this batch'; END IF;

  v_iv := gen_random_bytes(16);
  RETURN QUERY SELECT
    encode(encrypt_iv(convert_to(v_json, 'utf8'), v_key, v_iv, 'aes-cbc/pad:pkcs'), 'base64'),
    encode(v_iv, 'base64');
END;
$$;
REVOKE ALL ON FUNCTION public.get_exam_paper_encrypted(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_paper_encrypted(uuid) TO anon, authenticated;

-- ----------------------------------------------------------------
-- get_paper_key — tiny payload, released only once batch is active.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_paper_key(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_status text;
  v_key    bytea;
BEGIN
  SELECT b.status, b.paper_key INTO v_status, v_key
  FROM public.batches b WHERE b.id = p_batch_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_status != 'active' THEN RAISE EXCEPTION 'Exam has not started'; END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'No paper key for this batch'; END IF;

  RETURN encode(v_key, 'hex');
END;
$$;
REVOKE ALL ON FUNCTION public.get_paper_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_paper_key(uuid) TO anon, authenticated;

-- ----------------------------------------------------------------
-- save_responses_batch — one session check, many upserts.
-- p_responses: [{ "question_id": uuid, "selected_answer": "A" }, ...]
-- Same validation semantics as save_response.
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

  INSERT INTO public.responses (attempt_id, question_id, selected_answer, is_correct)
  SELECT p_attempt_id,
         (r->>'question_id')::uuid,
         upper(r->>'selected_answer'),
         false
  FROM jsonb_array_elements(p_responses) AS r
  WHERE upper(r->>'selected_answer') IN ('A','B','C','D')
  ON CONFLICT (attempt_id, question_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.save_responses_batch(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_responses_batch(uuid, uuid, jsonb) TO anon, authenticated;
