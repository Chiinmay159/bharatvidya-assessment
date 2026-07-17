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
--  10. drop_old_attempts_unique_constraint (2026-04-13) — drop stale
--      UNIQUE(batch_id, roll_number) that blocked retry attempts
--  11. scale_prefetch_and_batching (2026-06-10) — encrypted paper pre-fetch
--      (get_exam_paper_encrypted/get_paper_key) for 2000+ student scale;
--      save_responses_batch drains the offline answer queue in one round trip
--  12. integrity_signals_and_timing (2026-06-10) — responses.time_spent_ms,
--      integrity_events table (fullscreen exits, copy/paste attempts);
--      save_response/save_responses_batch gain timing capture
--  13. question_bank_identity_roles (2026-06-10) — admin_users roles
--      (owner/examiner/viewer) replace the hardcoded email in is_admin();
--      bank_questions reusable question bank + compose_batch_from_bank;
--      students persistent cross-exam identity; create_attempt links it
--  14. item_analysis_and_anomalies (2026-06-10) — item_analysis,
--      anomaly_report, bank_item_performance admin-only analytics RPCs
--  15. orgs_presence_extensions (2026-06-10) — organizations table +
--      org-scoped batches, invigilator role, exam_heartbeat/mission_control
--      live presence, grant_time_extension per-attempt extensions
--  16. certificates (2026-06-10) — certificates table with snapshot fields,
--      issue_certificates (admin), verify_certificate (public, anon-safe)
--  17. org_branding (2026-06-11) — organizations.display_name/logo_url,
--      anon-safe branding read for orgs with a publicly-visible batch
--  18. exam_series (2026-06-11) — exam_series/series_modules/series_roster,
--      sync_series_roster, series_results (admin), get_my_series_standing
--      + get_batch_series (student running total, visibility-respecting)
--  19. exam_code_gate (2026-06-11) — batches.listed, auto-generated exam
--      codes (gen_exam_code/batches_autocode), find_batch_by_code,
--      verify_roster_identity (roll+email, no-leak on mismatch);
--      drops verify_roster_entry (name-harvesting oracle)
--  20. enforce_identity_deadline_integrity (2026-06-11) — discovery code
--      widened to 8 chars; create_attempt enforces roster identity
--      server-side + rejects attempts after the exam window closes;
--      save_response/save_responses_batch enforce the same deadline and
--      that the question belongs to the batch (audit-2 findings C1/C2/H3/M1)
--  21. org_scope_admin_surface (2026-06-11) — batch_in_my_org/
--      attempt_in_my_org/series_in_my_org helpers; org-scopes every
--      remaining admin table policy and admin/analytics RPC (audit-2 H1)
--  22. student_rpc_email_identity (2026-06-11) — get_my_attempt/
--      get_my_responses/claim_session/get_my_series_standing now verify
--      the caller's email instead of the guessable student_name (audit-2 H2)
--  23. per_org_bank_and_audit (2026-06-11) — bank_questions.organization_id
--      (NULL = shared master content); org-scoped bank policies,
--      compose_batch_from_bank, bank_item_performance; org-scoped audit_log
--  24. program_analytics (2026-06-11) — program_analytics() org-scoped
--      longitudinal aggregate RPC powering the Insights dashboard
--  25. role_gate_writes (2026-06-11) — viewer/invigilator blocked from
--      writes on batches/questions/roster/attempts and from destructive
--      RPCs (previously org-check-only); revoke_certificate/restore_certificate
--  26. rate_limit_failures (2026-06-11) — rate_limits table, client_ip/
--      bump_rate; failure-only throttling on find_batch_by_code and
--      verify_roster_identity (anti-enumeration, never throttles legit traffic)
--  27. enforce_admin_mfa (2026-07-16) — is_admin()/admin_role() require an
--      aal2 (TOTP MFA) session; is_admin_member() added for the client's
--      login-gate enrollment routing only
--  28. similarity_matrix (2026-07-16) — batch_similarity_matrix RPC: per-
--      attempt answer matrix for client-side pairwise collusion forensics
--      (the O(n^2) pair loop stays in the browser, never in SQL)
--  29. late_answer_mercy_queue (2026-07-16) — late_responses quarantine
--      table + submit_late_buffer (student, session-token gated, 30-min
--      grace) + review_late_response (admin accept/reject with rescore
--      and audit); deadline stays authoritative, nothing scored
--      automatically
--  30. pin_function_search_path (2026-07-16) — SET search_path = public
--      on the last 8 trigger/helper functions (security audit hardening)
--
-- Minimum frontend version: commit after 029 migration
--
-- Table creation order below is dependency-driven (topological), not
-- migration order: organizations/exam_series/series_modules/admin_users/
-- bank_questions/students precede batches/questions/attempts because later
-- migrations added foreign keys from the original tables onto these newer
-- ones (e.g. batches.organization_id, questions.bank_question_id). See
-- decision notes in the regeneration report for anything non-obvious.
-- ================================================================


-- ================================================================
-- 0. Helpers
-- ================================================================
-- 0.1 Admin check — requires MFA (aal2) AND admin_users membership.
--     SECURITY DEFINER so it can read admin_users regardless of caller.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT auth.jwt() ->> 'aal') = 'aal2'
    AND EXISTS(
      SELECT 1 FROM public.admin_users
      WHERE email = (SELECT auth.jwt() ->> 'email')
    ),
    false
  )
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- 0.2 Used by RLS policies so they don't depend on anon SELECT on attempts
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

-- 0.3 Role helper for finer-grained checks (owner-only operations).
--     Also requires aal2 — a viewer stuck at aal1 has no admin_role().
CREATE OR REPLACE FUNCTION public.admin_role()
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.admin_users
  WHERE email = (SELECT auth.jwt() ->> 'email')
    AND (SELECT auth.jwt() ->> 'aal') = 'aal2'
$$;
REVOKE ALL ON FUNCTION public.admin_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_role() TO authenticated;

-- 0.4 Org visibility helper: global admins (org NULL) see all; org admins
--     see their own org's rows.
CREATE OR REPLACE FUNCTION public.admin_org()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.admin_users
  WHERE email = (SELECT auth.jwt() ->> 'email')
$$;
REVOKE ALL ON FUNCTION public.admin_org() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_org() TO authenticated;

-- 0.5 UX-routing helper for the client's login gate only: an aal1 session
--     must decide between offering TOTP enrollment (admin without a factor)
--     and denying outright (not an admin). Returns membership for the
--     caller's own email only and grants no data access — the same fact
--     the caller could already infer from is_admin() before MFA enforcement.
CREATE OR REPLACE FUNCTION public.is_admin_member()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.admin_users
    WHERE email = (SELECT auth.jwt() ->> 'email')
  )
$$;
REVOKE ALL ON FUNCTION public.is_admin_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_member() TO authenticated;

