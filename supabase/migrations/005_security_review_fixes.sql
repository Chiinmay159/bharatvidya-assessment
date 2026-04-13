-- ================================================================
-- Migration 005: Security review fixes
-- ================================================================
-- Addresses P0/P1/P2 issues from peer review:
--   P0-1  Answer-key leak via direct questions SELECT
--   P0-2  Anonymous attempt enumeration
--   P0-3  Score tampering via duplicate/injected responses
--   P1-1  Access-code fails open (missing verify_access_code RPC)
--   P1-2  Duplicate attempts (missing unique constraint)
--   P2-1  Tab-switch UPDATE policy missing
--
-- IMPORTANT: Apply this migration BEFORE deploying the matching
-- frontend commit. The frontend switches to create_attempt and
-- verify_access_code RPCs that must exist first.
-- ================================================================

BEGIN;

-- ============================================================
-- 0. Helper: attempt_is_open (SECURITY DEFINER)
-- Used by RLS policies so they don't depend on anon SELECT
-- on the attempts table.
-- ============================================================
CREATE OR REPLACE FUNCTION public.attempt_is_open(p_attempt_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.attempts a
    JOIN public.batches b ON b.id = a.batch_id
    WHERE a.id = p_attempt_id
      AND a.submitted_at IS NULL
      AND b.status = 'active'
  )
$$;
REVOKE ALL ON FUNCTION public.attempt_is_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attempt_is_open(uuid) TO anon, authenticated;


-- ============================================================
-- 1. P0-1: Close answer-key leak
-- Remove anon SELECT on questions; students use get_exam_questions
-- RPC which is SECURITY DEFINER and strips correct_answer.
-- ============================================================
DROP POLICY IF EXISTS questions_select_active      ON public.questions;
DROP POLICY IF EXISTS questions_select_active_anon  ON public.questions;


-- ============================================================
-- 2. P0-2: Close attempt enumeration + direct INSERT
-- Replace broad anon SELECT/INSERT with a SECURITY DEFINER RPC.
-- ============================================================
DROP POLICY IF EXISTS attempts_select_anon          ON public.attempts;
DROP POLICY IF EXISTS attempts_insert_active_batch  ON public.attempts;

-- create_attempt: server-side attempt creation with access-code
-- enforcement and unique-violation handling
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
  v_id     uuid;
  v_status text;
  v_code   text;
