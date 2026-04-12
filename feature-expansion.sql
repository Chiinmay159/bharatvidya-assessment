-- ================================================================
-- BharatVidya Assessment App — Feature Expansion Migration
-- Idempotent: safe to run multiple times in Supabase SQL editor.
-- Apply BEFORE deploying the new frontend code.
-- ================================================================

-- ================================================================
-- 1.5  Roster management
-- ================================================================

CREATE TABLE IF NOT EXISTS public.roster (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  roll_number  text NOT NULL,
  student_name text NOT NULL,
  email        text NOT NULL,
  UNIQUE (batch_id, roll_number)
);

CREATE INDEX IF NOT EXISTS roster_batch_idx ON public.roster (batch_id);

ALTER TABLE public.roster ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'roster' AND policyname = 'roster_admin_all'
  ) THEN
    CREATE POLICY roster_admin_all ON public.roster
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Anon: SELECT only for active/scheduled batches
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'roster' AND policyname = 'roster_anon_select'
  ) THEN
    CREATE POLICY roster_anon_select ON public.roster
      FOR SELECT TO anon
      USING (
        EXISTS (
          SELECT 1 FROM public.batches
          WHERE batches.id = roster.batch_id
            AND batches.status IN ('scheduled', 'active')
        )
      );
  END IF;
END $$;

GRANT SELECT ON public.roster TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster TO authenticated;

-- Add email column to attempts (for roster pre-fill)
ALTER TABLE public.attempts ADD COLUMN IF NOT EXISTS email text;

-- Atomic replace_roster RPC (DELETE + INSERT in one transaction)
CREATE OR REPLACE FUNCTION public.replace_roster(
  p_batch_id uuid,
  p_rows     jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.roster WHERE batch_id = p_batch_id;
  INSERT INTO public.roster (batch_id, roll_number, student_name, email)
  SELECT
    p_batch_id,
    (r->>'roll_number')::text,
    (r->>'student_name')::text,
    (r->>'email')::text
  FROM jsonb_array_elements(p_rows) AS r;
END;
$$;

-- ================================================================
-- Update get_my_attempt RPC to return email + session_token
-- NOTE: If this fails due to signature mismatch, drop the old
-- function first: DROP FUNCTION public.get_my_attempt;
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_my_attempt(
  p_batch_id     uuid,
  p_roll_number  text,
  p_student_name text DEFAULT NULL
)
RETURNS TABLE(
  id              uuid,
  batch_id        uuid,
  roll_number     text,
  student_name    text,
  email           text,
  started_at      timestamptz,
  submitted_at    timestamptz,
  score           int,
  total_questions int,
  session_token   uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_student_name IS NOT NULL THEN
    RETURN QUERY
      SELECT a.id, a.batch_id, a.roll_number, a.student_name, a.email,
             a.started_at, a.submitted_at, a.score, a.total_questions, a.session_token
      FROM public.attempts a
      WHERE a.batch_id = p_batch_id
        AND a.roll_number = p_roll_number
        AND a.student_name = p_student_name;
  ELSE
    RETURN QUERY
      SELECT a.id, a.batch_id, a.roll_number, a.student_name, a.email,
             a.started_at, a.submitted_at, a.score, a.total_questions, a.session_token
      FROM public.attempts a
      WHERE a.batch_id = p_batch_id
        AND a.roll_number = p_roll_number;
  END IF;
END;
$$;

-- ================================================================
-- 2.1  Audit log
-- ================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  uuid,
  actor      text NOT NULL,
  details    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'audit_log_admin_all'
  ) THEN
    CREATE POLICY audit_log_admin_all ON public.audit_log
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT ON public.audit_log TO authenticated;

-- ================================================================
-- 2.2  Exam access code
-- ================================================================

ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS access_code text;

-- ================================================================
-- 3.1  Tab switch detection
-- ================================================================

CREATE TABLE IF NOT EXISTS public.tab_switches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  uuid NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  left_at     timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz
);

ALTER TABLE public.tab_switches ENABLE ROW LEVEL SECURITY;

-- Anon: INSERT + UPDATE (students record their own tab switches)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tab_switches' AND policyname = 'tab_switches_anon_write'
  ) THEN
    CREATE POLICY tab_switches_anon_write ON public.tab_switches
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Admin: SELECT for reviewing tab switch logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tab_switches' AND policyname = 'tab_switches_admin_read'
  ) THEN
    CREATE POLICY tab_switches_admin_read ON public.tab_switches
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

GRANT INSERT, UPDATE ON public.tab_switches TO anon;
GRANT SELECT ON public.tab_switches TO authenticated;

-- ================================================================
-- 3.2  Session token (concurrent session prevention)
-- ================================================================

ALTER TABLE public.attempts ADD COLUMN IF NOT EXISTS session_token uuid;
