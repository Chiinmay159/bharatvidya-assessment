-- ================================================================
-- BharatVidya Assessment Platform — Authoritative Schema
-- ================================================================
-- This is the single source of truth for the database schema.
-- Apply this to a fresh Supabase project to get the full schema.
--
-- Migration history (applied to live project msbpnpjjigheoplfnuly):
--   1. feature_expansion_v1      (2026-04-12) — tables, RPCs, base policies
--   2. security_hardening_v1     (2026-04-13) — RLS fixes, verify_roster_entry
--   3. lock_active_batch_edits   (2026-04-13) — protect_active_batch trigger
--   4. tighten_rls_and_grants    (2026-04-13) — scope anon attempts, require
--      student_name in get_my_attempt, explicit execute grants on all RPCs
--   5. security_review_fixes     (2026-04-13) — close answer-key leak,
--      attempt enumeration, response injection, access-code enforcement,
--      unique constraints, tab-switch UPDATE, ownership on get_my_responses
--   6. security_findings_round2  (2026-04-13) — column-level REVOKE on
--      access_code, has_access_code generated column, session-token
--      enforcement via claim_session/check_session RPCs
--   7. authoritative_session_enforcement (2026-04-13) — save_response
--      RPC replaces anon INSERT on responses (validates session token),
--      submit_exam gains session-token validation, anon INSERT policy
--      on responses dropped
--   8. features_deletion_results_retries (2026-04-13) — delete_batch RPC,
--      show_results/pass_percentage/max_attempts columns, attempt_number,
--      relaxed UNIQUE constraint, updated create_attempt/submit_exam/
--      get_my_attempt for retry support, protect_active_batch updated
--   9. fix_delete_cascade_and_retry_alignment (2026-04-13) — delete_attempt
--      and reset_batch_attempts RPCs (FK-safe cascade for admin delete/reset)
--
-- Minimum frontend version: commit after 009 migration
-- ================================================================


-- ================================================================
-- 0. Helpers
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
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- Used by RLS policies so they don't depend on anon SELECT on attempts
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
  access_code          text,
  has_access_code      boolean GENERATED ALWAYS AS (access_code IS NOT NULL AND access_code != '') STORED,
  show_results         boolean NOT NULL DEFAULT true,
  pass_percentage      int CHECK (pass_percentage >= 1 AND pass_percentage <= 100),
  max_attempts         int NOT NULL DEFAULT 1 CHECK (max_attempts >= 1)
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
  session_token   uuid,
  attempt_number  int NOT NULL DEFAULT 1,
  CONSTRAINT attempts_batch_roll_attempt_unique UNIQUE (batch_id, roll_number, attempt_number)
);
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

-- 1.4 Responses
CREATE TABLE IF NOT EXISTS public.responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      uuid NOT NULL REFERENCES public.attempts(id),
  question_id     uuid NOT NULL REFERENCES public.questions(id),
  selected_answer text NOT NULL CHECK (selected_answer IN ('A','B','C','D')),
  is_correct      boolean NOT NULL,
  CONSTRAINT responses_attempt_question_unique UNIQUE (attempt_id, question_id)
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
-- Column-level grant: anon can SELECT all columns EXCEPT access_code
REVOKE ALL ON public.batches FROM anon;
GRANT SELECT (
  id, name, scheduled_start, duration_minutes, status,
  created_by, questions_per_student, created_at, has_access_code,
  show_results, pass_percentage, max_attempts
) ON public.batches TO anon;

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

-- 2.2 Questions — NO anon SELECT (use get_exam_questions RPC)
CREATE POLICY questions_select_admin ON public.questions
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY questions_insert_admin ON public.questions
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY questions_update_admin ON public.questions
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY questions_delete_admin ON public.questions
  FOR DELETE TO authenticated USING (is_admin());

-- 2.3 Attempts — NO anon SELECT/INSERT (use create_attempt / get_my_attempt RPCs)
CREATE POLICY attempts_select_admin ON public.attempts
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY attempts_update_admin ON public.attempts
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY attempts_delete_admin ON public.attempts
  FOR DELETE TO authenticated USING (is_admin());

-- 2.4 Responses — NO anon INSERT (use save_response RPC with session-token validation)
CREATE POLICY responses_select_admin ON public.responses
  FOR SELECT TO authenticated USING (is_admin());

-- 2.5 Roster (NO anon access — use verify_roster_entry / check_roster_access RPCs)
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

