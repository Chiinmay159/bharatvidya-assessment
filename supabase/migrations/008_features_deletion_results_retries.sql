-- ================================================================
-- Migration 008: Batch Deletion, Result Disclosure, Retries
-- ================================================================
-- Features:
--   1. delete_batch RPC (admin cascade delete with audit log)
--   2. show_results column on batches (admin controls result visibility)
--   3. pass_percentage + max_attempts columns on batches
--   4. attempt_number column on attempts (supports multi-attempt retries)
--   5. Relaxed UNIQUE constraint: (batch_id, roll_number, attempt_number)
--   6. Updated create_attempt (enforces max_attempts, sets attempt_number)
--   7. Updated get_my_attempt (returns attempt_number, ordered DESC)
--   8. Updated submit_exam (conditionally hides results, returns retry info)
--   9. Updated protect_active_batch trigger (locks new columns)
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. New columns on batches
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS show_results    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pass_percentage int CHECK (pass_percentage >= 1 AND pass_percentage <= 100),
  ADD COLUMN IF NOT EXISTS max_attempts    int NOT NULL DEFAULT 1 CHECK (max_attempts >= 1);

-- Grant anon SELECT on new columns (additive, doesn't touch existing grants)
GRANT SELECT (show_results, pass_percentage, max_attempts) ON public.batches TO anon;


-- ────────────────────────────────────────────────────────────────
-- 2. attempt_number on attempts
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS attempt_number int NOT NULL DEFAULT 1;

-- Relax UNIQUE: (batch_id, roll_number) → (batch_id, roll_number, attempt_number)
ALTER TABLE public.attempts DROP CONSTRAINT IF EXISTS attempts_batch_roll_unique;
ALTER TABLE public.attempts ADD CONSTRAINT attempts_batch_roll_attempt_unique
  UNIQUE (batch_id, roll_number, attempt_number);


-- ────────────────────────────────────────────────────────────────
-- 3. delete_batch RPC (admin cascade with audit log)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_batch(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT name INTO v_name FROM public.batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  -- Audit log BEFORE cascade (batch still exists for context)
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES (
    'batch_deleted', 'batch', p_batch_id,
    coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'unknown'),
    jsonb_build_object('batch_name', v_name)
  );

  -- Cascade in dependency order
  DELETE FROM public.tab_switches WHERE attempt_id IN (
    SELECT id FROM public.attempts WHERE batch_id = p_batch_id
  );
  DELETE FROM public.responses WHERE attempt_id IN (
    SELECT id FROM public.attempts WHERE batch_id = p_batch_id
  );
  DELETE FROM public.attempts  WHERE batch_id = p_batch_id;
  DELETE FROM public.questions WHERE batch_id = p_batch_id;
  DELETE FROM public.roster    WHERE batch_id = p_batch_id;
  DELETE FROM public.batches   WHERE id = p_batch_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_batch(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 4. Updated create_attempt (enforces max_attempts, sets attempt_number)
-- ────────────────────────────────────────────────────────────────
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
BEGIN
  SELECT status, access_code, max_attempts
  INTO   v_status, v_code, v_max_attempts
  FROM   public.batches WHERE id = p_batch_id;

  IF v_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_status != 'active' THEN RAISE EXCEPTION 'Batch is not active'; END IF;

  IF v_code IS NOT NULL AND v_code != '' THEN
    IF p_access_code IS NULL OR upper(p_access_code) != upper(v_code) THEN
      RAISE EXCEPTION 'Invalid access code';
    END IF;
  END IF;

  -- Count existing attempts (submitted or not) for this student
  SELECT COUNT(*) INTO v_existing_count
  FROM public.attempts
  WHERE batch_id = p_batch_id AND roll_number = p_roll_number;

  v_next_attempt := v_existing_count + 1;

  IF v_next_attempt > v_max_attempts THEN
    RAISE EXCEPTION 'Maximum attempts reached for this exam';
  END IF;

  INSERT INTO public.attempts (batch_id, roll_number, student_name, email, attempt_number)
  VALUES (p_batch_id, p_roll_number, p_student_name, p_email, v_next_attempt)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
-- Signature unchanged (uuid, text, text, text, text) → no DROP needed


-- ────────────────────────────────────────────────────────────────
-- 5. Updated get_my_attempt (adds attempt_number, ordered DESC)
-- ────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_my_attempt(uuid, text, text);

CREATE OR REPLACE FUNCTION public.get_my_attempt(
  p_batch_id     uuid,
  p_roll_number  text,
  p_student_name text
)
RETURNS TABLE (
  id              uuid,
  batch_id        uuid,
  roll_number     text,
  student_name    text,
  email           text,
  started_at      timestamptz,
  submitted_at    timestamptz,
  score           int,
  total_questions int,
  attempt_number  int
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.batch_id, a.roll_number, a.student_name, a.email,
         a.started_at, a.submitted_at, a.score, a.total_questions,
         a.attempt_number
  FROM public.attempts a
  WHERE a.batch_id = p_batch_id
    AND a.roll_number = p_roll_number
    AND a.student_name = p_student_name
  ORDER BY a.attempt_number DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_attempt(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_attempt(uuid, text, text) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────────
-- 6. Updated submit_exam (conditionally hides results, returns retry info)
-- ────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.submit_exam(uuid, uuid);

CREATE OR REPLACE FUNCTION public.submit_exam(
  p_attempt_id    uuid,
  p_session_token uuid DEFAULT NULL
)
RETURNS TABLE (
  score           int,
  total_questions int,
  show_results    boolean,
  pass_percentage int,
  attempt_number  int,
  max_attempts    int,
  can_retry       boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_score          int;
  v_total          int;
  v_batch_status   text;
  v_submitted      timestamptz;
  v_session        uuid;
  v_show_results   boolean;
  v_pass_pct       int;
  v_attempt_num    int;
  v_max_attempts   int;
  v_batch_id       uuid;
  v_pct            int;
  v_can_retry      boolean;
BEGIN
  SELECT a.submitted_at, b.status, a.session_token,
         b.show_results, b.pass_percentage, a.attempt_number,
         b.max_attempts, a.batch_id
  INTO   v_submitted, v_batch_status, v_session,
         v_show_results, v_pass_pct, v_attempt_num,
         v_max_attempts, v_batch_id
  FROM   public.attempts a
  JOIN   public.batches  b ON b.id = a.batch_id
  WHERE  a.id = p_attempt_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;

  -- Already submitted → return existing data (idempotent)
  IF v_submitted IS NOT NULL THEN
    SELECT a.score, a.total_questions INTO v_score, v_total
    FROM public.attempts a WHERE a.id = p_attempt_id;

    v_pct := CASE WHEN v_total > 0 THEN round((v_score::numeric / v_total) * 100) ELSE 0 END;
    v_can_retry := (
      v_attempt_num < v_max_attempts
      AND v_pass_pct IS NOT NULL
      AND v_pct < v_pass_pct
      AND v_batch_status = 'active'
    );

    RETURN QUERY SELECT
      CASE WHEN v_show_results THEN v_score ELSE NULL::int END,
      v_total,
      v_show_results,
      v_pass_pct,
      v_attempt_num,
      v_max_attempts,
      v_can_retry;
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

  v_pct := CASE WHEN v_total > 0 THEN round((v_score::numeric / v_total) * 100) ELSE 0 END;
  v_can_retry := (
    v_attempt_num < v_max_attempts
    AND v_pass_pct IS NOT NULL
    AND v_pct < v_pass_pct
    AND v_batch_status = 'active'
  );

  RETURN QUERY SELECT
    CASE WHEN v_show_results THEN v_score ELSE NULL::int END,
    v_total,
    v_show_results,
    v_pass_pct,
    v_attempt_num,
    v_max_attempts,
    v_can_retry;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_exam(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_exam(uuid, uuid) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────────
-- 7. Updated protect_active_batch trigger
--    Locks pass_percentage + max_attempts; show_results stays editable.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_active_batch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('active', 'completed') THEN
    IF NEW.scheduled_start IS DISTINCT FROM OLD.scheduled_start
       OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       OR NEW.access_code IS DISTINCT FROM OLD.access_code
       OR NEW.questions_per_student IS DISTINCT FROM OLD.questions_per_student
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.pass_percentage IS DISTINCT FROM OLD.pass_percentage
       OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
    THEN
      RAISE EXCEPTION 'Cannot modify batch details while status is %', OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
