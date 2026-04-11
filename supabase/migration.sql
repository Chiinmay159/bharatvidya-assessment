-- BharatVidya Assessment App — Database Migration
-- Run this entire script in Supabase SQL Editor.
-- It is idempotent: safe to re-run.

-- ============================================================
-- HELPER FUNCTION: is_admin()
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (SELECT auth.jwt() ->> 'email') = 'chinmay@matramedia.co.in',
    false
  )
$$;

-- ============================================================
-- HELPER FUNCTION: get_server_time()
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT now()
$$;

-- ============================================================
-- TABLE: batches
-- ============================================================
CREATE TABLE IF NOT EXISTS public.batches (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text         NOT NULL,
  scheduled_start       timestamptz  NOT NULL,
  duration_minutes      integer      NOT NULL CHECK (duration_minutes > 0),
  status                text         NOT NULL DEFAULT 'draft'
                                     CHECK (status IN ('draft', 'scheduled', 'active', 'completed')),
  created_by            uuid         REFERENCES auth.users(id),
  questions_per_student integer      CHECK (questions_per_student > 0),
  created_at            timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: questions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.questions (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id       uuid    NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  question_text  text    NOT NULL,
  option_a       text    NOT NULL,
  option_b       text    NOT NULL,
  option_c       text    NOT NULL,
  option_d       text    NOT NULL,
  correct_answer text    NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  sort_order     integer NOT NULL
);

CREATE INDEX IF NOT EXISTS questions_batch_sort_idx
  ON public.questions (batch_id, sort_order);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: attempts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.attempts (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         uuid         NOT NULL REFERENCES public.batches(id),
  roll_number      text         NOT NULL,
  student_name     text         NOT NULL,
  started_at       timestamptz  NOT NULL DEFAULT now(),
  submitted_at     timestamptz,
  score            integer,
  total_questions  integer,
  UNIQUE (batch_id, roll_number)
);

ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: responses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.responses (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id       uuid    NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  question_id      uuid    NOT NULL REFERENCES public.questions(id),
  selected_answer  text    NOT NULL CHECK (selected_answer IN ('A','B','C','D')),
  is_correct       boolean NOT NULL,
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS responses_attempt_idx
  ON public.responses (attempt_id, question_id);

ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: batches
-- ============================================================
DROP POLICY IF EXISTS "batches_select_public"  ON public.batches;
DROP POLICY IF EXISTS "batches_select_admin"   ON public.batches;
DROP POLICY IF EXISTS "batches_insert_admin"   ON public.batches;
DROP POLICY IF EXISTS "batches_update_admin"   ON public.batches;
DROP POLICY IF EXISTS "batches_delete_admin"   ON public.batches;

-- Anon users see non-draft batches
CREATE POLICY "batches_select_public"
  ON public.batches FOR SELECT
  TO anon
  USING (status IN ('scheduled', 'active', 'completed'));

-- Admin sees ALL batches (including draft)
CREATE POLICY "batches_select_admin"
  ON public.batches FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "batches_insert_admin"
  ON public.batches FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "batches_update_admin"
  ON public.batches FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "batches_delete_admin"
  ON public.batches FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================================
-- RLS POLICIES: questions
-- ============================================================
DROP POLICY IF EXISTS "questions_select_active_anon" ON public.questions;
DROP POLICY IF EXISTS "questions_select_admin"       ON public.questions;
DROP POLICY IF EXISTS "questions_insert_admin"       ON public.questions;
DROP POLICY IF EXISTS "questions_update_admin"       ON public.questions;
DROP POLICY IF EXISTS "questions_delete_admin"       ON public.questions;

-- Anon: only questions from active batches
CREATE POLICY "questions_select_active_anon"
  ON public.questions FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.batches
      WHERE batches.id = questions.batch_id
        AND batches.status = 'active'
    )
  );

-- Admin: all questions
CREATE POLICY "questions_select_admin"
  ON public.questions FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "questions_insert_admin"
  ON public.questions FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "questions_update_admin"
  ON public.questions FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "questions_delete_admin"
  ON public.questions FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================================