-- 0.6 Org-scope helpers: is a batch/attempt/series visible to the caller?
--     Global admins (admin_org() IS NULL) see everything; org admins see
--     only rows whose batch (or series) belongs to their org.
CREATE OR REPLACE FUNCTION public.batch_in_my_org(p_batch_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT public.is_admin() AND (
    public.admin_org() IS NULL
    OR (SELECT b.organization_id FROM public.batches b WHERE b.id = p_batch_id) = public.admin_org()
  )
$$;
REVOKE ALL ON FUNCTION public.batch_in_my_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_in_my_org(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.attempt_in_my_org(p_attempt_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT public.is_admin() AND (
    public.admin_org() IS NULL
    OR (SELECT b.organization_id FROM public.attempts a
        JOIN public.batches b ON b.id = a.batch_id WHERE a.id = p_attempt_id) = public.admin_org()
  )
$$;
REVOKE ALL ON FUNCTION public.attempt_in_my_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attempt_in_my_org(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.series_in_my_org(p_series_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT public.is_admin() AND (
    public.admin_org() IS NULL
    OR (SELECT s.organization_id FROM public.exam_series s WHERE s.id = p_series_id) = public.admin_org()
  )
$$;
REVOKE ALL ON FUNCTION public.series_in_my_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.series_in_my_org(uuid) TO authenticated;


-- ================================================================
-- 1. TABLES
-- ================================================================
-- Ordered so every FK target is created before the table that
-- references it (see dependency note in the file header).

-- 1.1 Organizations (multi-tenant root)
CREATE TABLE IF NOT EXISTS public.organizations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  display_name text,
  logo_url     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Seed the home organization (idempotent)
INSERT INTO public.organizations (name, display_name, logo_url)
VALUES ('BharatVidya', 'BharatVidya', '/logo.png')
ON CONFLICT (name) DO NOTHING;

-- 1.2 Exam series (modular assessment across an academic year)
CREATE TABLE IF NOT EXISTS public.exam_series (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid REFERENCES public.organizations(id),
  name                 text NOT NULL,
  aggregate_pass_marks int CHECK (aggregate_pass_marks > 0),
  show_running_total   boolean NOT NULL DEFAULT true,
  created_by           text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.exam_series ENABLE ROW LEVEL SECURITY;

-- 1.3 Series modules (weighted slots within a series)
CREATE TABLE IF NOT EXISTS public.series_modules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id    uuid NOT NULL REFERENCES public.exam_series(id) ON DELETE CASCADE,
  position     int NOT NULL,
  label        text NOT NULL,
  weight_marks int NOT NULL CHECK (weight_marks > 0),
  UNIQUE (series_id, position)
);
ALTER TABLE public.series_modules ENABLE ROW LEVEL SECURITY;

-- 1.4 Admin roles (replaces the hardcoded is_admin() email)
CREATE TABLE IF NOT EXISTS public.admin_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  role            text NOT NULL DEFAULT 'examiner'
                  CHECK (role IN ('owner','examiner','invigilator','viewer')),
  organization_id uuid REFERENCES public.organizations(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Seed the existing owner (idempotent)
INSERT INTO public.admin_users (email, role, created_by)
VALUES ('chinmay@matramedia.co.in', 'owner', 'migration_013')
ON CONFLICT (email) DO NOTHING;

-- 1.5 Question bank (reusable, composed into per-batch papers)
CREATE TABLE IF NOT EXISTS public.bank_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text   text NOT NULL,
  option_a        text NOT NULL,
  option_b        text NOT NULL,
  option_c        text NOT NULL,
  option_d        text NOT NULL,
  correct_answer  text NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  -- Metadata (the point of having a bank)
  topic           text NOT NULL,
  subtopic        text,
  difficulty      text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  bloom_level     text CHECK (bloom_level IN ('remember','understand','apply','analyze','evaluate','create')),
  language        text NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','sa','mr','mixed')),
  tags            text[] NOT NULL DEFAULT '{}',
  explanation     text,           -- shown in future practice modes; never to live exams
  -- Review workflow: draft → in_review → approved → retired
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','retired')),
  version         int NOT NULL DEFAULT 1,
  created_by      text NOT NULL,
  reviewed_by     text,
  review_note     text,
  -- Ownership: NULL = shared master content, visible to every org
  organization_id uuid REFERENCES public.organizations(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Usage (denormalized for quick blueprint queries)
  times_used      int NOT NULL DEFAULT 0,
  last_used_at    timestamptz
);
ALTER TABLE public.bank_questions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bank_questions_topic ON public.bank_questions(topic, difficulty) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_bank_questions_status ON public.bank_questions(status);
CREATE INDEX IF NOT EXISTS idx_bank_questions_org ON public.bank_questions(organization_id);

-- 1.6 Students (persistent cross-exam identity)
CREATE TABLE IF NOT EXISTS public.students (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL UNIQUE,
  full_name    text NOT NULL,
  phone        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- 1.7 Batches
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
  max_attempts         int NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
  -- Encrypted paper pre-fetch key (011) — never in the anon column grant below
  paper_key            bytea,
  -- Multi-tenant + series (015, 018)
  organization_id      uuid REFERENCES public.organizations(id),
  series_module_id     uuid REFERENCES public.series_modules(id),
  is_makeup            boolean NOT NULL DEFAULT false,
  -- Discovery (019): unlisted by default, joined via exam code
  listed               boolean NOT NULL DEFAULT false
);
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_batches_series_module ON public.batches(series_module_id);

-- 1.8 Questions (the FROZEN per-batch paper; the bank composes INTO it)
CREATE TABLE IF NOT EXISTS public.questions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         uuid NOT NULL REFERENCES public.batches(id),
  question_text    text NOT NULL,
  option_a         text NOT NULL,
  option_b         text NOT NULL,
  option_c         text NOT NULL,
  option_d         text NOT NULL,
  correct_answer   text NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  sort_order       int NOT NULL,
  -- Lineage back to the bank question this was composed from (013)
  bank_question_id uuid REFERENCES public.bank_questions(id)
);
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_questions_bank_origin ON public.questions(bank_question_id);

-- 1.9 Attempts
CREATE TABLE IF NOT EXISTS public.attempts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           uuid NOT NULL REFERENCES public.batches(id),
  roll_number        text NOT NULL,
  student_name       text NOT NULL,
  started_at         timestamptz NOT NULL DEFAULT now(),
  submitted_at       timestamptz,
  score              int,
  total_questions    int,
  email              text,
  session_token      uuid,
  attempt_number     int NOT NULL DEFAULT 1,
  -- Persistent identity link (013)
  student_id         uuid REFERENCES public.students(id),
  -- Live presence + per-attempt time extension (015)
  last_seen          timestamptz,
  extra_time_minutes int NOT NULL DEFAULT 0
                     CHECK (extra_time_minutes >= 0 AND extra_time_minutes <= 240),
  CONSTRAINT attempts_batch_roll_attempt_unique UNIQUE (batch_id, roll_number, attempt_number)
);
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_attempts_student ON public.attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_batch_lastseen ON public.attempts(batch_id, last_seen);

-- 1.10 Responses
CREATE TABLE IF NOT EXISTS public.responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      uuid NOT NULL REFERENCES public.attempts(id),
  question_id     uuid NOT NULL REFERENCES public.questions(id),
  selected_answer text NOT NULL CHECK (selected_answer IN ('A','B','C','D')),
  is_correct      boolean NOT NULL,
  -- Per-question timing telemetry (012)
  time_spent_ms   int CHECK (time_spent_ms IS NULL OR time_spent_ms >= 0),
  CONSTRAINT responses_attempt_question_unique UNIQUE (attempt_id, question_id)
);
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- 1.11 Roster
CREATE TABLE IF NOT EXISTS public.roster (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     uuid NOT NULL REFERENCES public.batches(id),
  roll_number  text NOT NULL,
  student_name text NOT NULL,
  email        text NOT NULL
);
ALTER TABLE public.roster ENABLE ROW LEVEL SECURITY;

-- 1.12 Audit log
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

-- 1.13 Tab switches
CREATE TABLE IF NOT EXISTS public.tab_switches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  uuid NOT NULL REFERENCES public.attempts(id),
  left_at     timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz
);
ALTER TABLE public.tab_switches ENABLE ROW LEVEL SECURITY;

-- 1.14 Integrity events (012) — generic event log alongside tab_switches
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
CREATE INDEX IF NOT EXISTS idx_integrity_events_attempt ON public.integrity_events(attempt_id);

-- 1.15 Certificates (016) — snapshot fields keep the face immutable
CREATE TABLE IF NOT EXISTS public.certificates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_code text NOT NULL UNIQUE,
  attempt_id       uuid NOT NULL UNIQUE REFERENCES public.attempts(id),
  batch_id         uuid NOT NULL REFERENCES public.batches(id),
  student_name     text NOT NULL,
  roll_number      text NOT NULL,
  exam_name        text NOT NULL,
  score            int,
  total_questions  int,
  percentage       int,
  passed           boolean,
  issued_at        timestamptz NOT NULL DEFAULT now(),
  issued_by        text NOT NULL,
  revoked          boolean NOT NULL DEFAULT false,
  revoked_reason   text
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_certificates_batch ON public.certificates(batch_id);

-- 1.16 Series roster (018) — one roster synced into every module batch
CREATE TABLE IF NOT EXISTS public.series_roster (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id    uuid NOT NULL REFERENCES public.exam_series(id) ON DELETE CASCADE,
  roll_number  text NOT NULL,
  student_name text NOT NULL,
  email        text NOT NULL,
  UNIQUE (series_id, roll_number)
);
ALTER TABLE public.series_roster ENABLE ROW LEVEL SECURITY;

-- 1.17 Rate limits (026) — failure-only throttling buckets
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket  text PRIMARY KEY,
  n       int NOT NULL DEFAULT 0,
  updated timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;  -- no anon policy: only SECURITY DEFINER fns touch it


-- ================================================================
-- 2. RLS POLICIES
-- ================================================================

-- 2.1 Organizations
-- Column-level grant: anon can read id + branding fields only
REVOKE ALL ON public.organizations FROM anon;
GRANT SELECT (id, name, display_name, logo_url) ON public.organizations TO anon;

CREATE POLICY organizations_admin_select ON public.organizations
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY organizations_owner_write ON public.organizations
  FOR ALL TO authenticated
  USING (admin_role() = 'owner' AND admin_org() IS NULL)
  WITH CHECK (admin_role() = 'owner' AND admin_org() IS NULL);

-- Anon may read branding for orgs with at least one publicly-visible batch
CREATE POLICY organizations_anon_branding ON public.organizations
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.batches b
    WHERE b.organization_id = organizations.id
      AND b.status IN ('scheduled','active','completed')
  ));

-- 2.2 Exam series — org-scoped like batches
CREATE POLICY exam_series_admin_select ON public.exam_series
  FOR SELECT TO authenticated
  USING (is_admin() AND (admin_org() IS NULL OR organization_id = admin_org()));
CREATE POLICY exam_series_admin_write ON public.exam_series
  FOR ALL TO authenticated
  USING (admin_role() IN ('owner','examiner') AND (admin_org() IS NULL OR organization_id = admin_org()))
  WITH CHECK (admin_role() IN ('owner','examiner') AND (admin_org() IS NULL OR organization_id = admin_org()));

-- 2.3 Series modules (admin-managed; reached only via an already org-scoped series in the UI)
CREATE POLICY series_modules_admin_select ON public.series_modules
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY series_modules_admin_write ON public.series_modules
  FOR ALL TO authenticated
  USING (admin_role() IN ('owner','examiner')) WITH CHECK (admin_role() IN ('owner','examiner'));

-- 2.4 Admin users — only owners manage the list; all admins can see it
CREATE POLICY admin_users_select ON public.admin_users
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY admin_users_insert ON public.admin_users
  FOR INSERT TO authenticated WITH CHECK (admin_role() = 'owner');
CREATE POLICY admin_users_update ON public.admin_users
  FOR UPDATE TO authenticated USING (admin_role() = 'owner') WITH CHECK (admin_role() = 'owner');
CREATE POLICY admin_users_delete ON public.admin_users
  FOR DELETE TO authenticated USING (admin_role() = 'owner' AND email != (SELECT auth.jwt() ->> 'email'));

-- 2.5 Question bank — org-scoped (own org's questions + shared/NULL-org content)
CREATE POLICY bank_select ON public.bank_questions
  FOR SELECT TO authenticated
  USING (public.is_admin() AND (
    public.admin_org() IS NULL OR organization_id = public.admin_org() OR organization_id IS NULL
  ));
CREATE POLICY bank_insert ON public.bank_questions
  FOR INSERT TO authenticated
  WITH CHECK (admin_role() IN ('owner','examiner') AND (
    public.admin_org() IS NULL OR organization_id = public.admin_org()
  ));
CREATE POLICY bank_update ON public.bank_questions
  FOR UPDATE TO authenticated
  USING (admin_role() IN ('owner','examiner') AND (public.admin_org() IS NULL OR organization_id = public.admin_org()))
  WITH CHECK (admin_role() IN ('owner','examiner') AND (public.admin_org() IS NULL OR organization_id = public.admin_org()));
CREATE POLICY bank_delete ON public.bank_questions
  FOR DELETE TO authenticated
  USING (admin_role() = 'owner' AND (public.admin_org() IS NULL OR organization_id = public.admin_org()));

-- 2.6 Students — admin-only direct access, org-scoped by attempted batches
CREATE POLICY students_admin_select ON public.students
  FOR SELECT TO authenticated USING (
    public.is_admin() AND (
      public.admin_org() IS NULL
      OR EXISTS (
        SELECT 1 FROM public.attempts a JOIN public.batches b ON b.id = a.batch_id
        WHERE a.student_id = students.id AND b.organization_id = public.admin_org()
      )
    )
  );
CREATE POLICY students_admin_write ON public.students
  FOR ALL TO authenticated USING (admin_role() IN ('owner','examiner')) WITH CHECK (admin_role() IN ('owner','examiner'));

-- 2.7 Batches
-- Column-level grant: anon can SELECT all columns EXCEPT access_code/paper_key
REVOKE ALL ON public.batches FROM anon;
GRANT SELECT (
  id, name, scheduled_start, duration_minutes, status,
  created_by, questions_per_student, created_at, has_access_code,
  show_results, pass_percentage, max_attempts,
  organization_id, series_module_id, is_makeup, listed
) ON public.batches TO anon;

CREATE POLICY batches_select_public ON public.batches
  FOR SELECT TO anon
  USING (status IN ('scheduled','active','completed'));

CREATE POLICY batches_select_admin ON public.batches
  FOR SELECT TO authenticated
  USING (is_admin() AND (admin_org() IS NULL OR organization_id = admin_org()));
CREATE POLICY batches_insert_admin ON public.batches
  FOR INSERT TO authenticated
  WITH CHECK (admin_role() IN ('owner','examiner') AND (admin_org() IS NULL OR organization_id = admin_org()));
CREATE POLICY batches_update_admin ON public.batches
  FOR UPDATE TO authenticated
  USING (admin_role() IN ('owner','examiner') AND (admin_org() IS NULL OR organization_id = admin_org()))
  WITH CHECK (admin_role() IN ('owner','examiner') AND (admin_org() IS NULL OR organization_id = admin_org()));
CREATE POLICY batches_delete_admin ON public.batches
  FOR DELETE TO authenticated
  USING (admin_role() IN ('owner','examiner') AND (admin_org() IS NULL OR organization_id = admin_org()));

-- 2.8 Questions — NO anon SELECT (use get_exam_questions RPC); org + role scoped
CREATE POLICY questions_select_admin ON public.questions
  FOR SELECT TO authenticated USING (public.batch_in_my_org(batch_id));
CREATE POLICY questions_insert_admin ON public.questions
  FOR INSERT TO authenticated WITH CHECK (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));
