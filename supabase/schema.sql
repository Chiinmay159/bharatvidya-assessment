-- ================================================================
-- BharatVidya Assessment Platform — Authoritative Schema
-- ================================================================
-- This is the single source of truth for the database schema.
-- Apply this to a fresh Supabase project to get the full schema.
--
-- Migration history (applied to live project msbpnpjjigheoplfnuly):
--   1. feature_expansion_v1  (2026-04-12) — tables, RPCs, base policies
--   2. security_hardening_v1 (2026-04-13) — RLS fixes, verify_roster_entry
--   3. lock_active_batch_edits (2026-04-13) — protect_active_batch trigger
--
-- Minimum frontend version: commit 42abb76 or later
-- ================================================================


-- ================================================================
-- 0. Helper: is_admin()
-- ================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY INVOKER
AS $$
  SELECT coalesce(
    (SELECT auth.jwt() ->> 'email') = 'chinmay@matramedia.co.in',
    false
  )
$$;


-- ================================================================
-- 1. TABLES
-- ================================================================

-- 1.1 Batches
CREATE TABLE IF NOT EXISTS public.batches (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  scheduled_start      timestamptz NOT NULL,
  duration_minutes     int NOT NULL CHECK (duration_minutes > 0),
  status               text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','scheduled','active','completed')),
  created_by           uuid REFERENCES auth.users(id),
  questions_per_student int CHECK (questions_per_student > 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  access_code          text
);
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

-- 1.2 Questions
CREATE TABLE IF NOT EXISTS public.questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid NOT NULL REFERENCES public.batches(id),
  question_text   text NOT NULL,
  option_a        text NOT NULL,
  option_b        text NOT NULL,
  option_c        text NOT NULL,
  option_d        text NOT NULL,
  correct_answer  text NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  sort_order      int NOT NULL
);
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- 1.3 Attempts
CREATE TABLE IF NOT EXISTS public.attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid NOT NULL REFERENCES public.batches(id),
  roll_number     text NOT NULL,
  student_name    text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  submitted_at    timestamptz,
  score           int,
  total_questions int,
  email           text,
  session_token   uuid
);
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

-- 1.4 Responses
CREATE TABLE IF NOT EXISTS public.responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      uuid NOT NULL REFERENCES public.attempts(id),
  question_id     uuid NOT NULL REFERENCES public.questions(id),
  selected_answer text NOT NULL CHECK (selected_answer IN ('A','B','C','D')),
  is_correct      boolean NOT NULL
);
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- 1.5 Roster
CREATE TABLE IF NOT EXISTS public.roster (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     uuid NOT NULL REFERENCES public.batches(id),
  roll_number  text NOT NULL,
  student_name text NOT NULL,
  email        text NOT NULL
);
ALTER TABLE public.roster ENABLE ROW LEVEL SECURITY;

-- 1.6 Audit log
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

-- 1.7 Tab switches
CREATE TABLE IF NOT EXISTS public.tab_switches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  uuid NOT NULL REFERENCES public.attempts(id),
  left_at     timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz
);
ALTER TABLE public.tab_switches ENABLE ROW LEVEL SECURITY;


-- ================================================================
-- 2. RLS POLICIES
-- ================================================================

-- 2.1 Batches
CREATE POLICY batches_select_public ON public.batches
  FOR SELECT TO anon
  USING (status IN ('scheduled','active','completed'));

CREATE POLICY batches_select_admin ON public.batches
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY batches_insert_admin ON public.batches
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY batches_update_admin ON public.batches
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY batches_delete_admin ON public.batches
  FOR DELETE TO authenticated USING (is_admin());

-- 2.2 Questions
CREATE POLICY questions_select_active ON public.questions
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM batches WHERE batches.id = questions.batch_id AND batches.status = 'active'));
CREATE POLICY questions_select_active_anon ON public.questions
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM batches WHERE batches.id = questions.batch_id AND batches.status = 'active'));

CREATE POLICY questions_select_admin ON public.questions
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY questions_insert_admin ON public.questions
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY questions_update_admin ON public.questions
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY questions_delete_admin ON public.questions
  FOR DELETE TO authenticated USING (is_admin());

-- 2.3 Attempts
CREATE POLICY attempts_select_anon ON public.attempts
  FOR SELECT TO anon USING (true);
CREATE POLICY attempts_insert_active_batch ON public.attempts
  FOR INSERT TO anon
  WITH CHECK (EXISTS (SELECT 1 FROM batches b WHERE b.id = attempts.batch_id AND b.status = 'active'));

CREATE POLICY attempts_select_admin ON public.attempts
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY attempts_update_admin ON public.attempts
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY attempts_delete_admin ON public.attempts
  FOR DELETE TO authenticated USING (is_admin());

