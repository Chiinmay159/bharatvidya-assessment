-- ================================================================
-- 025: Enforce the role tier on all write/destructive operations
-- ================================================================
-- viewer = read-only; invigilator = monitor + grant time extensions;
-- examiner/owner = manage exam content & data. Previously these
-- destructive paths checked only is_admin()+org, so viewer/invigilator
-- could create/edit/delete exam data. Now they require owner/examiner.
-- Also adds certificate revocation (capability existed in data model
-- and public verification but had no action to trigger it).
-- ================================================================

-- ── Table policies: batches / questions / roster writes need owner|examiner ──
DROP POLICY IF EXISTS batches_insert_admin ON public.batches;
CREATE POLICY batches_insert_admin ON public.batches
  FOR INSERT TO authenticated
  WITH CHECK (admin_role() IN ('owner','examiner') AND (admin_org() IS NULL OR organization_id = admin_org()));
DROP POLICY IF EXISTS batches_update_admin ON public.batches;
CREATE POLICY batches_update_admin ON public.batches
  FOR UPDATE TO authenticated
  USING (admin_role() IN ('owner','examiner') AND (admin_org() IS NULL OR organization_id = admin_org()))
  WITH CHECK (admin_role() IN ('owner','examiner') AND (admin_org() IS NULL OR organization_id = admin_org()));
DROP POLICY IF EXISTS batches_delete_admin ON public.batches;
CREATE POLICY batches_delete_admin ON public.batches
  FOR DELETE TO authenticated
  USING (admin_role() IN ('owner','examiner') AND (admin_org() IS NULL OR organization_id = admin_org()));

DROP POLICY IF EXISTS questions_insert_admin ON public.questions;
CREATE POLICY questions_insert_admin ON public.questions
  FOR INSERT TO authenticated WITH CHECK (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS questions_update_admin ON public.questions;
CREATE POLICY questions_update_admin ON public.questions
  FOR UPDATE TO authenticated USING (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id))
  WITH CHECK (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS questions_delete_admin ON public.questions;
CREATE POLICY questions_delete_admin ON public.questions
  FOR DELETE TO authenticated USING (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));

DROP POLICY IF EXISTS roster_admin_insert ON public.roster;
CREATE POLICY roster_admin_insert ON public.roster
  FOR INSERT TO authenticated WITH CHECK (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS roster_admin_update ON public.roster;
CREATE POLICY roster_admin_update ON public.roster
  FOR UPDATE TO authenticated USING (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id))
  WITH CHECK (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS roster_admin_delete ON public.roster;
CREATE POLICY roster_admin_delete ON public.roster
  FOR DELETE TO authenticated USING (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));

-- attempts direct writes (deletes go via RPC; this covers PostgREST)
DROP POLICY IF EXISTS attempts_update_admin ON public.attempts;
CREATE POLICY attempts_update_admin ON public.attempts
  FOR UPDATE TO authenticated USING (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id))
  WITH CHECK (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));
DROP POLICY IF EXISTS attempts_delete_admin ON public.attempts;
CREATE POLICY attempts_delete_admin ON public.attempts
  FOR DELETE TO authenticated USING (admin_role() IN ('owner','examiner') AND public.batch_in_my_org(batch_id));

-- ── Destructive RPCs gain the role check (org check already present) ──
CREATE OR REPLACE FUNCTION public.delete_batch(p_batch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Your role cannot delete exams'; END IF;
  SELECT name INTO v_name FROM public.batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('batch_deleted','batch',p_batch_id, coalesce(current_setting('request.jwt.claims',true)::json->>'email','unknown'), jsonb_build_object('batch_name',v_name));
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

CREATE OR REPLACE FUNCTION public.delete_attempt(p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_roll text; v_batch uuid; v_bname text;
BEGIN
  IF NOT public.attempt_in_my_org(p_attempt_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Your role cannot delete attempts'; END IF;
  SELECT a.roll_number, a.batch_id, b.name INTO v_roll, v_batch, v_bname
  FROM public.attempts a JOIN public.batches b ON b.id = a.batch_id WHERE a.id = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('attempt_deleted','attempt',p_attempt_id, coalesce(current_setting('request.jwt.claims',true)::json->>'email','unknown'), jsonb_build_object('roll_number',v_roll,'batch_name',v_bname));
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
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Your role cannot reset attempts'; END IF;
  SELECT name INTO v_name FROM public.batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.attempts WHERE batch_id = p_batch_id;
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES ('batch_reset','batch',p_batch_id, coalesce(current_setting('request.jwt.claims',true)::json->>'email','unknown'), jsonb_build_object('batch_name',v_name,'attempts_deleted',v_count));
  DELETE FROM public.tab_switches WHERE attempt_id IN (SELECT id FROM public.attempts WHERE batch_id = p_batch_id);
  DELETE FROM public.integrity_events WHERE attempt_id IN (SELECT id FROM public.attempts WHERE batch_id = p_batch_id);
  DELETE FROM public.responses WHERE attempt_id IN (SELECT id FROM public.attempts WHERE batch_id = p_batch_id);
  DELETE FROM public.attempts WHERE batch_id = p_batch_id;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.reset_batch_attempts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_batch_attempts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_questions(p_batch_id uuid, p_questions jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0; v_row jsonb; v_i int := 1;
BEGIN
  IF NOT public.batch_in_my_org(p_batch_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Your role cannot edit questions'; END IF;
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
  IF (SELECT admin_role()) NOT IN ('owner','examiner') THEN RAISE EXCEPTION 'Your role cannot edit the roster'; END IF;
  DELETE FROM public.roster WHERE batch_id = p_batch_id;
  INSERT INTO public.roster (batch_id, roll_number, student_name, email)
  SELECT p_batch_id, (r->>'roll_number')::text, (r->>'student_name')::text, (r->>'email')::text
  FROM jsonb_array_elements(p_rows) AS r;
END; $$;
REVOKE ALL ON FUNCTION public.replace_roster(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_roster(uuid, jsonb) TO authenticated;

-- sync_series_roster already checks owner/examiner; leave as is.

-- ── Certificate revocation (closes the half-orphan) ──
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

-- Restore (un-revoke), same gate
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