CREATE POLICY questions_update_admin ON public.questions
  FOR UPDATE TO authenticated USING (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id))
  WITH CHECK (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));
CREATE POLICY questions_delete_admin ON public.questions
  FOR DELETE TO authenticated USING (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));

-- 2.9 Attempts — NO anon SELECT/INSERT (use create_attempt / get_my_attempt RPCs)
CREATE POLICY attempts_select_admin ON public.attempts
  FOR SELECT TO authenticated USING (public.batch_in_my_org(batch_id));
CREATE POLICY attempts_update_admin ON public.attempts
  FOR UPDATE TO authenticated USING (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id))
  WITH CHECK (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));
CREATE POLICY attempts_delete_admin ON public.attempts
  FOR DELETE TO authenticated USING (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));

-- 2.10 Responses — NO anon INSERT (use save_response RPC with session-token validation)
CREATE POLICY responses_select_admin ON public.responses
  FOR SELECT TO authenticated USING (public.attempt_in_my_org(attempt_id));

-- 2.11 Roster (NO anon access — use verify_roster_identity / check_roster_access RPCs)
CREATE POLICY roster_admin_select ON public.roster
  FOR SELECT TO authenticated USING (public.batch_in_my_org(batch_id));
CREATE POLICY roster_admin_insert ON public.roster
  FOR INSERT TO authenticated WITH CHECK (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));
CREATE POLICY roster_admin_update ON public.roster
  FOR UPDATE TO authenticated USING (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id))
  WITH CHECK (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));
CREATE POLICY roster_admin_delete ON public.roster
  FOR DELETE TO authenticated USING (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));

-- 2.12 Audit log — org-scoped read via entity resolution (batch/attempt/series)
CREATE POLICY audit_log_admin_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin() AND (
    public.admin_org() IS NULL
    OR (entity = 'batch'       AND public.batch_in_my_org(entity_id))
    OR (entity = 'attempt'     AND public.attempt_in_my_org(entity_id))
    OR (entity = 'exam_series' AND public.series_in_my_org(entity_id))
  ));
CREATE POLICY audit_log_admin_insert ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (is_admin());

-- 2.13 Tab switches — scoped via attempt_is_open helper (anon) / org (admin)
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
  FOR SELECT TO authenticated USING (public.attempt_in_my_org(attempt_id));

-- 2.14 Integrity events — same scoping pattern as tab_switches
CREATE POLICY integrity_events_anon_insert ON public.integrity_events
  FOR INSERT TO anon
  WITH CHECK (public.attempt_is_open(attempt_id));
CREATE POLICY integrity_events_admin_read ON public.integrity_events
  FOR SELECT TO authenticated USING (public.attempt_in_my_org(attempt_id));

-- 2.15 Certificates — org-scoped; inserts happen only via issue_certificates RPC
CREATE POLICY certificates_admin_select ON public.certificates
  FOR SELECT TO authenticated USING (public.batch_in_my_org(batch_id));
CREATE POLICY certificates_admin_update ON public.certificates
  FOR UPDATE TO authenticated USING (public.batch_in_my_org(batch_id)) WITH CHECK (public.batch_in_my_org(batch_id));

-- 2.16 Series roster (admin-managed; reached only via an already org-scoped series in the UI)
CREATE POLICY series_roster_admin_select ON public.series_roster
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY series_roster_admin_write ON public.series_roster
  FOR ALL TO authenticated
  USING (admin_role() IN ('owner','examiner')) WITH CHECK (admin_role() IN ('owner','examiner'));

-- 2.17 Rate limits — no policies at all; only SECURITY DEFINER functions
--      (bump_rate) ever read or write this table.


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

-- 3.4 Question bank review workflow (013): approval requires a DIFFERENT
--     person than the author (four-eyes); any content edit to an approved
--     question reverts it to draft + bumps version.
CREATE OR REPLACE FUNCTION public.bank_question_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_editor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'unknown');
BEGIN
  NEW.updated_at := now();

  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    IF v_editor = OLD.created_by THEN
      RAISE EXCEPTION 'A question cannot be approved by its author';
    END IF;
    NEW.reviewed_by := v_editor;
  END IF;

  IF OLD.status = 'approved' AND NEW.status = 'approved' AND (
       NEW.question_text  IS DISTINCT FROM OLD.question_text
    OR NEW.option_a       IS DISTINCT FROM OLD.option_a
    OR NEW.option_b       IS DISTINCT FROM OLD.option_b
    OR NEW.option_c       IS DISTINCT FROM OLD.option_c
    OR NEW.option_d       IS DISTINCT FROM OLD.option_d
    OR NEW.correct_answer IS DISTINCT FROM OLD.correct_answer
  ) THEN
    NEW.status := 'draft';
    NEW.version := OLD.version + 1;
    NEW.reviewed_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER bank_questions_workflow
  BEFORE UPDATE ON public.bank_questions
  FOR EACH ROW EXECUTE FUNCTION bank_question_workflow();

-- 3.5 Auto-generate an exam code on batch creation when none is given (019/020)
CREATE OR REPLACE FUNCTION public.batches_autocode()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_code text;
BEGIN
  IF NEW.access_code IS NULL OR NEW.access_code = '' THEN
    LOOP
      v_code := public.gen_exam_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.batches b WHERE upper(b.access_code) = v_code);
    END LOOP;
    NEW.access_code := v_code;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER batches_autocode
  BEFORE INSERT ON public.batches
  FOR EACH ROW EXECUTE FUNCTION batches_autocode();

-- 3.6 Default a new bank question to the author's org on insert (023);
--     global admins (admin_org() NULL) create shared/master content.
CREATE OR REPLACE FUNCTION public.bank_questions_set_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.admin_org();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bank_questions_set_org
  BEFORE INSERT ON public.bank_questions
  FOR EACH ROW EXECUTE FUNCTION bank_questions_set_org();


-- ================================================================
-- 4. RPCs (Security Definer unless noted)
-- ================================================================

-- ── Exam runtime ────────────────────────────────────────────────

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