-- 2.4 Responses
CREATE POLICY responses_insert_active ON public.responses
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY responses_insert_anon ON public.responses
  FOR INSERT TO anon
  WITH CHECK (EXISTS (SELECT 1 FROM attempts a WHERE a.id = responses.attempt_id AND a.submitted_at IS NULL));
CREATE POLICY responses_select_admin ON public.responses
  FOR SELECT TO authenticated USING (is_admin());

-- 2.5 Roster (NO anon SELECT — use verify_roster_entry RPC instead)
CREATE POLICY roster_admin_select ON public.roster
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY roster_admin_insert ON public.roster
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY roster_admin_update ON public.roster
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY roster_admin_delete ON public.roster
  FOR DELETE TO authenticated USING (is_admin());

-- 2.6 Audit log (admin only)
CREATE POLICY audit_log_admin_select ON public.audit_log
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY audit_log_admin_insert ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (is_admin());

-- 2.7 Tab switches
CREATE POLICY tab_switches_anon_insert ON public.tab_switches
  FOR INSERT TO anon
  WITH CHECK (EXISTS (SELECT 1 FROM attempts a WHERE a.id = tab_switches.attempt_id AND a.submitted_at IS NULL));
CREATE POLICY tab_switches_anon_select ON public.tab_switches
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM attempts a WHERE a.id = tab_switches.attempt_id AND a.submitted_at IS NULL));
CREATE POLICY tab_switches_admin_read ON public.tab_switches
  FOR SELECT TO authenticated USING (true);


-- ================================================================
-- 3. TRIGGERS
-- ================================================================

-- 3.1 Auto-compute is_correct on response insert
CREATE OR REPLACE FUNCTION public.set_is_correct()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_correct text;
BEGIN
  SELECT correct_answer INTO v_correct FROM public.questions WHERE id = NEW.question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found: %', NEW.question_id; END IF;
  NEW.is_correct := (NEW.selected_answer = v_correct);
  RETURN NEW;
END;
$$;
CREATE TRIGGER responses_set_is_correct
  BEFORE INSERT ON public.responses
  FOR EACH ROW EXECUTE FUNCTION set_is_correct();

-- 3.2 Protect attempt columns from anon tampering
CREATE OR REPLACE FUNCTION public.restrict_attempt_update_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'anon'
     OR (current_setting('request.jwt.claims', true) IS NULL
         OR current_setting('request.jwt.claims', true) = '')
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
CREATE TRIGGER attempts_restrict_columns
  BEFORE UPDATE ON public.attempts
  FOR EACH ROW EXECUTE FUNCTION restrict_attempt_update_columns();

-- 3.3 Prevent modifying active/completed batch details
CREATE OR REPLACE FUNCTION public.protect_active_batch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('active', 'completed') THEN
    IF NEW.scheduled_start IS DISTINCT FROM OLD.scheduled_start
       OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       OR NEW.access_code IS DISTINCT FROM OLD.access_code
       OR NEW.questions_per_student IS DISTINCT FROM OLD.questions_per_student
       OR NEW.name IS DISTINCT FROM OLD.name
    THEN
      RAISE EXCEPTION 'Cannot modify batch details while status is %', OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER batches_protect_active
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION protect_active_batch();


-- ================================================================
-- 4. RPCs (Security Definer unless noted)
-- ================================================================

-- 4.1 Get server time (Invoker — no elevated access needed)
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS timestamptz LANGUAGE sql SECURITY INVOKER AS $$
  SELECT now()
$$;

