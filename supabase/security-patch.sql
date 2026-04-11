-- ============================================================
-- BharatVidya Security Patch
-- Run in Supabase SQL Editor after migration.sql.
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- P0-A: get_exam_questions RPC
-- Returns questions for an active batch WITHOUT correct_answer.
-- Called by students instead of a direct SELECT *.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_exam_questions(p_batch_id uuid)
RETURNS TABLE(
  id            uuid,
  question_text text,
  option_a      text,
  option_b      text,
  option_c      text,
  option_d      text,
  sort_order    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT q.id, q.question_text,
         q.option_a, q.option_b, q.option_c, q.option_d,
         q.sort_order
  FROM public.questions q
  JOIN public.batches   b ON b.id = q.batch_id
  WHERE q.batch_id = p_batch_id
    AND b.status IN ('active', 'completed')   -- allow refresh after completion
  ORDER BY q.sort_order ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_exam_questions(uuid) TO anon;

-- ============================================================
-- P0-B (part 1): set_is_correct trigger
-- Computes is_correct server-side before every INSERT into responses.
-- SECURITY DEFINER so it can read correct_answer without RLS interference.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_is_correct()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_correct text;
BEGIN
  SELECT correct_answer
  INTO   v_correct
  FROM   public.questions
  WHERE  id = NEW.question_id;

  NEW.is_correct := (NEW.selected_answer = v_correct);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS responses_set_is_correct ON public.responses;
CREATE TRIGGER responses_set_is_correct
  BEFORE INSERT ON public.responses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_is_correct();

-- ============================================================
-- P0-B (part 2): submit_exam RPC
-- Counts correct responses from DB, writes score + submitted_at.
-- Replaces direct anon UPDATE on attempts.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_exam(p_attempt_id uuid)
RETURNS TABLE(score integer, total_questions integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_score       int;
  v_total       int;
  v_batch_status text;
  v_submitted   timestamptz;
BEGIN
  -- Validate: attempt must exist
  SELECT a.submitted_at, b.status
  INTO   v_submitted, v_batch_status
  FROM   public.attempts a
  JOIN   public.batches  b ON b.id = a.batch_id
  WHERE  a.id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;

  -- If already submitted, return existing result (idempotent)
  IF v_submitted IS NOT NULL THEN
    SELECT a.score, a.total_questions
    INTO   v_score, v_total
    FROM   public.attempts a
    WHERE  a.id = p_attempt_id;

    RETURN QUERY SELECT v_score, v_total;
    RETURN;
  END IF;

  -- Batch must be active or completed (grace window)
  IF v_batch_status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'Exam is not accepting submissions';
  END IF;

  -- Tally responses already stored for this attempt
  SELECT
    COUNT(*) FILTER (WHERE r.is_correct = true),
    COUNT(*)
  INTO v_score, v_total
  FROM public.responses r
  WHERE r.attempt_id = p_attempt_id;

  -- Persist result
  UPDATE public.attempts
  SET    submitted_at    = now(),
         score           = v_score,
         total_questions = v_total
  WHERE  id = p_attempt_id;

  RETURN QUERY SELECT v_score, v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_exam(uuid) TO anon;

-- ============================================================
-- P1-A: Drop anon UPDATE policy — submission now via RPC only.
-- Revoke UPDATE on attempts from anon to close the direct-write door.
-- ============================================================
DROP POLICY IF EXISTS "attempts_update_anon" ON public.attempts;
REVOKE UPDATE ON public.attempts FROM anon;

-- ============================================================
-- P1-B: Drop old 2-param overload first (avoids PostgREST ambiguity),
-- then create hardened 3-param version with optional student_name.
-- When p_student_name is provided the row is only returned if the
-- name matches (case-insensitive), preventing roll-number enumeration.
-- ============================================================
DROP FUNCTION IF EXISTS public.get_my_attempt(uuid, text);
CREATE OR REPLACE FUNCTION public.get_my_attempt(
  p_batch_id     uuid,
  p_roll_number  text,
  p_student_name text DEFAULT NULL
)
RETURNS TABLE(
  id           uuid,
  started_at   timestamptz,
  submitted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.id, a.started_at, a.submitted_at
  FROM   public.attempts a
  WHERE  a.batch_id    = p_batch_id
    AND  a.roll_number = p_roll_number
    AND  (p_student_name IS NULL
          OR lower(a.student_name) = lower(p_student_name))
  LIMIT 1
$$;

-- Re-grant to anon (function replaced, grants reset)
GRANT EXECUTE ON FUNCTION public.get_my_attempt(uuid, text, text) TO anon;

-- ============================================================
-- P2-B: replace_questions RPC — atomic question upload.
-- Wraps DELETE + bulk INSERT in a single transaction.
-- Only callable by authenticated admin (is_admin() check inside).
-- ============================================================
CREATE OR REPLACE FUNCTION public.replace_questions(
  p_batch_id  uuid,
  p_questions jsonb        -- array of question objects
)
RETURNS integer            -- number of questions inserted
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int := 0;
  v_row   jsonb;
  v_i     int  := 1;
BEGIN
  -- Guard: only admin may replace questions
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Atomic replace
  DELETE FROM public.questions WHERE batch_id = p_batch_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    INSERT INTO public.questions (
      batch_id, question_text,
      option_a, option_b, option_c, option_d,
      correct_answer, sort_order
    ) VALUES (
      p_batch_id,
      v_row->>'question_text',
      v_row->>'option_a',
      v_row->>'option_b',
      v_row->>'option_c',
      v_row->>'option_d',
      upper(v_row->>'correct_answer'),   -- normalise to A/B/C/D
      v_i
    );
    v_i     := v_i + 1;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_questions(uuid, jsonb) TO authenticated;

-- ============================================================
-- Admin DELETE on attempts (missing from original migration).
-- Responses are automatically removed via ON DELETE CASCADE.
-- ============================================================
DROP POLICY IF EXISTS "attempts_delete_admin" ON public.attempts;
CREATE POLICY "attempts_delete_admin"
  ON public.attempts FOR DELETE
  TO authenticated
  USING (public.is_admin());