-- 4.3 Get student's own attempts — verifies EMAIL, not the guessable
--     student_name (audit-2 H2). Returns all attempts, latest first.
CREATE OR REPLACE FUNCTION public.get_my_attempt(
  p_batch_id     uuid,
  p_roll_number  text,
  p_email        text
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
         a.started_at, a.submitted_at, a.score, a.total_questions, a.attempt_number
  FROM public.attempts a
  WHERE a.batch_id = p_batch_id
    AND a.roll_number = p_roll_number
    AND lower(a.email) = lower(p_email)
  ORDER BY a.attempt_number DESC
$$;
REVOKE ALL ON FUNCTION public.get_my_attempt(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_attempt(uuid, text, text) TO anon, authenticated;

-- 4.4 Get student's saved responses — ownership verified by email (audit-2 H2)
CREATE OR REPLACE FUNCTION public.get_my_responses(
  p_attempt_id  uuid,
  p_roll_number text,
  p_email       text
)
RETURNS TABLE (question_id uuid, selected_answer text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.question_id, r.selected_answer
  FROM public.responses r
  JOIN public.attempts a ON a.id = r.attempt_id
  WHERE r.attempt_id   = p_attempt_id
    AND a.roll_number  = p_roll_number
    AND lower(a.email) = lower(p_email)
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

-- 4.6 Create attempt (server-side, with access-code + max-attempts +
--     roster-identity + exam-window enforcement; identity link to students)
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
  v_student_id     uuid;
  v_has_roster     boolean;
  v_roster_name    text;
  v_window_end     timestamptz;
BEGIN
  SELECT status, access_code, max_attempts,
         scheduled_start + (duration_minutes * interval '1 minute')
  INTO   v_status, v_code, v_max_attempts, v_window_end
  FROM   public.batches WHERE id = p_batch_id;

  IF v_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_status != 'active' THEN RAISE EXCEPTION 'Batch is not active'; END IF;

  -- H3: no new attempts after the exam window has closed
  IF now() > v_window_end THEN
    RAISE EXCEPTION 'The exam time window has closed';
  END IF;

  -- Access/discovery code (still required; routing + low-stakes gate)
  IF v_code IS NOT NULL AND v_code != '' THEN
    IF p_access_code IS NULL OR upper(p_access_code) != upper(v_code) THEN
      RAISE EXCEPTION 'Invalid access code';
    END IF;
  END IF;

  -- C1: roster identity is the credential when a roster exists.
  SELECT EXISTS(SELECT 1 FROM public.roster WHERE batch_id = p_batch_id)
  INTO v_has_roster;

  IF v_has_roster THEN
    SELECT student_name INTO v_roster_name
    FROM public.roster
    WHERE batch_id = p_batch_id
      AND roll_number = p_roll_number
      AND lower(email) = lower(coalesce(p_email, ''))
    LIMIT 1;

    IF v_roster_name IS NULL THEN
      RAISE EXCEPTION 'Roll number and email do not match the exam roster';
    END IF;
    -- Trust the roster name, not client input
    p_student_name := v_roster_name;
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM public.attempts
  WHERE batch_id = p_batch_id AND roll_number = p_roll_number;

  v_next_attempt := v_existing_count + 1;
  IF v_next_attempt > v_max_attempts THEN
    RAISE EXCEPTION 'Maximum attempts reached for this exam';
  END IF;

  -- Identity link: upsert by email when provided (name refreshes softly)
  IF p_email IS NOT NULL AND p_email != '' THEN
    INSERT INTO public.students (email, full_name)
    VALUES (lower(p_email), p_student_name)
    ON CONFLICT (email) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_student_id;
  END IF;

  INSERT INTO public.attempts (batch_id, roll_number, student_name, email, attempt_number, student_id)
  VALUES (p_batch_id, p_roll_number, p_student_name, p_email, v_next_attempt, v_student_id)
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

-- 4.8 Replace questions (owner/examiner only; org-scoped)
CREATE OR REPLACE FUNCTION public.replace_questions(p_batch_id uuid, p_questions jsonb)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_row   jsonb;
  v_i     int  := 1;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Your role cannot edit questions'; END IF;

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

-- 4.9 Replace roster (owner/examiner only; org-scoped)
CREATE OR REPLACE FUNCTION public.replace_roster(p_batch_id uuid, p_rows jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Your role cannot edit the roster'; END IF;

  DELETE FROM public.roster WHERE batch_id = p_batch_id;
  INSERT INTO public.roster (batch_id, roll_number, student_name, email)
  SELECT p_batch_id, (r->>'roll_number')::text, (r->>'student_name')::text, (r->>'email')::text
  FROM jsonb_array_elements(p_rows) AS r;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_roster(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_roster(uuid, jsonb) TO authenticated;

-- 4.10 Check roster access for batch filtering (anon-safe — no PII exposed)
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

-- 4.11 Save response — session-token validated; deadline-enforced (extension-
--      aware); question must belong to the batch (audit-2 M1/H3)
CREATE OR REPLACE FUNCTION public.save_response(
  p_attempt_id      uuid,
  p_question_id     uuid,
  p_selected_answer text,
  p_session_token   uuid,
  p_time_spent_ms   int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch    uuid;
  v_deadline timestamptz;
BEGIN
  SELECT b.id,
         b.scheduled_start + ((b.duration_minutes + a.extra_time_minutes) * interval '1 minute')
  INTO   v_batch, v_deadline
  FROM   public.attempts a
  JOIN   public.batches b ON b.id = a.batch_id
  WHERE  a.id = p_attempt_id
    AND  a.session_token = p_session_token
    AND  a.submitted_at IS NULL
    AND  b.status = 'active';

  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'Invalid session or attempt already closed';
  END IF;

  -- H3: authoritative deadline (30s grace for clock skew / in-flight)
  IF now() > v_deadline + interval '30 seconds' THEN
    RAISE EXCEPTION 'The exam time has ended';
  END IF;

  -- M1: the question must belong to this batch (no foreign-key injection)
  IF NOT EXISTS (
    SELECT 1 FROM public.questions q WHERE q.id = p_question_id AND q.batch_id = v_batch
  ) THEN
    RAISE EXCEPTION 'Question does not belong to this exam';
  END IF;

  INSERT INTO public.responses (attempt_id, question_id, selected_answer, is_correct, time_spent_ms)
  VALUES (p_attempt_id, p_question_id, p_selected_answer, false, LEAST(p_time_spent_ms, 86400000))
  ON CONFLICT (attempt_id, question_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.save_response(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_response(uuid, uuid, text, uuid, int) TO anon, authenticated;

-- 4.12 Delete batch (owner/examiner, org-scoped cascade with audit log)
CREATE OR REPLACE FUNCTION public.delete_batch(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Your role cannot delete exams'; END IF;

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
  DELETE FROM public.certificates WHERE batch_id = p_batch_id;
  DELETE FROM public.tab_switches WHERE attempt_id IN (
    SELECT id FROM public.attempts WHERE batch_id = p_batch_id
  );
  DELETE FROM public.integrity_events WHERE attempt_id IN (
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

-- 4.13 Claim session token (rotates atomically; verifies EMAIL, not the
--      guessable student_name — audit-2 H2)
CREATE OR REPLACE FUNCTION public.claim_session(
  p_attempt_id  uuid,
  p_roll_number text,
  p_email       text
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
    AND lower(email) = lower(p_email)
    AND submitted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot claim session — details do not match or attempt already submitted';
  END IF;

  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_session(uuid, text, text) TO anon, authenticated;

-- 4.14 Check session validity (returns false when another window claimed a newer token)
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

-- 4.15 Delete attempt (owner/examiner, org-scoped cascade — FK-safe)
CREATE OR REPLACE FUNCTION public.delete_attempt(p_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_roll   text;
  v_batch  uuid;
  v_bname  text;
BEGIN
  IF NOT public.attempt_in_my_org(p_attempt_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Your role cannot delete attempts'; END IF;

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

  DELETE FROM public.tab_switches     WHERE attempt_id = p_attempt_id;
  DELETE FROM public.integrity_events WHERE attempt_id = p_attempt_id;
  DELETE FROM public.responses        WHERE attempt_id = p_attempt_id;
  DELETE FROM public.attempts         WHERE id = p_attempt_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_attempt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_attempt(uuid) TO authenticated;

-- 4.16 Reset batch attempts (owner/examiner, org-scoped cascade — FK-safe)
CREATE OR REPLACE FUNCTION public.reset_batch_attempts(p_batch_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name  text;
  v_count int;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Your role cannot reset attempts'; END IF;

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
  DELETE FROM public.integrity_events WHERE attempt_id IN (
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

-- ── Scale + integrity (011, 012) ────────────────────────────────

-- 4.17 get_exam_paper_encrypted — available while scheduled OR active.
--      Generates the batch key on first call (atomic, idempotent).
--      Returns AES-256-CBC ciphertext (PKCS#7 padded) + per-call IV,
--      both base64 — decryptable in the browser via Web Crypto.
--      paper_key is NOT in the anon column grant on batches (2.7) — anon
--      can never SELECT it directly.
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

-- 4.18 get_paper_key — tiny payload, released only once batch is active.
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

-- 4.19 save_responses_batch — one session check, many upserts. Same
--      deadline + question-ownership protections as save_response (020);
--      foreign questions are dropped (not errored) so a legitimate queue
--      drain still works. p_responses: [{question_id, selected_answer,
--      time_spent_ms}, ...]
CREATE OR REPLACE FUNCTION public.save_responses_batch(
  p_attempt_id    uuid,
  p_session_token uuid,
  p_responses     jsonb
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch    uuid;
  v_deadline timestamptz;
  v_count    int;
BEGIN
  SELECT b.id,
         b.scheduled_start + ((b.duration_minutes + a.extra_time_minutes) * interval '1 minute')
  INTO   v_batch, v_deadline
  FROM   public.attempts a
  JOIN   public.batches b ON b.id = a.batch_id
  WHERE  a.id = p_attempt_id
    AND  a.session_token = p_session_token
    AND  a.submitted_at IS NULL
    AND  b.status = 'active';

  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'Invalid session or attempt already closed';
  END IF;
  IF now() > v_deadline + interval '30 seconds' THEN
    RAISE EXCEPTION 'The exam time has ended';
  END IF;
  IF jsonb_array_length(p_responses) > 200 THEN
    RAISE EXCEPTION 'Batch too large';
  END IF;

  INSERT INTO public.responses (attempt_id, question_id, selected_answer, is_correct, time_spent_ms)
  SELECT p_attempt_id, (r->>'question_id')::uuid, upper(r->>'selected_answer'), false,
         LEAST((r->>'time_spent_ms')::int, 86400000)
  FROM jsonb_array_elements(p_responses) AS r
  WHERE upper(r->>'selected_answer') IN ('A','B','C','D')
    AND EXISTS (  -- M1: only questions belonging to this batch
      SELECT 1 FROM public.questions q
      WHERE q.id = (r->>'question_id')::uuid AND q.batch_id = v_batch
    )
  ON CONFLICT (attempt_id, question_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.save_responses_batch(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_responses_batch(uuid, uuid, jsonb) TO anon, authenticated;

-- ── Question bank (013, 023) ─────────────────────────────────────

-- 4.20 Compose a batch paper from the bank by blueprint
--      blueprint: [{"topic":"Vedanta","difficulty":"easy","count":10}, ...]
--      Rules: approved questions only, scoped to the batch's org + shared
--      (NULL-org) content; least-recently-used first to rotate the bank;
--      APPENDS after existing sort_order.
CREATE OR REPLACE FUNCTION public.compose_batch_from_bank(
  p_batch_id  uuid,
  p_blueprint jsonb
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rule       jsonb;
  v_count      int;
  v_added      int := 0;
  v_sort       int;
  v_status     text;
  v_available  int;
  v_org        uuid;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN
    RAISE EXCEPTION 'Viewers cannot compose papers';
  END IF;

  SELECT status, organization_id INTO v_status, v_org FROM public.batches WHERE id = p_batch_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_status NOT IN ('draft','scheduled') THEN
    RAISE EXCEPTION 'Cannot compose into a batch with status %', v_status;
  END IF;

  SELECT coalesce(max(sort_order), 0) INTO v_sort
  FROM public.questions WHERE batch_id = p_batch_id;

  FOR v_rule IN SELECT * FROM jsonb_array_elements(p_blueprint)
  LOOP
    v_count := (v_rule->>'count')::int;
    IF v_count IS NULL OR v_count < 1 THEN
      RAISE EXCEPTION 'Each blueprint rule needs a positive count';
    END IF;

    -- Fail loudly if the bank cannot satisfy the rule
    SELECT COUNT(*) INTO v_available
    FROM public.bank_questions bq
    WHERE bq.status = 'approved'
      AND bq.topic = (v_rule->>'topic')
      AND (bq.organization_id = v_org OR bq.organization_id IS NULL)
      AND (v_rule->>'difficulty' IS NULL OR bq.difficulty = (v_rule->>'difficulty'))
      AND (v_rule->>'language'   IS NULL OR bq.language   = (v_rule->>'language'))
      AND NOT EXISTS (  -- never duplicate within the same paper
        SELECT 1 FROM public.questions q
        WHERE q.batch_id = p_batch_id AND q.bank_question_id = bq.id
      );
    IF v_available < v_count THEN
      RAISE EXCEPTION 'Bank has only % approved question(s) for topic=% difficulty=% (need %)',
        v_available, v_rule->>'topic', coalesce(v_rule->>'difficulty','any'), v_count;
    END IF;

    WITH picked AS (
      SELECT bq.id, bq.question_text, bq.option_a, bq.option_b, bq.option_c, bq.option_d, bq.correct_answer
      FROM public.bank_questions bq
      WHERE bq.status = 'approved'
        AND bq.topic = (v_rule->>'topic')
        AND (bq.organization_id = v_org OR bq.organization_id IS NULL)
        AND (v_rule->>'difficulty' IS NULL OR bq.difficulty = (v_rule->>'difficulty'))
        AND (v_rule->>'language'   IS NULL OR bq.language   = (v_rule->>'language'))
        AND NOT EXISTS (
          SELECT 1 FROM public.questions q
          WHERE q.batch_id = p_batch_id AND q.bank_question_id = bq.id
        )
      ORDER BY bq.last_used_at ASC NULLS FIRST, random()
      LIMIT v_count
    ),
    inserted AS (
      INSERT INTO public.questions
        (batch_id, question_text, option_a, option_b, option_c, option_d, correct_answer, sort_order, bank_question_id)
      SELECT p_batch_id, p.question_text, p.option_a, p.option_b, p.option_c, p.option_d, p.correct_answer,
             v_sort + row_number() OVER (), p.id
      FROM picked p
      RETURNING bank_question_id
    )
    UPDATE public.bank_questions
    SET times_used = times_used + 1, last_used_at = now()
    WHERE id IN (SELECT bank_question_id FROM inserted);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_added := v_added + v_count;
    SELECT coalesce(max(sort_order), 0) INTO v_sort
    FROM public.questions WHERE batch_id = p_batch_id;
  END LOOP;

  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('paper_composed', 'batch', p_batch_id,
          coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'unknown'),
          jsonb_build_object('blueprint', p_blueprint, 'questions_added', v_added));

  RETURN v_added;
END;
$$;
REVOKE ALL ON FUNCTION public.compose_batch_from_bank(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compose_batch_from_bank(uuid, jsonb) TO authenticated;

-- 4.21 Cross-exam bank item performance — org + shared scope
CREATE OR REPLACE FUNCTION public.bank_item_performance()
RETURNS TABLE (
  bank_question_id uuid,
  question_text    text,
  topic            text,
  difficulty       text,
  exams_used       bigint,
  n_responses      bigint,
  difficulty_index numeric,
  avg_time_s       numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    bq.id,
    bq.question_text,
    bq.topic,
    bq.difficulty,
    COUNT(DISTINCT q.batch_id) AS exams_used,
    COUNT(r.id) AS n_responses,
    round(avg(CASE WHEN r.is_correct THEN 1.0 ELSE 0.0 END), 3) AS difficulty_index,
    round(avg(r.time_spent_ms) / 1000.0, 1) AS avg_time_s
  FROM public.bank_questions bq
  JOIN public.questions q ON q.bank_question_id = bq.id
  LEFT JOIN public.responses r ON r.question_id = q.id
  WHERE public.is_admin()
    AND (public.admin_org() IS NULL OR bq.organization_id = public.admin_org() OR bq.organization_id IS NULL)
  GROUP BY bq.id, bq.question_text, bq.topic, bq.difficulty
  HAVING COUNT(r.id) > 0
  ORDER BY COUNT(r.id) DESC
$$;
REVOKE ALL ON FUNCTION public.bank_item_performance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bank_item_performance() TO authenticated;

-- ── Item analysis + anomaly detection (014, 021) ──────────────────

-- 4.22 Item analysis for one batch, org-scoped.
--      difficulty_index  = proportion correct (higher = easier)
--      discrimination    = upper27% correct-rate minus lower27%
--                          (classical U-L index; > 0.3 good, < 0.1 review)
--      distractor counts = how often each option was chosen
CREATE OR REPLACE FUNCTION public.item_analysis(p_batch_id uuid)
RETURNS TABLE (
  question_id       uuid,
  bank_question_id  uuid,
  question_text     text,
  n_responses       bigint,
  difficulty_index  numeric,
  discrimination    numeric,
  avg_time_s        numeric,
  picked_a          bigint,
  picked_b          bigint,
  picked_c          bigint,
  picked_d          bigint,
  correct_answer    text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH scored_attempts AS (
    SELECT a.id, a.score,
           ntile(100) OVER (ORDER BY a.score) AS pctile
    FROM public.attempts a
    WHERE a.batch_id = p_batch_id AND a.submitted_at IS NOT NULL AND a.total_questions > 0
  ),
  bands AS (
    SELECT id,
           CASE WHEN pctile >= 73 THEN 'upper'
                WHEN pctile <= 27 THEN 'lower'
                ELSE 'mid' END AS band
    FROM scored_attempts
  )
  SELECT
    q.id,
    q.bank_question_id,
    q.question_text,
    COUNT(r.id) AS n_responses,
    round(avg(CASE WHEN r.is_correct THEN 1.0 ELSE 0.0 END), 3) AS difficulty_index,
    round(
      coalesce(avg(CASE WHEN b.band = 'upper' THEN (CASE WHEN r.is_correct THEN 1.0 ELSE 0.0 END) END), 0)
      - coalesce(avg(CASE WHEN b.band = 'lower' THEN (CASE WHEN r.is_correct THEN 1.0 ELSE 0.0 END) END), 0)
    , 3) AS discrimination,
    round(avg(r.time_spent_ms) / 1000.0, 1) AS avg_time_s,
    COUNT(*) FILTER (WHERE r.selected_answer = 'A') AS picked_a,
    COUNT(*) FILTER (WHERE r.selected_answer = 'B') AS picked_b,
    COUNT(*) FILTER (WHERE r.selected_answer = 'C') AS picked_c,
    COUNT(*) FILTER (WHERE r.selected_answer = 'D') AS picked_d,
    q.correct_answer
  FROM public.questions q
  LEFT JOIN public.responses r ON r.question_id = q.id
  LEFT JOIN bands b ON b.id = r.attempt_id
  WHERE q.batch_id = p_batch_id
    AND public.batch_in_my_org(p_batch_id)
  GROUP BY q.id, q.bank_question_id, q.question_text, q.correct_answer
  ORDER BY q.sort_order
$$;
REVOKE ALL ON FUNCTION public.item_analysis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.item_analysis(uuid) TO authenticated;

-- 4.23 Anomaly report for one batch, org-scoped. Three signal families:
--      fast_finisher      — total exam time < 25% of the batch median
--      answer_twins       — attempts sharing an IDENTICAL wrong-answer
--                           pattern (>= 3 wrong answers). Signature-based
--                           (md5 of the wrong-answer set) so it runs O(n);
--                           a pairwise similarity join blew temp disk at
--                           ~1800 attempts — never do that.
--      integrity_signals  — tab switches + fullscreen exits + copy attempts
CREATE OR REPLACE FUNCTION public.anomaly_report(p_batch_id uuid)
RETURNS TABLE (
  kind        text,
  roll_a      text,
  name_a      text,
  roll_b      text,   -- only for answer_twins
  name_b      text,
  metric      numeric,
  detail      text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH submitted AS (
    SELECT a.id, a.roll_number, a.student_name,
           extract(epoch FROM (a.submitted_at - a.started_at)) AS dur_s
    FROM public.attempts a
    WHERE a.batch_id = p_batch_id AND a.submitted_at IS NOT NULL
  ),
  med AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY dur_s) AS median_s FROM submitted
  ),
  fast AS (
    SELECT 'fast_finisher'::text AS kind,
           s.roll_number, s.student_name,
           NULL::text AS roll_b, NULL::text AS name_b,
           round(s.dur_s::numeric, 0) AS metric,
           'finished in ' || round((s.dur_s / 60.0)::numeric, 1) || ' min vs batch median ' || round((m.median_s / 60.0)::numeric, 1) || ' min' AS detail
    FROM submitted s, med m
    WHERE m.median_s > 0 AND s.dur_s < m.median_s * 0.25
  ),
  wrong_sigs AS (
    SELECT r.attempt_id,
           md5(string_agg(r.question_id::text || ':' || r.selected_answer, ',' ORDER BY r.question_id)) AS sig,
           COUNT(*) AS n_wrong
    FROM public.responses r
    JOIN submitted s ON s.id = r.attempt_id
    WHERE NOT r.is_correct
    GROUP BY r.attempt_id
    HAVING COUNT(*) >= 3
  ),
  sig_groups AS (
    SELECT sig, n_wrong, COUNT(*) AS group_size
    FROM wrong_sigs
    GROUP BY sig, n_wrong
    HAVING COUNT(*) > 1
  ),
  twins AS (
    SELECT 'answer_twins'::text,
           s.roll_number, s.student_name,
           NULL::text, NULL::text,
           g.group_size::numeric,
           'identical wrong-answer pattern (' || g.n_wrong || ' wrong answers) shared by '
             || g.group_size || ' students — signature ' || left(g.sig, 8)
    FROM sig_groups g
    JOIN wrong_sigs w ON w.sig = g.sig
    JOIN submitted s ON s.id = w.attempt_id
  ),
  signals AS (
    SELECT 'integrity_signals'::text,
           a.roll_number, a.student_name,
           NULL::text, NULL::text,
           (coalesce(t.n, 0) + coalesce(e.n, 0))::numeric,
           coalesce(t.n, 0) || ' tab switch(es), '
             || coalesce(e.fs, 0) || ' fullscreen exit(s), '
             || coalesce(e.cp, 0) || ' copy attempt(s)'
    FROM public.attempts a
    LEFT JOIN (
      SELECT attempt_id, COUNT(*) AS n FROM public.tab_switches GROUP BY attempt_id
    ) t ON t.attempt_id = a.id
    LEFT JOIN (
      SELECT attempt_id, COUNT(*) AS n,
             COUNT(*) FILTER (WHERE event_type = 'fullscreen_exit') AS fs,
             COUNT(*) FILTER (WHERE event_type = 'copy_attempt')    AS cp
      FROM public.integrity_events GROUP BY attempt_id
    ) e ON e.attempt_id = a.id
    WHERE a.batch_id = p_batch_id
      AND (coalesce(t.n, 0) + coalesce(e.n, 0)) >= 3
  )
  SELECT * FROM fast
  UNION ALL SELECT * FROM twins
  UNION ALL SELECT * FROM signals
  WHERE public.batch_in_my_org(p_batch_id)
$$;
REVOKE ALL ON FUNCTION public.anomaly_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anomaly_report(uuid) TO authenticated;

-- ── Organizations / presence (015, 021) ───────────────────────────

-- 4.24 One heartbeat to rule them all: validates session, stamps presence,
--      returns batch status + extension. Replaces the client's separate
--      check_session call AND useTimer's 30s batch-status poll.
CREATE OR REPLACE FUNCTION public.exam_heartbeat(
  p_attempt_id    uuid,
  p_session_token uuid
)
RETURNS TABLE (valid boolean, batch_status text, extra_time_minutes int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_valid  boolean;
  v_status text;
  v_extra  int;
BEGIN
  UPDATE public.attempts a
  SET last_seen = now()
  FROM public.batches b
  WHERE a.id = p_attempt_id
    AND b.id = a.batch_id
    AND a.session_token = p_session_token
    AND a.submitted_at IS NULL
  RETURNING true, b.status, a.extra_time_minutes
  INTO v_valid, v_status, v_extra;

  IF v_valid IS NULL THEN
    -- Session invalid/closed — still report batch status if resolvable
    SELECT false, b.status, 0 INTO v_valid, v_status, v_extra
    FROM public.attempts a JOIN public.batches b ON b.id = a.batch_id
    WHERE a.id = p_attempt_id;
  END IF;

  RETURN QUERY SELECT coalesce(v_valid, false), v_status, coalesce(v_extra, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.exam_heartbeat(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_heartbeat(uuid, uuid) TO anon, authenticated;

-- 4.25 Admin grants extra time (mission control), org-scoped. Audit-logged.
CREATE OR REPLACE FUNCTION public.grant_time_extension(
  p_attempt_id uuid,
  p_minutes    int
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_roll text;
BEGIN
  IF NOT public.attempt_in_my_org(p_attempt_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) = 'viewer' THEN RAISE EXCEPTION 'Viewers cannot grant extensions'; END IF;
  IF p_minutes < 0 OR p_minutes > 240 THEN RAISE EXCEPTION 'Extension must be 0–240 minutes'; END IF;

  UPDATE public.attempts SET extra_time_minutes = p_minutes
  WHERE id = p_attempt_id AND submitted_at IS NULL
  RETURNING roll_number INTO v_roll;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found or already submitted'; END IF;

  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('time_extension_granted', 'attempt', p_attempt_id,
          coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'unknown'),
          jsonb_build_object('roll_number', v_roll, 'minutes', p_minutes));
END;
$$;
REVOKE ALL ON FUNCTION public.grant_time_extension(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_time_extension(uuid, int) TO authenticated;

-- 4.26 Mission control snapshot, org-scoped: one RPC, one round trip,
--      ~2000 rows max. 'disconnected' = no heartbeat for 90s (3 missed beats).
CREATE OR REPLACE FUNCTION public.mission_control(p_batch_id uuid)
RETURNS TABLE (
  attempt_id     uuid,
  roll_number    text,
  student_name   text,
  state          text,           -- in_exam | disconnected | submitted
  started_at     timestamptz,
  submitted_at   timestamptz,
  last_seen      timestamptz,
  answers_saved  bigint,
  extra_time_minutes int,
  tab_switches   bigint,
  integrity_flags bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    a.id,
    a.roll_number,
    a.student_name,
    CASE
      WHEN a.submitted_at IS NOT NULL THEN 'submitted'
      WHEN a.last_seen IS NULL OR a.last_seen < now() - interval '90 seconds' THEN 'disconnected'
      ELSE 'in_exam'
    END,
    a.started_at,
    a.submitted_at,
    a.last_seen,
    (SELECT COUNT(*) FROM public.responses r WHERE r.attempt_id = a.id),
    a.extra_time_minutes,
    (SELECT COUNT(*) FROM public.tab_switches t WHERE t.attempt_id = a.id),
    (SELECT COUNT(*) FROM public.integrity_events e WHERE e.attempt_id = a.id)
  FROM public.attempts a
  WHERE a.batch_id = p_batch_id AND public.batch_in_my_org(p_batch_id)
  ORDER BY a.roll_number
$$;
REVOKE ALL ON FUNCTION public.mission_control(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mission_control(uuid) TO authenticated;

-- ── Certificates (016, 021, 025) ──────────────────────────────────

-- 4.27 Code generator: BV-XXXX-XXXX-XXXX, unambiguous alphabet (no 0/O/1/I)
CREATE OR REPLACE FUNCTION public.gen_certificate_code()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  chars  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := 'BV';
  i      int;
BEGIN
  FOR i IN 1..12 LOOP
    IF i % 4 = 1 THEN result := result || '-'; END IF;
    result := result || substr(chars, 1 + floor(random() * 32)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- 4.28 Issue certificates for a completed/active batch, org-scoped,
--      owner/examiner only (idempotent).
CREATE OR REPLACE FUNCTION public.issue_certificates(p_batch_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch   record;
  v_actor   text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'unknown');
  v_count   int := 0;
  v_attempt record;
  v_pct     int;
  v_passed  boolean;
  v_code    text;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN
    RAISE EXCEPTION 'Only owners and examiners can issue certificates';
  END IF;

  SELECT * INTO v_batch FROM public.batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;

  FOR v_attempt IN
    -- Latest submitted attempt per roll number only
    SELECT DISTINCT ON (a.roll_number) a.*
    FROM public.attempts a
    WHERE a.batch_id = p_batch_id AND a.submitted_at IS NOT NULL
    ORDER BY a.roll_number, a.attempt_number DESC
  LOOP
    v_pct := CASE WHEN v_attempt.total_questions > 0
                  THEN round((v_attempt.score::numeric / v_attempt.total_questions) * 100)
                  ELSE 0 END;
    v_passed := v_batch.pass_percentage IS NULL OR v_pct >= v_batch.pass_percentage;

    -- Pass-gated when the batch defines a pass mark
    CONTINUE WHEN v_batch.pass_percentage IS NOT NULL AND NOT v_passed;
    -- Idempotency: skip already-certified attempts
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.certificates c WHERE c.attempt_id = v_attempt.id);

    -- Retry on the cosmically unlikely code collision
    LOOP
      v_code := public.gen_certificate_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.certificate_code = v_code);
    END LOOP;

    INSERT INTO public.certificates
      (certificate_code, attempt_id, batch_id, student_name, roll_number,
       exam_name, score, total_questions, percentage, passed, issued_by)
    VALUES
      (v_code, v_attempt.id, p_batch_id, v_attempt.student_name, v_attempt.roll_number,
       v_batch.name, v_attempt.score, v_attempt.total_questions, v_pct, v_passed, v_actor);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('certificates_issued', 'batch', p_batch_id, v_actor,
          jsonb_build_object('batch_name', v_batch.name, 'count', v_count));

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_certificates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_certificates(uuid) TO authenticated;

-- 4.29 Public verification: exact-match only, certificate-face fields only.
CREATE OR REPLACE FUNCTION public.verify_certificate(p_code text)
RETURNS TABLE (
  valid        boolean,
  student_name text,
  exam_name    text,
  percentage   int,
  issued_at    timestamptz,
  revoked      boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (NOT c.revoked) AS valid,
    c.student_name,
    c.exam_name,
    c.percentage,
    c.issued_at,
    c.revoked
  FROM public.certificates c
  WHERE c.certificate_code = upper(trim(p_code))
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.verify_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;

-- 4.30 Certificate revocation (owner/examiner, org-scoped)
CREATE OR REPLACE FUNCTION public.revoke_certificate(p_certificate_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_batch uuid; v_code text;
BEGIN
  SELECT batch_id, certificate_code INTO v_batch, v_code FROM public.certificates WHERE id = p_certificate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate not found'; END IF;
  IF NOT public.batch_in_my_org(v_batch) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Your role cannot revoke certificates'; END IF;
  UPDATE public.certificates SET revoked = true, revoked_reason = p_reason WHERE id = p_certificate_id;
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('certificate_revoked','certificate',p_certificate_id, coalesce(current_setting('request.jwt.claims',true)::json->>'email','unknown'),
          jsonb_build_object('code',v_code,'reason',p_reason));
END; $$;
REVOKE ALL ON FUNCTION public.revoke_certificate(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_certificate(uuid, text) TO authenticated;

-- 4.31 Restore (un-revoke), same gate
CREATE OR REPLACE FUNCTION public.restore_certificate(p_certificate_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_batch uuid; v_code text;
BEGIN
  SELECT batch_id, certificate_code INTO v_batch, v_code FROM public.certificates WHERE id = p_certificate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate not found'; END IF;
  IF NOT public.batch_in_my_org(v_batch) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Your role cannot restore certificates'; END IF;
  UPDATE public.certificates SET revoked = false, revoked_reason = NULL WHERE id = p_certificate_id;
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('certificate_restored','certificate',p_certificate_id, coalesce(current_setting('request.jwt.claims',true)::json->>'email','unknown'),
          jsonb_build_object('code',v_code));
END; $$;
REVOKE ALL ON FUNCTION public.restore_certificate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_certificate(uuid) TO authenticated;

-- ── Exam series (018, 021, 022) ───────────────────────────────────

-- 4.32 Sync the series roster into every attached module batch (replace).
--      One roster, defined once, enforced everywhere.
CREATE OR REPLACE FUNCTION public.sync_series_roster(p_series_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batches int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN
    RAISE EXCEPTION 'Viewers cannot sync rosters';
  END IF;

  DELETE FROM public.roster r
  USING public.batches b, public.series_modules m
  WHERE r.batch_id = b.id AND b.series_module_id = m.id AND m.series_id = p_series_id;

  INSERT INTO public.roster (batch_id, roll_number, student_name, email)
  SELECT b.id, sr.roll_number, sr.student_name, sr.email
  FROM public.series_roster sr
  CROSS JOIN public.batches b
  JOIN public.series_modules m ON m.id = b.series_module_id
  WHERE sr.series_id = p_series_id AND m.series_id = p_series_id;

  SELECT COUNT(DISTINCT b.id) INTO v_batches
  FROM public.batches b JOIN public.series_modules m ON m.id = b.series_module_id
  WHERE m.series_id = p_series_id;

  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('series_roster_synced', 'exam_series', p_series_id,
          coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'unknown'),
          jsonb_build_object('batches', v_batches));

  RETURN v_batches;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_series_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_series_roster(uuid) TO authenticated;

-- 4.33 Admin aggregate, org-scoped via series: one row per (rostered
--      student × module), plus the weighted aggregate. Best submitted
--      attempt across a module's batches (main or make-up) counts. Admin
--      sees everything incl. hidden results.
CREATE OR REPLACE FUNCTION public.series_results(p_series_id uuid)
RETURNS TABLE (
  roll_number      text,
  student_name     text,
  module_position  int,
  module_label     text,
  weight_marks     int,
  module_status    text,      -- absent | passed | failed | completed (no module pass mark)
  raw_score        int,
  raw_total        int,
  weighted_marks   numeric,   -- pct × weight
  aggregate_marks  numeric,   -- same per student on every row (window sum)
  aggregate_passed boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH best AS (
    -- best submitted attempt per (roll, module) across all its batches
    SELECT DISTINCT ON (a.roll_number, m.id)
      a.roll_number, m.id AS module_id,
      a.score, a.total_questions, b.pass_percentage
    FROM public.attempts a
    JOIN public.batches b ON b.id = a.batch_id
    JOIN public.series_modules m ON m.id = b.series_module_id
    WHERE m.series_id = p_series_id AND a.submitted_at IS NOT NULL
    ORDER BY a.roll_number, m.id,
             (CASE WHEN a.total_questions > 0 THEN a.score::numeric / a.total_questions ELSE 0 END) DESC
  ),
  grid AS (
    SELECT sr.roll_number, sr.student_name, m.id AS module_id, m.position, m.label, m.weight_marks,
           bst.score, bst.total_questions, bst.pass_percentage,
           CASE WHEN bst.total_questions > 0
                THEN round(bst.score::numeric / bst.total_questions * m.weight_marks, 1)
                WHEN bst.total_questions IS NOT NULL THEN 0
                ELSE NULL END AS weighted
    FROM public.series_roster sr
    CROSS JOIN public.series_modules m
    LEFT JOIN best bst ON bst.roll_number = sr.roll_number AND bst.module_id = m.id
    WHERE sr.series_id = p_series_id AND m.series_id = p_series_id
  )
  SELECT
    g.roll_number,
    g.student_name,
    g.position,
    g.label,
    g.weight_marks,
    CASE
      WHEN g.total_questions IS NULL THEN 'absent'
      WHEN g.pass_percentage IS NULL THEN 'completed'
      WHEN g.total_questions > 0 AND round(g.score::numeric / g.total_questions * 100) >= g.pass_percentage THEN 'passed'
      ELSE 'failed'
    END,
    g.score,
    g.total_questions,
    g.weighted,
    sum(coalesce(g.weighted, 0)) OVER (PARTITION BY g.roll_number),
    sum(coalesce(g.weighted, 0)) OVER (PARTITION BY g.roll_number)
      >= coalesce((SELECT s.aggregate_pass_marks FROM public.exam_series s WHERE s.id = p_series_id), 0)
  FROM grid g
  WHERE public.series_in_my_org(p_series_id)
  ORDER BY g.roll_number, g.position
$$;
REVOKE ALL ON FUNCTION public.series_results(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.series_results(uuid) TO authenticated;

-- 4.34 Student standing: running total with visibility respected.
--      Ownership verified by EMAIL against the series roster (audit-2 H2).
--      Hidden-result modules report 'pending' and are EXCLUDED from the
--      visible running total — no leak.
CREATE OR REPLACE FUNCTION public.get_my_series_standing(
  p_series_id   uuid,
  p_roll_number text,
  p_email       text
)
RETURNS TABLE (
  series_name          text,
  module_position      int,
  module_label         text,
  weight_marks         int,
  status               text,     -- upcoming | absent | pending | scored
  my_marks             numeric,  -- NULL unless scored
  running_total        numeric,  -- same on each row; visible modules only
  visible_weight_total int       -- denominator the student can see so far
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT sr.roll_number FROM public.series_roster sr
    WHERE sr.series_id = p_series_id AND sr.roll_number = p_roll_number AND lower(sr.email) = lower(p_email)
  ),
  ser AS (
    SELECT s.name, s.show_running_total FROM public.exam_series s WHERE s.id = p_series_id
  ),
  best AS (
    SELECT DISTINCT ON (m.id)
      m.id AS module_id, a.score, a.total_questions, b.show_results
    FROM public.attempts a
    JOIN public.batches b ON b.id = a.batch_id
    JOIN public.series_modules m ON m.id = b.series_module_id
    JOIN me ON me.roll_number = a.roll_number
    WHERE m.series_id = p_series_id AND a.submitted_at IS NOT NULL
    ORDER BY m.id,
             (CASE WHEN a.total_questions > 0 THEN a.score::numeric / a.total_questions ELSE 0 END) DESC
  ),
  module_state AS (
    SELECT m.position, m.label, m.weight_marks,
           bst.score, bst.total_questions, bst.show_results,
           -- a module is 'upcoming' if none of its batches has started yet
           NOT EXISTS (
             SELECT 1 FROM public.batches b
             WHERE b.series_module_id = m.id AND b.status IN ('active','completed')
           ) AS upcoming,
           CASE WHEN bst.show_results AND bst.total_questions > 0
                THEN round(bst.score::numeric / bst.total_questions * m.weight_marks, 1)
                WHEN bst.show_results THEN 0
                ELSE NULL END AS visible_marks
    FROM public.series_modules m
    LEFT JOIN best bst ON bst.module_id = m.id
    WHERE m.series_id = p_series_id
  )
  SELECT
    (SELECT name FROM ser),
    ms.position,
    ms.label,
    ms.weight_marks,
    CASE
      WHEN ms.total_questions IS NOT NULL AND ms.show_results THEN 'scored'
      WHEN ms.total_questions IS NOT NULL THEN 'pending'
      WHEN ms.upcoming THEN 'upcoming'
      ELSE 'absent'
    END,
    ms.visible_marks,
    sum(coalesce(ms.visible_marks, 0)) OVER (),
    sum(CASE WHEN ms.visible_marks IS NOT NULL THEN ms.weight_marks ELSE 0 END) OVER ()
  FROM module_state ms
  WHERE EXISTS (SELECT 1 FROM me)
    AND (SELECT show_running_total FROM ser)
  ORDER BY ms.position
$$;
REVOKE ALL ON FUNCTION public.get_my_series_standing(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_series_standing(uuid, text, text) TO anon, authenticated;

-- 4.35 Map a batch to its series (anon-safe id lookup for the result screen)
CREATE OR REPLACE FUNCTION public.get_batch_series(p_batch_id uuid)
RETURNS TABLE (series_id uuid, series_name text, module_label text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, m.label
  FROM public.batches b
  JOIN public.series_modules m ON m.id = b.series_module_id
  JOIN public.exam_series s ON s.id = m.series_id
  WHERE b.id = p_batch_id AND s.show_running_total
$$;
REVOKE ALL ON FUNCTION public.get_batch_series(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_batch_series(uuid) TO anon, authenticated;

-- ── Exam discovery + rate limiting (019, 020, 026) ────────────────

-- 4.36 Discovery code generator: 8 chars (020; routing key, not a secret),
--      unambiguous alphabet. Existing 6-char codes (pre-020) keep working.
CREATE OR REPLACE FUNCTION public.gen_exam_code()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  chars  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i      int;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, 1 + floor(random() * 32)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- 4.37 Best-effort client IP from the proxy headers (Vercel/Supabase set XFF)
CREATE OR REPLACE FUNCTION public.client_ip()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(split_part(coalesce(
    current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1), '')
$$;

-- 4.38 Record a failure for (action, ip) in a fixed window; raise once
--      over the cap. Called only from within other SECURITY DEFINER
--      functions (find_batch_by_code, verify_roster_identity) — no
--      direct EXECUTE grant is needed or given.
CREATE OR REPLACE FUNCTION public.bump_rate(p_action text, p_max int, p_window_secs int DEFAULT 900)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ip text; v_bucket text; v_n int;
BEGIN
  v_ip := public.client_ip();
  IF v_ip IS NULL THEN RETURN; END IF;  -- no resolvable IP → don't throttle (never block legit traffic)
  v_bucket := p_action || ':' || v_ip || ':' || floor(extract(epoch FROM now()) / p_window_secs)::text;
  INSERT INTO public.rate_limits(bucket, n, updated) VALUES (v_bucket, 1, now())
    ON CONFLICT (bucket) DO UPDATE SET n = rate_limits.n + 1, updated = now()
    RETURNING n INTO v_n;
  IF v_n > p_max THEN
    RAISE EXCEPTION 'Too many attempts. Please wait a few minutes and try again.';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.bump_rate(text, int, int) FROM PUBLIC;

-- 4.39 Code gate: find a joinable exam by its code. Anon-safe — returns
--      only the public column set, only for scheduled/active batches.
--      Counts MISSES only (legit code entry = a hit = no count).
CREATE OR REPLACE FUNCTION public.find_batch_by_code(p_code text)
RETURNS TABLE (
  id uuid, name text, scheduled_start timestamptz, duration_minutes int,
  status text, questions_per_student int, has_access_code boolean,
  show_results boolean, pass_percentage int, max_attempts int,
  organization_id uuid, series_module_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT b.id, b.name, b.scheduled_start, b.duration_minutes,
           b.status, b.questions_per_student, b.has_access_code,
           b.show_results, b.pass_percentage, b.max_attempts,
           b.organization_id, b.series_module_id
    FROM public.batches b
    WHERE upper(b.access_code) = upper(trim(p_code))
      AND b.status IN ('scheduled','active')
    LIMIT 1;
  IF NOT FOUND THEN
    PERFORM public.bump_rate('find_miss', 25);  -- ~25 wrong codes / 15 min / IP
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.find_batch_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_batch_by_code(text) TO anon, authenticated;

-- 4.40 Roster identity check: roll + email must BOTH match. Returns the
--      roster name only on a full match; on mismatch reveals nothing —
--      not even whether the roll exists. Counts failed identity probes
--      only (real roster, no match).
CREATE OR REPLACE FUNCTION public.verify_roster_identity(
  p_batch_id uuid, p_roll_number text, p_email text
)
RETURNS TABLE (has_roster boolean, matched boolean, student_name text, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_has boolean; v_name text; v_email text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.roster WHERE batch_id = p_batch_id) INTO v_has;
  SELECT ro.student_name, ro.email INTO v_name, v_email
  FROM public.roster ro JOIN public.batches b ON b.id = ro.batch_id
  WHERE ro.batch_id = p_batch_id
    AND ro.roll_number = trim(p_roll_number)
    AND lower(ro.email) = lower(trim(p_email))
    AND b.status IN ('scheduled','active')
  LIMIT 1;

  IF v_has AND v_name IS NULL THEN
    PERFORM public.bump_rate('identity_miss', 25);  -- failed roll+email guesses
  END IF;

  RETURN QUERY SELECT v_has, (v_name IS NOT NULL), v_name, v_email;
END; $$;
REVOKE ALL ON FUNCTION public.verify_roster_identity(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_roster_identity(uuid, text, text) TO anon, authenticated;

-- ── Program analytics (024) ───────────────────────────────────────

-- 4.41 One row per completed/active batch the caller is allowed to see,
--      with submission counts, average score, and pass rate. Powers the
--      Insights dashboard's trend and distribution charts. Org-scoped.
CREATE OR REPLACE FUNCTION public.program_analytics()
RETURNS TABLE (
  batch_id        uuid,
  batch_name      text,
  scheduled_start timestamptz,
  status          text,
  pass_percentage int,
  submissions     bigint,
  avg_percentage  numeric,
  pass_rate       numeric        -- NULL when no pass mark set
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    b.id,
    b.name,
    b.scheduled_start,
    b.status,
    b.pass_percentage,
    COUNT(a.id) FILTER (WHERE a.submitted_at IS NOT NULL) AS submissions,
    round(avg(CASE WHEN a.submitted_at IS NOT NULL AND a.total_questions > 0
                   THEN a.score::numeric / a.total_questions * 100 END), 1) AS avg_percentage,
    CASE WHEN b.pass_percentage IS NULL THEN NULL
         ELSE round(
           100.0 * COUNT(a.id) FILTER (
             WHERE a.submitted_at IS NOT NULL AND a.total_questions > 0
               AND round(a.score::numeric / a.total_questions * 100) >= b.pass_percentage
           ) / NULLIF(COUNT(a.id) FILTER (WHERE a.submitted_at IS NOT NULL), 0), 0)
    END AS pass_rate
  FROM public.batches b
  LEFT JOIN public.attempts a ON a.batch_id = b.id
  WHERE b.status IN ('active','completed')
    AND public.batch_in_my_org(b.id)
  GROUP BY b.id, b.name, b.scheduled_start, b.status, b.pass_percentage
  ORDER BY b.scheduled_start
$$;
REVOKE ALL ON FUNCTION public.program_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.program_analytics() TO authenticated;

-- 4.25 Pairwise similarity matrix (028) — one compact row per submitted
--      attempt for client-side collusion forensics. The O(n^2) pair
--      comparison deliberately does NOT happen in SQL: a pairwise
--      similarity join blew temp disk at ~1800 attempts. Same WHERE-
--      gating pattern as item_analysis: non-admin / foreign org get [].
CREATE OR REPLACE FUNCTION public.batch_similarity_matrix(p_batch_id uuid)
RETURNS TABLE (
  attempt_id     uuid,
  roll_number    text,
  student_name   text,
  attempt_number int,
  answers        jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.roll_number, a.student_name, a.attempt_number,
         jsonb_object_agg(r.question_id, r.selected_answer)
  FROM public.attempts a
  JOIN public.responses r ON r.attempt_id = a.id
  WHERE a.batch_id = p_batch_id
    AND a.submitted_at IS NOT NULL
    AND public.is_admin()
    AND public.batch_in_my_org(p_batch_id)
  GROUP BY a.id, a.roll_number, a.student_name, a.attempt_number
$$;
REVOKE ALL ON FUNCTION public.batch_similarity_matrix(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_similarity_matrix(uuid) TO authenticated;


-- ----------------------------------------------------------------
-- Late-answer mercy queue (029)
-- ----------------------------------------------------------------
-- Post-deadline buffered answers land here quarantined; the operator
-- accepts (answer applied + attempt rescored) or rejects each one.
-- Deadline stays authoritative — nothing is scored automatically.
CREATE TABLE IF NOT EXISTS public.late_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      uuid NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_answer text NOT NULL CHECK (selected_answer IN ('A','B','C','D')),
  time_spent_ms   int CHECK (time_spent_ms IS NULL OR time_spent_ms >= 0),
  client_seq      bigint,
  client_saved_at timestamptz,          -- client clock: display context only, never trusted
  received_at     timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'quarantined'
                  CHECK (status IN ('quarantined','accepted','rejected')),
  reviewed_by     text,
  reviewed_at     timestamptz,
  CONSTRAINT late_responses_attempt_question_unique UNIQUE (attempt_id, question_id)
);

ALTER TABLE public.late_responses ENABLE ROW LEVEL SECURITY;

-- Admins read their org's quarantine queue; all writes go through RPCs.
CREATE POLICY late_responses_select_admin ON public.late_responses
  FOR SELECT TO authenticated
  USING (is_admin() AND attempt_in_my_org(attempt_id));

-- ----------------------------------------------------------------
-- Student-side deposit: session-token gated, grace-window bounded.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_late_buffer(
  p_attempt_id    uuid,
  p_session_token uuid,
  p_responses     jsonb
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch_id   uuid;
  v_deadline   timestamptz;
  v_item       jsonb;
  v_qid        uuid;
  v_ans        text;
  v_saved      int := 0;
  v_rows       int;
BEGIN
  -- Ownership: the token issued to this device for this attempt.
  SELECT a.batch_id,
         b.scheduled_start + (b.duration_minutes + a.extra_time_minutes) * interval '1 minute'
  INTO v_batch_id, v_deadline
  FROM public.attempts a
  JOIN public.batches b ON b.id = a.batch_id
  WHERE a.id = p_attempt_id AND a.session_token = p_session_token;
  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Invalid session';
  END IF;

  -- Only meaningful after the deadline, and only within a bounded grace
  -- window — this is outage recovery, not an open submission channel.
  IF now() <= v_deadline THEN
    RAISE EXCEPTION 'Exam is still open — use the normal save path';
  END IF;
  IF now() > v_deadline + interval '30 minutes' THEN
    RAISE EXCEPTION 'The late-delivery window has closed';
  END IF;

  IF p_responses IS NULL OR jsonb_typeof(p_responses) != 'array'
     OR jsonb_array_length(p_responses) > 200 THEN
    RAISE EXCEPTION 'Invalid payload';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_responses) LOOP
    v_qid := (v_item->>'question_id')::uuid;
    v_ans := upper(v_item->>'selected_answer');
    IF v_ans NOT IN ('A','B','C','D') THEN CONTINUE; END IF;
    -- Question must belong to this exam (no cross-batch writes).
    IF NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.id = v_qid AND q.batch_id = v_batch_id) THEN
      CONTINUE;
    END IF;
    -- Skip answers the server already has identically — nothing to review.
    IF EXISTS (SELECT 1 FROM public.responses r
               WHERE r.attempt_id = p_attempt_id AND r.question_id = v_qid
                 AND r.selected_answer = v_ans) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.late_responses
      (attempt_id, question_id, selected_answer, time_spent_ms, client_seq, client_saved_at)
    VALUES (
      p_attempt_id, v_qid, v_ans,
      NULLIF((v_item->>'time_spent_ms'), '')::int,
      NULLIF((v_item->>'client_seq'), '')::bigint,
      to_timestamp(NULLIF((v_item->>'client_saved_at'), '')::double precision / 1000.0)
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE
      SET selected_answer = EXCLUDED.selected_answer,
          time_spent_ms   = EXCLUDED.time_spent_ms,
          client_seq      = EXCLUDED.client_seq,
          client_saved_at = EXCLUDED.client_saved_at,
          received_at     = now()
      WHERE public.late_responses.status = 'quarantined';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_saved := v_saved + v_rows;
  END LOOP;

  RETURN v_saved;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_late_buffer(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_late_buffer(uuid, uuid, jsonb) TO anon, authenticated;

-- ----------------------------------------------------------------
-- Operator review: accept applies the answer and rescores; reject
-- keeps the record. Both stamp reviewer + audit_log.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_late_response(p_late_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row        public.late_responses%ROWTYPE;
  v_correct    text;
  v_is_correct boolean;
  v_email      text := (SELECT auth.jwt() ->> 'email');
BEGIN
  SELECT * INTO v_row FROM public.late_responses WHERE id = p_late_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF NOT public.is_admin() OR NOT public.attempt_in_my_org(v_row.attempt_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF v_row.status != 'quarantined' THEN
    RAISE EXCEPTION 'Already reviewed';
  END IF;

  IF p_accept THEN
    SELECT q.correct_answer INTO v_correct FROM public.questions q WHERE q.id = v_row.question_id;
    v_is_correct := (v_row.selected_answer = v_correct);
    -- is_correct set explicitly: immune to the responses trigger being
    -- INSERT-only (the upsert may take the UPDATE path).
    INSERT INTO public.responses (attempt_id, question_id, selected_answer, is_correct, time_spent_ms)
    VALUES (v_row.attempt_id, v_row.question_id, v_row.selected_answer, v_is_correct, v_row.time_spent_ms)
    ON CONFLICT (attempt_id, question_id) DO UPDATE
      SET selected_answer = EXCLUDED.selected_answer,
          is_correct      = EXCLUDED.is_correct,
          time_spent_ms   = EXCLUDED.time_spent_ms;
    -- Rescore from ground truth (only meaningful once submitted).
    UPDATE public.attempts a
    SET score = (SELECT count(*) FROM public.responses r
                 WHERE r.attempt_id = a.id AND r.is_correct)
    WHERE a.id = v_row.attempt_id AND a.submitted_at IS NOT NULL;
  END IF;

  UPDATE public.late_responses
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
      reviewed_by = v_email,
      reviewed_at = now()
  WHERE id = p_late_id;

  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES (
    CASE WHEN p_accept THEN 'late_response_accepted' ELSE 'late_response_rejected' END,
    'attempt', v_row.attempt_id, coalesce(v_email, 'unknown'),
    jsonb_build_object('late_id', p_late_id, 'question_id', v_row.question_id,
                       'selected_answer', v_row.selected_answer)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.review_late_response(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_late_response(uuid, boolean) TO authenticated;

-- ----------------------------------------------------------------
-- RLS auto-enable safety net (event trigger)
-- ----------------------------------------------------------------
-- Recovered from the live project (2026-07-16): present in production
-- but absent from every numbered migration — created ad-hoc during
-- security hardening. Any table created in public without RLS would
-- silently default to exposed; this trigger enables RLS on every new
-- table automatically, so a forgotten ENABLE ROW LEVEL SECURITY fails
-- closed instead of open. Note: CREATE EVENT TRIGGER may require
-- elevated privileges on some Postgres platforms (works as postgres
-- on Supabase).

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();

-- ----------------------------------------------------------------
-- Pinned search_path on trigger/helper functions (030, audit hardening)
-- ----------------------------------------------------------------
ALTER FUNCTION public.protect_active_batch()            SET search_path = public;
ALTER FUNCTION public.bank_question_workflow()          SET search_path = public;
ALTER FUNCTION public.gen_exam_code()                   SET search_path = public;
ALTER FUNCTION public.batches_autocode()                SET search_path = public;
ALTER FUNCTION public.get_server_time()                 SET search_path = public;
ALTER FUNCTION public.restrict_attempt_update_columns() SET search_path = public;
ALTER FUNCTION public.gen_certificate_code()            SET search_path = public;
ALTER FUNCTION public.client_ip()                       SET search_path = public;