BEGIN
  SELECT status, access_code INTO v_status, v_code
  FROM public.batches WHERE id = p_batch_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;
  IF v_status != 'active' THEN
    RAISE EXCEPTION 'Batch is not active';
  END IF;

  -- P1-1: enforce access code server-side
  IF v_code IS NOT NULL AND v_code != '' THEN
    IF p_access_code IS NULL OR upper(p_access_code) != upper(v_code) THEN
      RAISE EXCEPTION 'Invalid access code';
    END IF;
  END IF;

  INSERT INTO public.attempts (batch_id, roll_number, student_name, email)
  VALUES (p_batch_id, p_roll_number, p_student_name, p_email)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_attempt(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_attempt(uuid, text, text, text, text) TO anon, authenticated;


-- ============================================================
-- 3. P0-3: Close response injection / score tampering
-- ============================================================
-- Remove the overly-broad WITH CHECK (true) policy
DROP POLICY IF EXISTS responses_insert_active ON public.responses;
DROP POLICY IF EXISTS responses_insert_anon   ON public.responses;

-- Replacement: scoped to open attempts via SECURITY DEFINER helper
CREATE POLICY responses_insert_anon ON public.responses
  FOR INSERT TO anon
  WITH CHECK (public.attempt_is_open(attempt_id));

-- Deduplicate existing responses before adding unique constraint
-- (keep the latest response per attempt+question)
DELETE FROM public.responses r1
WHERE r1.id NOT IN (
  SELECT DISTINCT ON (r2.attempt_id, r2.question_id) r2.id
  FROM public.responses r2
  ORDER BY r2.attempt_id, r2.question_id, r2.id DESC
);

ALTER TABLE public.responses
  ADD CONSTRAINT responses_attempt_question_unique
  UNIQUE (attempt_id, question_id);


-- ============================================================
-- 4. P1-2: Prevent duplicate attempts via unique constraint
-- ============================================================
-- Remove child rows for duplicate attempts first (FK safety)
WITH dupes AS (
  SELECT a.id FROM public.attempts a
  WHERE EXISTS (
    SELECT 1 FROM public.attempts a2
    WHERE a2.batch_id    = a.batch_id
      AND a2.roll_number = a.roll_number
      AND (a2.started_at, a2.id) < (a.started_at, a.id)
  )
)
DELETE FROM public.responses WHERE attempt_id IN (SELECT id FROM dupes);

WITH dupes AS (
  SELECT a.id FROM public.attempts a
  WHERE EXISTS (
    SELECT 1 FROM public.attempts a2
    WHERE a2.batch_id    = a.batch_id
      AND a2.roll_number = a.roll_number
      AND (a2.started_at, a2.id) < (a.started_at, a.id)
  )
)
DELETE FROM public.tab_switches WHERE attempt_id IN (SELECT id FROM dupes);

DELETE FROM public.attempts a
WHERE EXISTS (
  SELECT 1 FROM public.attempts a2
  WHERE a2.batch_id    = a.batch_id
    AND a2.roll_number = a.roll_number
    AND (a2.started_at, a2.id) < (a.started_at, a.id)
);

ALTER TABLE public.attempts
  ADD CONSTRAINT attempts_batch_roll_unique
  UNIQUE (batch_id, roll_number);


-- ============================================================
-- 5. P1-1: verify_access_code RPC
-- Returns whether a code is required and whether it matches.
-- ============================================================
CREATE OR REPLACE FUNCTION public.verify_access_code(
  p_batch_id    uuid,
  p_access_code text
)
RETURNS TABLE (required boolean, valid boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (b.access_code IS NOT NULL AND b.access_code != '') AS required,
    (b.access_code IS NOT NULL AND b.access_code != ''
     AND upper(b.access_code) = upper(p_access_code))   AS valid
  FROM public.batches b
  WHERE b.id = p_batch_id
    AND b.status IN ('scheduled', 'active')
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.verify_access_code(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_access_code(uuid, text) TO anon, authenticated;


-- ============================================================
-- 6. P0-2 cont.: Tighten get_my_responses ownership check
-- Old signature (uuid) is replaced with (uuid, text, text).
-- ============================================================
DROP FUNCTION IF EXISTS public.get_my_responses(uuid);

CREATE OR REPLACE FUNCTION public.get_my_responses(
  p_attempt_id   uuid,
  p_roll_number  text,
  p_student_name text
)
RETURNS TABLE (question_id uuid, selected_answer text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.question_id, r.selected_answer
  FROM public.responses r
  JOIN public.attempts a ON a.id = r.attempt_id
  WHERE r.attempt_id   = p_attempt_id
    AND a.roll_number   = p_roll_number
    AND a.student_name  = p_student_name
    AND a.submitted_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.get_my_responses(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_responses(uuid, text, text) TO anon, authenticated;


-- ============================================================
-- 7. P2-1: Tab-switch policies (use helper + add UPDATE)
-- ============================================================
DROP POLICY IF EXISTS tab_switches_anon_insert ON public.tab_switches;
DROP POLICY IF EXISTS tab_switches_anon_select ON public.tab_switches;

CREATE POLICY tab_switches_anon_insert ON public.tab_switches
  FOR INSERT TO anon
  WITH CHECK (public.attempt_is_open(attempt_id));

CREATE POLICY tab_switches_anon_select ON public.tab_switches
  FOR SELECT TO anon
  USING (public.attempt_is_open(attempt_id));

CREATE POLICY tab_switches_anon_update ON public.tab_switches
  FOR UPDATE TO anon
  USING  (public.attempt_is_open(attempt_id))
  WITH CHECK (public.attempt_is_open(attempt_id));

COMMIT;
