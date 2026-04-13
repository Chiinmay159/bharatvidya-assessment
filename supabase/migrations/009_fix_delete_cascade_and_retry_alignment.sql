-- ================================================================
-- Migration 009: Fix FK cascade for attempt delete/reset, align
-- email/admin features with retry + hidden-results rules
-- ================================================================
-- Fixes:
--   1. delete_attempt RPC — cascades tab_switches + responses
--   2. reset_batch_attempts RPC — cascades all child rows for a batch
--   Both are admin-only, audit-logged, SECURITY DEFINER.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. delete_attempt (admin cascade for single attempt)
-- ────────────────────────────────────────────────────────────────
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

  -- Audit before cascade
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES (
    'attempt_deleted', 'attempt', p_attempt_id,
    coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'unknown'),
    jsonb_build_object('roll_number', v_roll, 'batch_name', v_bname)
  );

  -- Cascade in dependency order
  DELETE FROM public.tab_switches WHERE attempt_id = p_attempt_id;
  DELETE FROM public.responses    WHERE attempt_id = p_attempt_id;
  DELETE FROM public.attempts     WHERE id = p_attempt_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_attempt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_attempt(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 2. reset_batch_attempts (admin cascade for all attempts in batch)
-- ────────────────────────────────────────────────────────────────
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

  -- Audit before cascade
  INSERT INTO public.audit_log (action, entity, entity_id, actor, details)
  VALUES (
    'batch_reset', 'batch', p_batch_id,
    coalesce(current_setting('request.jwt.claims', true)::json->>'email', 'unknown'),
    jsonb_build_object('batch_name', v_name, 'attempts_deleted', v_count)
  );

  -- Cascade in dependency order
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