-- RLS POLICIES: attempts
-- ============================================================
DROP POLICY IF EXISTS "attempts_select_admin"        ON public.attempts;
DROP POLICY IF EXISTS "attempts_insert_active_batch" ON public.attempts;
DROP POLICY IF EXISTS "attempts_update_anon"         ON public.attempts;
DROP POLICY IF EXISTS "attempts_update_admin"        ON public.attempts;

-- Admin reads all attempts
CREATE POLICY "attempts_select_admin"
  ON public.attempts FOR SELECT
  TO authenticated
  USING (is_admin());

-- Anon inserts only for active batches
CREATE POLICY "attempts_insert_active_batch"
  ON public.attempts FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.batches
      WHERE batches.id = attempts.batch_id
        AND batches.status = 'active'
    )
  );

-- Anon can update own attempt (submission only — unsubmitted, active batch)
CREATE POLICY "attempts_update_anon"
  ON public.attempts FOR UPDATE
  TO anon
  USING (
    submitted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.batches
      WHERE batches.id = attempts.batch_id
        AND batches.status = 'active'
    )
  )
  WITH CHECK (submitted_at IS NOT NULL);

-- Admin can update any attempt
CREATE POLICY "attempts_update_admin"
  ON public.attempts FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- TRIGGER: Prevent anon from modifying protected attempt columns
-- ============================================================
CREATE OR REPLACE FUNCTION public.restrict_attempt_update_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'anon'
     OR (
       current_setting('request.jwt.claims', true) IS NULL
       OR current_setting('request.jwt.claims', true) = ''
     )
  THEN
    IF NEW.batch_id IS DISTINCT FROM OLD.batch_id
       OR NEW.roll_number IS DISTINCT FROM OLD.roll_number
       OR NEW.student_name IS DISTINCT FROM OLD.student_name
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
    THEN
      RAISE EXCEPTION 'Cannot modify protected attempt columns';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attempts_restrict_columns ON public.attempts;
CREATE TRIGGER attempts_restrict_columns
  BEFORE UPDATE ON public.attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_attempt_update_columns();

-- ============================================================
-- RLS POLICIES: responses
-- ============================================================
DROP POLICY IF EXISTS "responses_select_admin" ON public.responses;
DROP POLICY IF EXISTS "responses_insert_anon"  ON public.responses;

CREATE POLICY "responses_select_admin"
  ON public.responses FOR SELECT
  TO authenticated
  USING (is_admin());

-- Anon can insert only for unsubmitted attempts
CREATE POLICY "responses_insert_anon"
  ON public.responses FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.attempts a
      WHERE a.id = responses.attempt_id
        AND a.submitted_at IS NULL
    )
  );

-- ============================================================
-- RPC: get_my_attempt — student refresh recovery
-- Returns attempt info for a roll_number + batch combo (no RLS bypass needed for admin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_attempt(
  p_batch_id    uuid,
  p_roll_number text
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
  FROM public.attempts a
  WHERE a.batch_id = p_batch_id
    AND a.roll_number = p_roll_number
  LIMIT 1
$$;

-- ============================================================
-- RPC: get_my_responses — student refresh recovery (answered questions)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_responses(p_attempt_id uuid)
RETURNS TABLE(
  question_id     uuid,
  selected_answer text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.question_id, r.selected_answer
  FROM public.responses r
  JOIN public.attempts a ON a.id = r.attempt_id
  WHERE r.attempt_id = p_attempt_id
    AND a.submitted_at IS NULL
$$;

-- ============================================================
-- Table-level grants for anon (students, unauthenticated)
-- IMPORTANT: RLS policies alone are not enough — PostgreSQL also
-- requires explicit DML grants. Without these, RLS returns a
-- misleading "violates row-level security policy" error instead
-- of "permission denied".
-- ============================================================

-- Students read batches (to browse exam list + RLS subquery eval)
GRANT SELECT ON public.batches   TO anon;

-- Students read questions (only active batches, enforced by RLS)
GRANT SELECT ON public.questions TO anon;

-- Students create an attempt and update it on submission
GRANT INSERT, UPDATE ON public.attempts  TO anon;

-- Students insert one response per answered question
GRANT INSERT          ON public.responses TO anon;

-- Admin (authenticated) gets full access — RLS further restricts to is_admin()
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batches   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attempts  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responses TO authenticated;

-- ============================================================
-- Grant execute on RPCs to anon.
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_my_attempt(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_my_responses(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_server_time() TO anon;