-- 2.7 Tab switches — scoped via attempt_is_open helper
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
CREATE POLICY tab_switches_admin_read ON public.tab_switches
  FOR SELECT TO authenticated USING (is_admin());


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
--     show_results is intentionally NOT locked (admin can toggle anytime).
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
REVOKE ALL ON FUNCTION public.get_server_time() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_server_time() TO anon, authenticated;

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
REVOKE ALL ON FUNCTION public.get_exam_questions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_questions(uuid) TO anon, authenticated;

-- 4.3 Get student's own attempts (requires student_name — no roll-only probing)
--     Returns all attempts ordered by attempt_number DESC (latest first).
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

-- 4.4 Get student's saved responses (ownership verified)
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

-- 4.5 Submit exam (server-side scoring + session-token validation + retry info)
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

-- 4.6 Create attempt (server-side, with access-code + max-attempts enforcement)
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

  -- Count existing attempts for this student in this batch
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
REVOKE ALL ON FUNCTION public.create_attempt(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_attempt(uuid, text, text, text, text) TO anon, authenticated;

-- 4.7 Verify access code (anon-safe — never exposes the actual code)
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

-- 4.8 Replace questions (admin-only bulk upload)
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

REVOKE ALL ON FUNCTION public.replace_questions(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_questions(uuid, jsonb) TO authenticated;

-- 4.9 Replace roster (admin-only, guarded)
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

REVOKE ALL ON FUNCTION public.replace_roster(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_roster(uuid, jsonb) TO authenticated;

-- 4.10 Verify roster entry (anon-safe — returns only the caller's own row)
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

-- 4.11 Check roster access for batch filtering (anon-safe — no PII exposed)
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

-- 4.12 Save response (session-token validated; replaces anon INSERT policy)
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

-- 4.13 Delete batch (admin cascade with audit log)
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

-- 4.14 Claim session token (rotates atomically; invalidates prior sessions)
CREATE OR REPLACE FUNCTION public.claim_session(
  p_attempt_id   uuid,
  p_roll_number  text,
  p_student_name text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token uuid;
BEGIN
  v_token := gen_random_uuid();
  UPDATE public.attempts
  SET session_token = v_token
  WHERE id           = p_attempt_id
    AND roll_number  = p_roll_number
    AND student_name = p_student_name
    AND submitted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot claim session — attempt not found or already submitted';
  END IF;

  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_session(uuid, text, text) TO anon, authenticated;

-- 4.15 Check session validity (returns false when another window claimed a newer token)
CREATE OR REPLACE FUNCTION public.check_session(
  p_attempt_id    uuid,
  p_session_token uuid
)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.attempts
    WHERE id            = p_attempt_id
      AND session_token = p_session_token
      AND submitted_at  IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.check_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_session(uuid, uuid) TO anon, authenticated;

-- 4.16 Delete attempt (admin cascade — FK-safe)
CREATE OR REPLACE FUNCTION public.delete_attempt(p_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_roll   text;
  v_batch  uuid;
  v_bname  text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT a.roll_number, a.batch_id, b.name
  INTO   v_roll, v_batch, v_bname
  FROM   public.attempts a
  JOIN   public.batches b ON b.id = a.batch_id
  WHERE  a.id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;

  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES (
    'attempt_deleted', 'attempt', p_attempt_id,
    coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'unknown'),
    jsonb_build_object('roll_number', v_roll, 'batch_name', v_bname)
  );

  DELETE FROM public.tab_switches WHERE attempt_id = p_attempt_id;
  DELETE FROM public.responses    WHERE attempt_id = p_attempt_id;
  DELETE FROM public.attempts     WHERE id = p_attempt_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_attempt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_attempt(uuid) TO authenticated;

-- 4.17 Reset batch attempts (admin cascade — FK-safe)
CREATE OR REPLACE FUNCTION public.reset_batch_attempts(p_batch_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name  text;
  v_count int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT name INTO v_name FROM public.batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.attempts WHERE batch_id = p_batch_id;

  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES (
    'batch_reset', 'batch', p_batch_id,
    coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'unknown'),
    jsonb_build_object('batch_name', v_name, 'attempts_deleted', v_count)
  );

  DELETE FROM public.tab_switches WHERE attempt_id IN (
    SELECT id FROM public.attempts WHERE batch_id = p_batch_id
  );
  DELETE FROM public.responses WHERE attempt_id IN (
    SELECT id FROM public.attempts WHERE batch_id = p_batch_id
  );
  DELETE FROM public.attempts WHERE batch_id = p_batch_id;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_batch_attempts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_batch_attempts(uuid) TO authenticated;