-- 4.2 Get exam questions (strips correct_answer)
CREATE OR REPLACE FUNCTION public.get_exam_questions(p_batch_id uuid)
RETURNS TABLE (
  id            uuid,
  question_text text,
  option_a      text,
  option_b      text,
  option_c      text,
  option_d      text,
  sort_order    int
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT q.id, q.question_text,
         q.option_a, q.option_b, q.option_c, q.option_d,
         q.sort_order
  FROM public.questions q
  JOIN public.batches   b ON b.id = q.batch_id
  WHERE q.batch_id = p_batch_id
    AND b.status IN ('active', 'completed')
  ORDER BY q.sort_order ASC
$$;

-- 4.3 Get student's own attempt (no session_token exposed)
CREATE OR REPLACE FUNCTION public.get_my_attempt(
  p_batch_id     uuid,
  p_roll_number  text,
  p_student_name text DEFAULT NULL
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
  total_questions int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_student_name IS NOT NULL THEN
    RETURN QUERY
      SELECT a.id, a.batch_id, a.roll_number, a.student_name, a.email,
             a.started_at, a.submitted_at, a.score, a.total_questions
      FROM public.attempts a
      WHERE a.batch_id = p_batch_id
        AND a.roll_number = p_roll_number
        AND a.student_name = p_student_name;
  ELSE
    RETURN QUERY
      SELECT a.id, a.batch_id, a.roll_number, a.student_name, a.email,
             a.started_at, a.submitted_at, a.score, a.total_questions
      FROM public.attempts a
      WHERE a.batch_id = p_batch_id
        AND a.roll_number = p_roll_number;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_attempt(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_attempt(uuid, text, text) TO anon, authenticated;

-- 4.4 Get student's saved responses (for refresh recovery)
CREATE OR REPLACE FUNCTION public.get_my_responses(p_attempt_id uuid)
RETURNS TABLE (question_id uuid, selected_answer text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.question_id, r.selected_answer
  FROM public.responses r
  JOIN public.attempts a ON a.id = r.attempt_id
  WHERE r.attempt_id = p_attempt_id
    AND a.submitted_at IS NULL
$$;

-- 4.5 Submit exam (server-side scoring)
CREATE OR REPLACE FUNCTION public.submit_exam(p_attempt_id uuid)
RETURNS TABLE (score int, total_questions int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_score        int;
  v_total        int;
  v_batch_status text;
  v_submitted    timestamptz;
BEGIN
  SELECT a.submitted_at, b.status
  INTO   v_submitted, v_batch_status
  FROM   public.attempts a
  JOIN   public.batches  b ON b.id = a.batch_id
  WHERE  a.id = p_attempt_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;

  IF v_submitted IS NOT NULL THEN
    SELECT a.score, a.total_questions INTO v_score, v_total
    FROM public.attempts a WHERE a.id = p_attempt_id;
    RETURN QUERY SELECT v_score, v_total;
    RETURN;
  END IF;

  IF v_batch_status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'Exam is not accepting submissions';
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

-- 4.6 Replace questions (admin-only bulk upload)
CREATE OR REPLACE FUNCTION public.replace_questions(p_batch_id uuid, p_questions jsonb)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_row   jsonb;
  v_i     int  := 1;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  DELETE FROM public.questions WHERE batch_id = p_batch_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    INSERT INTO public.questions (
      batch_id, question_text, option_a, option_b, option_c, option_d,
      correct_answer, sort_order
    ) VALUES (
      p_batch_id, v_row->>'question_text',
      v_row->>'option_a', v_row->>'option_b', v_row->>'option_c', v_row->>'option_d',
      upper(v_row->>'correct_answer'), v_i
    );
    v_i     := v_i + 1;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 4.7 Replace roster (admin-only, guarded)
CREATE OR REPLACE FUNCTION public.replace_roster(p_batch_id uuid, p_rows jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  DELETE FROM public.roster WHERE batch_id = p_batch_id;
  INSERT INTO public.roster (batch_id, roll_number, student_name, email)
  SELECT p_batch_id, (r->>'roll_number')::text, (r->>'student_name')::text, (r->>'email')::text
  FROM jsonb_array_elements(p_rows) AS r;
END;
$$;

-- 4.8 Verify roster entry (anon-safe — returns only the caller's own row)
CREATE OR REPLACE FUNCTION public.verify_roster_entry(p_batch_id uuid, p_roll_number text)
RETURNS TABLE (student_name text, email text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.student_name, r.email
  FROM public.roster r
  JOIN public.batches b ON b.id = r.batch_id
  WHERE r.batch_id    = p_batch_id
    AND r.roll_number = p_roll_number
    AND b.status IN ('scheduled', 'active')
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.verify_roster_entry(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_roster_entry(uuid, text) TO anon, authenticated;

-- 4.9 Check roster access for batch filtering (anon-safe — no PII exposed)
CREATE OR REPLACE FUNCTION public.check_roster_access(p_batch_ids uuid[], p_roll_number text DEFAULT NULL)
RETURNS TABLE (batch_id uuid, has_roster boolean, student_in_roster boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    b.id AS batch_id,
    EXISTS(SELECT 1 FROM public.roster r WHERE r.batch_id = b.id) AS has_roster,
    CASE
      WHEN p_roll_number IS NULL THEN false
      ELSE EXISTS(SELECT 1 FROM public.roster r WHERE r.batch_id = b.id AND r.roll_number = p_roll_number)
    END AS student_in_roster
  FROM public.batches b
  WHERE b.id = ANY(p_batch_ids)
    AND b.status IN ('scheduled', 'active');
$$;
REVOKE ALL ON FUNCTION public.check_roster_access(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_roster_access(uuid[], text) TO anon, authenticated;
