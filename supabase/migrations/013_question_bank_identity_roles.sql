-- ================================================================
-- 013: Bundle 2 foundation — question bank, student identity,
--      admin roles
-- ================================================================
-- Design principles:
-- * The existing `questions` table remains the FROZEN per-batch
--   paper. The bank composes INTO it (copy, not reference), so all
--   Bundle-1 mechanisms (encrypted paper, scoring trigger, shuffle)
--   are untouched. `questions.bank_question_id` provides lineage
--   for item analysis across exams.
-- * `students` is the persistent cross-exam identity. Attempts gain
--   a nullable student_id — fully backward compatible.
-- * `admin_users` replaces the hardcoded email in is_admin().
--   Roles: owner > examiner > viewer. The existing admin email is
--   seeded as owner, so nothing breaks on deploy.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Admin roles
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  role       text NOT NULL DEFAULT 'examiner' CHECK (role IN ('owner','examiner','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Seed the existing owner (idempotent)
INSERT INTO public.admin_users (email, role, created_by)
VALUES ('chinmay@matramedia.co.in', 'owner', 'migration_013')
ON CONFLICT (email) DO NOTHING;

-- is_admin(): any role grants admin UI access (back-compat).
-- SECURITY DEFINER so it can read admin_users regardless of caller.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.admin_users
    WHERE email = (SELECT auth.jwt() ->> 'email')
  )
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- Role helper for finer-grained checks (owner-only operations)
CREATE OR REPLACE FUNCTION public.admin_role()
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.admin_users
  WHERE email = (SELECT auth.jwt() ->> 'email')
$$;
REVOKE ALL ON FUNCTION public.admin_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_role() TO authenticated;

-- Only owners manage the admin list; all admins can see it
CREATE POLICY admin_users_select ON public.admin_users
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY admin_users_insert ON public.admin_users
  FOR INSERT TO authenticated WITH CHECK (admin_role() = 'owner');
CREATE POLICY admin_users_update ON public.admin_users
  FOR UPDATE TO authenticated USING (admin_role() = 'owner') WITH CHECK (admin_role() = 'owner');
CREATE POLICY admin_users_delete ON public.admin_users
  FOR DELETE TO authenticated USING (admin_role() = 'owner' AND email != (SELECT auth.jwt() ->> 'email'));

-- ----------------------------------------------------------------
-- 2. Question bank
-- ----------------------------------------------------------------
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
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Usage (denormalized for quick blueprint queries)
  times_used      int NOT NULL DEFAULT 0,
  last_used_at    timestamptz
);
ALTER TABLE public.bank_questions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bank_questions_topic ON public.bank_questions(topic, difficulty) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_bank_questions_status ON public.bank_questions(status);

-- Admins only; viewers read, examiners+ write, only the reviewer state
-- machine governs approval (enforced by trigger below)
CREATE POLICY bank_select ON public.bank_questions
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY bank_insert ON public.bank_questions
  FOR INSERT TO authenticated WITH CHECK (admin_role() IN ('owner','examiner'));
CREATE POLICY bank_update ON public.bank_questions
  FOR UPDATE TO authenticated USING (admin_role() IN ('owner','examiner')) WITH CHECK (admin_role() IN ('owner','examiner'));
CREATE POLICY bank_delete ON public.bank_questions
  FOR DELETE TO authenticated USING (admin_role() = 'owner');

-- Review-workflow guard:
-- * approval requires a DIFFERENT person than the author (four-eyes)
-- * any content edit to an approved question reverts it to draft + bumps version
CREATE OR REPLACE FUNCTION public.bank_question_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_editor text := coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'unknown');
BEGIN
  NEW.updated_at := now();

  -- Approving: must not be the author
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    IF v_editor = OLD.created_by THEN
      RAISE EXCEPTION 'A question cannot be approved by its author';
    END IF;
    NEW.reviewed_by := v_editor;
  END IF;

  -- Content edits to an approved question force re-review
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

-- Lineage: per-batch frozen questions remember their bank origin
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS bank_question_id uuid REFERENCES public.bank_questions(id);
CREATE INDEX IF NOT EXISTS idx_questions_bank_origin ON public.questions(bank_question_id);

-- ----------------------------------------------------------------
-- 3. Compose a batch paper from the bank by blueprint
--    blueprint: [{"topic":"Vedanta","difficulty":"easy","count":10}, ...]
--    Rules: approved questions only; least-recently-used first to
--    rotate the bank; APPENDS after existing sort_order (caller
--    normally composes into an empty batch).
-- ----------------------------------------------------------------
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
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN
    RAISE EXCEPTION 'Viewers cannot compose papers';
  END IF;

  SELECT status INTO v_status FROM public.batches WHERE id = p_batch_id;
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

-- ----------------------------------------------------------------
-- 4. Student identity (persistent, cross-exam)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL UNIQUE,
  full_name    text NOT NULL,
  phone        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Admin-only direct access; students are linked server-side via RPCs
CREATE POLICY students_admin_select ON public.students
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY students_admin_write ON public.students
  FOR ALL TO authenticated USING (admin_role() IN ('owner','examiner')) WITH CHECK (admin_role() IN ('owner','examiner'));

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON public.attempts(student_id);

-- Link/create identity at attempt creation (email is the join key).
-- Replaces create_attempt: same signature + behavior, plus identity link.
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

-- Backfill: link historical attempts that carry an email
INSERT INTO public.students (email, full_name)
SELECT DISTINCT ON (lower(a.email)) lower(a.email), a.student_name
FROM public.attempts a
WHERE a.email IS NOT NULL AND a.email != ''
ORDER BY lower(a.email), a.started_at DESC
ON CONFLICT (email) DO NOTHING;

UPDATE public.attempts a
SET student_id = s.id
FROM public.students s
WHERE a.student_id IS NULL
  AND a.email IS NOT NULL
  AND lower(a.email) = s.email;
