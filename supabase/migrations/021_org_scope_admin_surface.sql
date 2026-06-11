-- ================================================================
-- 021: Org-scope the entire admin surface (audit-2 finding H1)
-- ================================================================
-- Migration 015 scoped only batches_select_admin. Every other admin
-- table policy and admin RPC trusted bare is_admin(), so any admin in
-- any org could read/modify any other org's exam data. This closes it
-- on every batch-reachable table and every admin RPC.
--
-- Model: global admins (admin_org() IS NULL) see everything; org
-- admins see only rows whose batch (or series) belongs to their org.
-- ================================================================

-- ── Org-scope helpers ─────────────────────────────────────────
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

-- ── Table policies: replace bare is_admin() with org-aware checks ──

-- attempts (batch via attempt.batch_id)
DROP POLICY IF EXISTS attempts_select_admin ON public.attempts;
CREATE POLICY attempts_select_admin ON public.attempts
  FOR SELECT TO authenticated USING (public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS attempts_update_admin ON public.attempts;
CREATE POLICY attempts_update_admin ON public.attempts
  FOR UPDATE TO authenticated USING (public.batch_in_my_org(batch_id)) WITH CHECK (public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS attempts_delete_admin ON public.attempts;
CREATE POLICY attempts_delete_admin ON public.attempts
  FOR DELETE TO authenticated USING (public.batch_in_my_org(batch_id));

-- responses (via attempt → batch)
DROP POLICY IF EXISTS responses_select_admin ON public.responses;
CREATE POLICY responses_select_admin ON public.responses
  FOR SELECT TO authenticated USING (public.attempt_in_my_org(attempt_id));

-- questions (batch_id)
DROP POLICY IF EXISTS questions_select_admin ON public.questions;
CREATE POLICY questions_select_admin ON public.questions
  FOR SELECT TO authenticated USING (public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS questions_insert_admin ON public.questions;
CREATE POLICY questions_insert_admin ON public.questions
  FOR INSERT TO authenticated WITH CHECK (public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS questions_update_admin ON public.questions;
CREATE POLICY questions_update_admin ON public.questions
  FOR UPDATE TO authenticated USING (public.batch_in_my_org(batch_id)) WITH CHECK (public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS questions_delete_admin ON public.questions;
CREATE POLICY questions_delete_admin ON public.questions
  FOR DELETE TO authenticated USING (public.batch_in_my_org(batch_id));

-- roster (batch_id)
DROP POLICY IF EXISTS roster_admin_select ON public.roster;
CREATE POLICY roster_admin_select ON public.roster
  FOR SELECT TO authenticated USING (public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS roster_admin_insert ON public.roster;
CREATE POLICY roster_admin_insert ON public.roster
  FOR INSERT TO authenticated WITH CHECK (public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS roster_admin_update ON public.roster;
CREATE POLICY roster_admin_update ON public.roster
  FOR UPDATE TO authenticated USING (public.batch_in_my_org(batch_id)) WITH CHECK (public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS roster_admin_delete ON public.roster;
CREATE POLICY roster_admin_delete ON public.roster
  FOR DELETE TO authenticated USING (public.batch_in_my_org(batch_id));

-- certificates (batch_id)
DROP POLICY IF EXISTS certificates_admin_select ON public.certificates;
CREATE POLICY certificates_admin_select ON public.certificates
  FOR SELECT TO authenticated USING (public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS certificates_admin_update ON public.certificates;
CREATE POLICY certificates_admin_update ON public.certificates
  FOR UPDATE TO authenticated USING (public.batch_in_my_org(batch_id)) WITH CHECK (public.batch_in_my_org(batch_id));

-- integrity_events + tab_switches (attempt_id) — admin read
DROP POLICY IF EXISTS integrity_events_admin_read ON public.integrity_events;
CREATE POLICY integrity_events_admin_read ON public.integrity_events
  FOR SELECT TO authenticated USING (public.attempt_in_my_org(attempt_id));
DROP POLICY IF EXISTS tab_switches_admin_read ON public.tab_switches;
CREATE POLICY tab_switches_admin_read ON public.tab_switches
  FOR SELECT TO authenticated USING (public.attempt_in_my_org(attempt_id));

-- students: org admins see only students who attempted one of their batches
DROP POLICY IF EXISTS students_admin_select ON public.students;
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

-- ── RPC guards: analytics (SQL) gain an org predicate ─────────
CREATE OR REPLACE FUNCTION public.mission_control(p_batch_id uuid)
RETURNS TABLE (attempt_id uuid, roll_number text, student_name text, state text,
  started_at timestamptz, submitted_at timestamptz, last_seen timestamptz,
  answers_saved bigint, extra_time_minutes int, tab_switches bigint, integrity_flags bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.roll_number, a.student_name,
    CASE WHEN a.submitted_at IS NOT NULL THEN 'submitted'
         WHEN a.last_seen IS NULL OR a.last_seen < now() - interval '90 seconds' THEN 'disconnected'
         ELSE 'in_exam' END,
    a.started_at, a.submitted_at, a.last_seen,
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

-- item_analysis: wrap the existing body with an org predicate
CREATE OR REPLACE FUNCTION public.item_analysis(p_batch_id uuid)
RETURNS TABLE (question_id uuid, bank_question_id uuid, question_text text, n_responses bigint,
  difficulty_index numeric, discrimination numeric, avg_time_s numeric,
  picked_a bigint, picked_b bigint, picked_c bigint, picked_d bigint, correct_answer text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH scored_attempts AS (
    SELECT a.id, a.score, ntile(100) OVER (ORDER BY a.score) AS pctile
    FROM public.attempts a
    WHERE a.batch_id = p_batch_id AND a.submitted_at IS NOT NULL AND a.total_questions > 0
  ),
  bands AS (SELECT id, CASE WHEN pctile >= 73 THEN 'upper' WHEN pctile <= 27 THEN 'lower' ELSE 'mid' END AS band FROM scored_attempts)
  SELECT q.id, q.bank_question_id, q.question_text, COUNT(r.id),
    round(avg(CASE WHEN r.is_correct THEN 1.0 ELSE 0.0 END), 3),
    round(coalesce(avg(CASE WHEN b.band='upper' THEN (CASE WHEN r.is_correct THEN 1.0 ELSE 0.0 END) END),0)
        - coalesce(avg(CASE WHEN b.band='lower' THEN (CASE WHEN r.is_correct THEN 1.0 ELSE 0.0 END) END),0), 3),
    round(avg(r.time_spent_ms)/1000.0, 1),
    COUNT(*) FILTER (WHERE r.selected_answer='A'), COUNT(*) FILTER (WHERE r.selected_answer='B'),
    COUNT(*) FILTER (WHERE r.selected_answer='C'), COUNT(*) FILTER (WHERE r.selected_answer='D'),
    q.correct_answer
  FROM public.questions q
  LEFT JOIN public.responses r ON r.question_id = q.id
  LEFT JOIN bands b ON b.id = r.attempt_id
  WHERE q.batch_id = p_batch_id AND public.batch_in_my_org(p_batch_id)
  GROUP BY q.id, q.bank_question_id, q.question_text, q.correct_answer
  ORDER BY q.sort_order
$$;
REVOKE ALL ON FUNCTION public.item_analysis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.item_analysis(uuid) TO authenticated;

-- anomaly_report: replace final is_admin() gate with org gate
CREATE OR REPLACE FUNCTION public.anomaly_report(p_batch_id uuid)
RETURNS TABLE (kind text, roll_a text, name_a text, roll_b text, name_b text, metric numeric, detail text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH submitted AS (
    SELECT a.id, a.roll_number, a.student_name, extract(epoch FROM (a.submitted_at - a.started_at)) AS dur_s
    FROM public.attempts a WHERE a.batch_id = p_batch_id AND a.submitted_at IS NOT NULL
  ),
  med AS (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY dur_s) AS median_s FROM submitted),
  fast AS (
    SELECT 'fast_finisher'::text, s.roll_number, s.student_name, NULL::text, NULL::text,
           round(s.dur_s::numeric,0),
           'finished in '||round((s.dur_s/60.0)::numeric,1)||' min vs batch median '||round((m.median_s/60.0)::numeric,1)||' min'
    FROM submitted s, med m WHERE m.median_s > 0 AND s.dur_s < m.median_s * 0.25
  ),
  wrong_sigs AS (
    SELECT r.attempt_id, md5(string_agg(r.question_id::text||':'||r.selected_answer, ',' ORDER BY r.question_id)) AS sig, COUNT(*) AS n_wrong
    FROM public.responses r JOIN submitted s ON s.id = r.attempt_id WHERE NOT r.is_correct GROUP BY r.attempt_id HAVING COUNT(*) >= 3
  ),
  sig_groups AS (SELECT sig, n_wrong, COUNT(*) AS group_size FROM wrong_sigs GROUP BY sig, n_wrong HAVING COUNT(*) > 1),
  twins AS (
    SELECT 'answer_twins'::text, s.roll_number, s.student_name, NULL::text, NULL::text, g.group_size::numeric,
      'identical wrong-answer pattern ('||g.n_wrong||' wrong answers) shared by '||g.group_size||' students — signature '||left(g.sig,8)
    FROM sig_groups g JOIN wrong_sigs w ON w.sig = g.sig JOIN submitted s ON s.id = w.attempt_id
  ),
  signals AS (
    SELECT 'integrity_signals'::text, a.roll_number, a.student_name, NULL::text, NULL::text,
      (coalesce(t.n,0)+coalesce(e.n,0))::numeric,
      coalesce(t.n,0)||' tab switch(es), '||coalesce(e.fs,0)||' fullscreen exit(s), '||coalesce(e.cp,0)||' copy attempt(s)'
    FROM public.attempts a
    LEFT JOIN (SELECT attempt_id, COUNT(*) n FROM public.tab_switches GROUP BY attempt_id) t ON t.attempt_id = a.id
    LEFT JOIN (SELECT attempt_id, COUNT(*) n, COUNT(*) FILTER (WHERE event_type='fullscreen_exit') fs,
               COUNT(*) FILTER (WHERE event_type='copy_attempt') cp FROM public.integrity_events GROUP BY attempt_id) e ON e.attempt_id = a.id
    WHERE a.batch_id = p_batch_id AND (coalesce(t.n,0)+coalesce(e.n,0)) >= 3
  )
  SELECT * FROM fast UNION ALL SELECT * FROM twins UNION ALL SELECT * FROM signals
  WHERE public.batch_in_my_org(p_batch_id)
$$;
REVOKE ALL ON FUNCTION public.anomaly_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anomaly_report(uuid) TO authenticated;

-- series_results: org gate via series
CREATE OR REPLACE FUNCTION public.series_results(p_series_id uuid)
RETURNS TABLE (roll_number text, student_name text, module_position int, module_label text,
  weight_marks int, module_status text, raw_score int, raw_total int,
  weighted_marks numeric, aggregate_marks numeric, aggregate_passed boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH best AS (
    SELECT DISTINCT ON (a.roll_number, m.id) a.roll_number, m.id AS module_id, a.score, a.total_questions, b.pass_percentage
    FROM public.attempts a JOIN public.batches b ON b.id = a.batch_id JOIN public.series_modules m ON m.id = b.series_module_id
    WHERE m.series_id = p_series_id AND a.submitted_at IS NOT NULL
    ORDER BY a.roll_number, m.id, (CASE WHEN a.total_questions>0 THEN a.score::numeric/a.total_questions ELSE 0 END) DESC
  ),
  grid AS (
    SELECT sr.roll_number, sr.student_name, m.id AS module_id, m.position, m.label, m.weight_marks,
      bst.score, bst.total_questions, bst.pass_percentage,
      CASE WHEN bst.total_questions>0 THEN round(bst.score::numeric/bst.total_questions*m.weight_marks,1)
           WHEN bst.total_questions IS NOT NULL THEN 0 ELSE NULL END AS weighted
    FROM public.series_roster sr CROSS JOIN public.series_modules m
    LEFT JOIN best bst ON bst.roll_number = sr.roll_number AND bst.module_id = m.id
    WHERE sr.series_id = p_series_id AND m.series_id = p_series_id
  )
  SELECT g.roll_number, g.student_name, g.position, g.label, g.weight_marks,
    CASE WHEN g.total_questions IS NULL THEN 'absent'
         WHEN g.pass_percentage IS NULL THEN 'completed'
         WHEN g.total_questions>0 AND round(g.score::numeric/g.total_questions*100) >= g.pass_percentage THEN 'passed'
         ELSE 'failed' END,
    g.score, g.total_questions, g.weighted,
    sum(coalesce(g.weighted,0)) OVER (PARTITION BY g.roll_number),
    sum(coalesce(g.weighted,0)) OVER (PARTITION BY g.roll_number) >= coalesce((SELECT s.aggregate_pass_marks FROM public.exam_series s WHERE s.id = p_series_id),0)
  FROM grid g
  WHERE public.series_in_my_org(p_series_id)
  ORDER BY g.roll_number, g.position
$$;
REVOKE ALL ON FUNCTION public.series_results(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.series_results(uuid) TO authenticated;

-- ── RPC guards: action RPCs gain a one-line org check ─────────
CREATE OR REPLACE FUNCTION public.grant_time_extension(p_attempt_id uuid, p_minutes int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_roll text;
BEGIN
  IF NOT public.attempt_in_my_org(p_attempt_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) = 'viewer' THEN RAISE EXCEPTION 'Viewers cannot grant extensions'; END IF;
  IF p_minutes < 0 OR p_minutes > 240 THEN RAISE EXCEPTION 'Extension must be 0–240 minutes'; END IF;
  UPDATE public.attempts SET extra_time_minutes = p_minutes WHERE id = p_attempt_id AND submitted_at IS NULL RETURNING roll_number INTO v_roll;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found or already submitted'; END IF;
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('time_extension_granted','attempt',p_attempt_id, coalesce(current_setting('request.jwt.claims',true)::json->>'email','unknown'),
          jsonb_build_object('roll_number',v_roll,'minutes',p_minutes));
END; $$;
REVOKE ALL ON FUNCTION public.grant_time_extension(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_time_extension(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_attempt(p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_roll text; v_batch uuid; v_bname text;
BEGIN
  IF NOT public.attempt_in_my_org(p_attempt_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT a.roll_number, a.batch_id, b.name INTO v_roll, v_batch, v_bname
  FROM public.attempts a JOIN public.batches b ON b.id = a.batch_id WHERE a.id = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('attempt_deleted','attempt',p_attempt_id, coalesce(current_setting('request.jwt.claims',true)::json->>'email','unknown'),
          jsonb_build_object('roll_number',v_roll,'batch_name',v_bname));
  DELETE FROM public.tab_switches WHERE attempt_id = p_attempt_id;
  DELETE FROM public.integrity_events WHERE attempt_id = p_attempt_id;
  DELETE FROM public.responses WHERE attempt_id = p_attempt_id;
  DELETE FROM public.attempts WHERE id = p_attempt_id;
END; $$;
REVOKE ALL ON FUNCTION public.delete_attempt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_attempt(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_batch_attempts(p_batch_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_count int;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT name INTO v_name FROM public.batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.attempts WHERE batch_id = p_batch_id;
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('batch_reset','batch',p_batch_id, coalesce(current_setting('request.jwt.claims',true)::json->>'email','unknown'),
          jsonb_build_object('batch_name',v_name,'attempts_deleted',v_count));
  DELETE FROM public.tab_switches WHERE attempt_id IN (SELECT id FROM public.attempts WHERE batch_id = p_batch_id);
  DELETE FROM public.integrity_events WHERE attempt_id IN (SELECT id FROM public.attempts WHERE batch_id = p_batch_id);
  DELETE FROM public.responses WHERE attempt_id IN (SELECT id FROM public.attempts WHERE batch_id = p_batch_id);
  DELETE FROM public.attempts WHERE batch_id = p_batch_id;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.reset_batch_attempts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_batch_attempts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_batch(p_batch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT name INTO v_name FROM public.batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('batch_deleted','batch',p_batch_id, coalesce(current_setting('request.jwt.claims',true)::json->>'email','unknown'),
          jsonb_build_object('batch_name',v_name));
  DELETE FROM public.certificates WHERE batch_id = p_batch_id;
  DELETE FROM public.tab_switches WHERE attempt_id IN (SELECT id FROM public.attempts WHERE batch_id = p_batch_id);
  DELETE FROM public.integrity_events WHERE attempt_id IN (SELECT id FROM public.attempts WHERE batch_id = p_batch_id);
  DELETE FROM public.responses WHERE attempt_id IN (SELECT id FROM public.attempts WHERE batch_id = p_batch_id);
  DELETE FROM public.attempts WHERE batch_id = p_batch_id;
  DELETE FROM public.questions WHERE batch_id = p_batch_id;
  DELETE FROM public.roster WHERE batch_id = p_batch_id;
  DELETE FROM public.batches WHERE id = p_batch_id;
END; $$;
REVOKE ALL ON FUNCTION public.delete_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_batch(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_certificates(p_batch_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_batch record; v_actor text := coalesce(current_setting('request.jwt.claims',true)::json->>'email','unknown');
  v_count int := 0; v_attempt record; v_pct int; v_passed boolean; v_code text;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Only owners and examiners can issue certificates'; END IF;
  SELECT * INTO v_batch FROM public.batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  FOR v_attempt IN
    SELECT DISTINCT ON (a.roll_number) a.* FROM public.attempts a
    WHERE a.batch_id = p_batch_id AND a.submitted_at IS NOT NULL ORDER BY a.roll_number, a.attempt_number DESC
  LOOP
    v_pct := CASE WHEN v_attempt.total_questions>0 THEN round((v_attempt.score::numeric/v_attempt.total_questions)*100) ELSE 0 END;
    v_passed := v_batch.pass_percentage IS NULL OR v_pct >= v_batch.pass_percentage;
    CONTINUE WHEN v_batch.pass_percentage IS NOT NULL AND NOT v_passed;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.certificates c WHERE c.attempt_id = v_attempt.id);
    LOOP v_code := public.gen_certificate_code(); EXIT WHEN NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.certificate_code = v_code); END LOOP;
    INSERT INTO public.certificates (certificate_code, attempt_id, batch_id, student_name, roll_number, exam_name, score, total_questions, percentage, passed, issued_by)
    VALUES (v_code, v_attempt.id, p_batch_id, v_attempt.student_name, v_attempt.roll_number, v_batch.name, v_attempt.score, v_attempt.total_questions, v_pct, v_passed, v_actor);
    v_count := v_count + 1;
  END LOOP;
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('certificates_issued','batch',p_batch_id,v_actor, jsonb_build_object('batch_name',v_batch.name,'count',v_count));
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.issue_certificates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_certificates(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_questions(p_batch_id uuid, p_questions jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0; v_row jsonb; v_i int := 1;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM public.questions WHERE batch_id = p_batch_id;
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    INSERT INTO public.questions (batch_id, question_text, option_a, option_b, option_c, option_d, correct_answer, sort_order)
    VALUES (p_batch_id, v_row->>'question_text', v_row->>'option_a', v_row->>'option_b', v_row->>'option_c', v_row->>'option_d', upper(v_row->>'correct_answer'), v_i);
    v_i := v_i + 1; v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.replace_questions(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_questions(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_roster(p_batch_id uuid, p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM public.roster WHERE batch_id = p_batch_id;
  INSERT INTO public.roster (batch_id, roll_number, student_name, email)
  SELECT p_batch_id, (r->>'roll_number')::text, (r->>'student_name')::text, (r->>'email')::text
  FROM jsonb_array_elements(p_rows) AS r;
END; $$;
REVOKE ALL ON FUNCTION public.replace_roster(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_roster(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.compose_batch_from_bank(p_batch_id uuid, p_blueprint jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rule jsonb; v_count int; v_added int := 0; v_sort int; v_status text; v_available int;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Viewers cannot compose papers'; END IF;
  SELECT status INTO v_status FROM public.batches WHERE id = p_batch_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_status NOT IN ('draft','scheduled') THEN RAISE EXCEPTION 'Cannot compose into a batch with status %', v_status; END IF;
  SELECT coalesce(max(sort_order),0) INTO v_sort FROM public.questions WHERE batch_id = p_batch_id;
  FOR v_rule IN SELECT * FROM jsonb_array_elements(p_blueprint) LOOP
    v_count := (v_rule->>'count')::int;
    IF v_count IS NULL OR v_count < 1 THEN RAISE EXCEPTION 'Each blueprint rule needs a positive count'; END IF;
    SELECT COUNT(*) INTO v_available FROM public.bank_questions bq
    WHERE bq.status='approved' AND bq.topic=(v_rule->>'topic')
      AND (v_rule->>'difficulty' IS NULL OR bq.difficulty=(v_rule->>'difficulty'))
      AND (v_rule->>'language' IS NULL OR bq.language=(v_rule->>'language'))
      AND NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.batch_id=p_batch_id AND q.bank_question_id=bq.id);
    IF v_available < v_count THEN RAISE EXCEPTION 'Bank has only % approved question(s) for topic=% difficulty=% (need %)', v_available, v_rule->>'topic', coalesce(v_rule->>'difficulty','any'), v_count; END IF;
    WITH picked AS (
      SELECT bq.id, bq.question_text, bq.option_a, bq.option_b, bq.option_c, bq.option_d, bq.correct_answer
      FROM public.bank_questions bq
      WHERE bq.status='approved' AND bq.topic=(v_rule->>'topic')
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
