-- ================================================================
-- 023: Per-org question bank + org-scoped audit log
-- ================================================================
-- bank_questions gains organization_id:
--   NULL          → shared question, visible to every org (master content)
--   <org id>      → private to that institution
-- Org admins see their org's questions + shared; global admins see all.
-- compose_batch_from_bank pulls only (batch's org) + shared.
--
-- audit_log: select scoped by resolving each entry's entity to its org,
-- so an org admin sees only audit entries for their own batches /
-- attempts / series (global admins see everything).
-- ================================================================

-- ── Question bank org ownership ───────────────────────────────
ALTER TABLE public.bank_questions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- Existing IKS content belongs to BharatVidya (private), not shared
UPDATE public.bank_questions
SET organization_id = (SELECT id FROM public.organizations WHERE name = 'BharatVidya')
WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_questions_org ON public.bank_questions(organization_id);

-- On insert, default to the author's org (global admins → NULL = shared)
CREATE OR REPLACE FUNCTION public.bank_questions_set_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.admin_org();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bank_questions_set_org ON public.bank_questions;
CREATE TRIGGER bank_questions_set_org
  BEFORE INSERT ON public.bank_questions
  FOR EACH ROW EXECUTE FUNCTION bank_questions_set_org();

-- Replace bank policies with org-aware versions
DROP POLICY IF EXISTS bank_select ON public.bank_questions;
CREATE POLICY bank_select ON public.bank_questions
  FOR SELECT TO authenticated
  USING (public.is_admin() AND (
    public.admin_org() IS NULL OR organization_id = public.admin_org() OR organization_id IS NULL
  ));

DROP POLICY IF EXISTS bank_insert ON public.bank_questions;
CREATE POLICY bank_insert ON public.bank_questions
  FOR INSERT TO authenticated
  WITH CHECK (admin_role() IN ('owner','examiner') AND (
    public.admin_org() IS NULL OR organization_id = public.admin_org()
  ));

DROP POLICY IF EXISTS bank_update ON public.bank_questions;
CREATE POLICY bank_update ON public.bank_questions
  FOR UPDATE TO authenticated
  USING (admin_role() IN ('owner','examiner') AND (public.admin_org() IS NULL OR organization_id = public.admin_org()))
  WITH CHECK (admin_role() IN ('owner','examiner') AND (public.admin_org() IS NULL OR organization_id = public.admin_org()));

DROP POLICY IF EXISTS bank_delete ON public.bank_questions;
CREATE POLICY bank_delete ON public.bank_questions
  FOR DELETE TO authenticated
  USING (admin_role() = 'owner' AND (public.admin_org() IS NULL OR organization_id = public.admin_org()));

-- compose: pull from the batch's org + shared questions only
CREATE OR REPLACE FUNCTION public.compose_batch_from_bank(p_batch_id uuid, p_blueprint jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rule jsonb; v_count int; v_added int := 0; v_sort int; v_status text; v_available int; v_org uuid;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Viewers cannot compose papers'; END IF;
  SELECT status, organization_id INTO v_status, v_org FROM public.batches WHERE id = p_batch_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_status NOT IN ('draft','scheduled') THEN RAISE EXCEPTION 'Cannot compose into a batch with status %', v_status; END IF;
  SELECT coalesce(max(sort_order),0) INTO v_sort FROM public.questions WHERE batch_id = p_batch_id;
  FOR v_rule IN SELECT * FROM jsonb_array_elements(p_blueprint) LOOP
    v_count := (v_rule->>'count')::int;
    IF v_count IS NULL OR v_count < 1 THEN RAISE EXCEPTION 'Each blueprint rule needs a positive count'; END IF;
    SELECT COUNT(*) INTO v_available FROM public.bank_questions bq
    WHERE bq.status='approved' AND bq.topic=(v_rule->>'topic')
      AND (bq.organization_id = v_org OR bq.organization_id IS NULL)
      AND (v_rule->>'difficulty' IS NULL OR bq.difficulty=(v_rule->>'difficulty'))
      AND (v_rule->>'language' IS NULL OR bq.language=(v_rule->>'language'))
      AND NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.batch_id=p_batch_id AND q.bank_question_id=bq.id);
    IF v_available < v_count THEN RAISE EXCEPTION 'Bank has only % approved question(s) for topic=% difficulty=% (need %)', v_available, v_rule->>'topic', coalesce(v_rule->>'difficulty','any'), v_count; END IF;
    WITH picked AS (
      SELECT bq.id, bq.question_text, bq.option_a, bq.option_b, bq.option_c, bq.option_d, bq.correct_answer
      FROM public.bank_questions bq
      WHERE bq.status='approved' AND bq.topic=(v_rule->>'topic')
        AND (bq.organization_id = v_org OR bq.organization_id IS NULL)
        AND (v_rule->>'difficulty' IS NULL OR bq.difficulty=(v_rule->>'difficulty'))
        AND (v_rule->>'language' IS NULL OR bq.language=(v_rule->>'language'))
        AND NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.batch_id=p_batch_id AND q.bank_question_id=bq.id)
      ORDER BY bq.last_used_at ASC NULLS FIRST, random() LIMIT v_count
    ), inserted AS (
      INSERT INTO public.questions (batch_id, question_text, option_a, option_b, option_c, option_d, correct_answer, sort_order, bank_question_id)
      SELECT p_batch_id, p.question_text, p.option_a, p.option_b, p.option_c, p.option_d, p.correct_answer, v_sort + row_number() OVER (), p.id
      FROM picked p RETURNING bank_question_id
    )
    UPDATE public.bank_questions SET times_used = times_used + 1, last_used_at = now() WHERE id IN (SELECT bank_question_id FROM inserted);
    GET DIAGNOSTICS v_count = ROW_COUNT; v_added := v_added + v_count;
    SELECT coalesce(max(sort_order),0) INTO v_sort FROM public.questions WHERE batch_id = p_batch_id;
  END LOOP;
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('paper_composed','batch',p_batch_id, coalesce(current_setting('request.jwt.claims',true)::json->>'email','unknown'),
          jsonb_build_object('blueprint',p_blueprint,'questions_added',v_added));
  RETURN v_added;
END; $$;
REVOKE ALL ON FUNCTION public.compose_batch_from_bank(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compose_batch_from_bank(uuid, jsonb) TO authenticated;

-- bank performance: org + shared scope
CREATE OR REPLACE FUNCTION public.bank_item_performance()
RETURNS TABLE (bank_question_id uuid, question_text text, topic text, difficulty text,
  exams_used bigint, n_responses bigint, difficulty_index numeric, avg_time_s numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT bq.id, bq.question_text, bq.topic, bq.difficulty,
    COUNT(DISTINCT q.batch_id), COUNT(r.id),
    round(avg(CASE WHEN r.is_correct THEN 1.0 ELSE 0.0 END), 3),
    round(avg(r.time_spent_ms)/1000.0, 1)
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

-- ── Audit log: org-scoped read via entity resolution ──────────
DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
CREATE POLICY audit_log_admin_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin() AND (
    public.admin_org() IS NULL
    OR (entity = 'batch'       AND public.batch_in_my_org(entity_id))
    OR (entity = 'attempt'     AND public.attempt_in_my_org(entity_id))
    OR (entity = 'exam_series' AND public.series_in_my_org(entity_id))
  ));
