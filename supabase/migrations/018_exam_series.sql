-- ================================================================
-- 018: Exam series — modular assessment across an academic year
-- ================================================================
-- A series (e.g. "Sanskrit Foundations 2026–27, 100 marks") is made
-- of weighted module slots (20-20-20-40 or any split). Each slot is
-- examined by one or more batches (main sitting + optional make-up
-- sittings for absentees). The exam runtime is untouched — modules
-- are ordinary batches.
--
-- Agreed policies (partner college, June 2026):
-- * Absence: counts 0 until a make-up sitting is taken; reported as
--   "absent", never "failed".
-- * Pass: aggregate mark decides the series; per-module failures are
--   recorded and visible regardless.
-- * Identity: one series roster, synced to every module batch — same
--   roll number enforced structurally.
-- * Visibility: students see their running total, but only modules
--   whose batch has show_results = true contribute visibly (others
--   show "pending"), so hidden results never leak.
-- ================================================================

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

CREATE TABLE IF NOT EXISTS public.series_modules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id    uuid NOT NULL REFERENCES public.exam_series(id) ON DELETE CASCADE,
  position     int NOT NULL,
  label        text NOT NULL,
  weight_marks int NOT NULL CHECK (weight_marks > 0),
  UNIQUE (series_id, position)
);
ALTER TABLE public.series_modules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.series_roster (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id    uuid NOT NULL REFERENCES public.exam_series(id) ON DELETE CASCADE,
  roll_number  text NOT NULL,
  student_name text NOT NULL,
  email        text NOT NULL,
  UNIQUE (series_id, roll_number)
);
ALTER TABLE public.series_roster ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS series_module_id uuid REFERENCES public.series_modules(id),
  ADD COLUMN IF NOT EXISTS is_makeup boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_batches_series_module ON public.batches(series_module_id);

-- Students need to know a batch belongs to a series (for the running-total view)
GRANT SELECT (series_module_id, is_makeup) ON public.batches TO anon;

-- RLS: admin-managed, org-scoped like batches
CREATE POLICY exam_series_admin_select ON public.exam_series
  FOR SELECT TO authenticated
  USING (is_admin() AND (admin_org() IS NULL OR organization_id = admin_org()));
CREATE POLICY exam_series_admin_write ON public.exam_series
  FOR ALL TO authenticated
  USING (admin_role() IN ('owner','examiner') AND (admin_org() IS NULL OR organization_id = admin_org()))
  WITH CHECK (admin_role() IN ('owner','examiner') AND (admin_org() IS NULL OR organization_id = admin_org()));

CREATE POLICY series_modules_admin_select ON public.series_modules
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY series_modules_admin_write ON public.series_modules
  FOR ALL TO authenticated
  USING (admin_role() IN ('owner','examiner')) WITH CHECK (admin_role() IN ('owner','examiner'));

CREATE POLICY series_roster_admin_select ON public.series_roster
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY series_roster_admin_write ON public.series_roster
  FOR ALL TO authenticated
  USING (admin_role() IN ('owner','examiner')) WITH CHECK (admin_role() IN ('owner','examiner'));

-- ----------------------------------------------------------------
-- Sync the series roster into every attached module batch (replace).
-- One roster, defined once, enforced everywhere.
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- Admin aggregate: one row per (rostered student × module), plus the
-- weighted aggregate. Best submitted attempt across a module's batches
-- (main or make-up) counts. Admin sees everything incl. hidden results.
-- ----------------------------------------------------------------
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
  WHERE public.is_admin()
  ORDER BY g.roll_number, g.position
$$;
REVOKE ALL ON FUNCTION public.series_results(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.series_results(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- Student standing: running total with visibility respected.
-- Ownership: roll + name must match the series roster (same pattern
-- as get_my_attempt). Hidden-result modules report 'pending' and are
-- EXCLUDED from the visible running total — no leak.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_series_standing(
  p_series_id    uuid,
  p_roll_number  text,
  p_student_name text
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
    SELECT sr.roll_number, sr.student_name
    FROM public.series_roster sr
    WHERE sr.series_id = p_series_id
      AND sr.roll_number = p_roll_number
      AND sr.student_name = p_student_name
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

-- Map a batch to its series (anon-safe id lookup for the result screen)
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
