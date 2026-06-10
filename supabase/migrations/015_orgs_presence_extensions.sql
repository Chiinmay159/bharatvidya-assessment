-- ================================================================
-- 015: Bundle 3 foundation — organizations, invigilator role,
--      live presence, per-attempt time extensions
-- ================================================================
-- Design notes:
-- * Multi-org v1: batches belong to an organization; org-scoped
--   admins (organization_id set) see only their org's batches.
--   Global admins (organization_id NULL) see everything. Child
--   tables (questions/attempts/responses) are reached through
--   batch context in the UI; their RLS will be org-tightened when
--   the first external partner onboards — noted as known scope.
-- * Presence: exam_heartbeat() replaces the client's separate
--   check_session + batch-status poll: one RPC validates the
--   session, stamps last_seen, and returns batch status + any
--   time extension. Old check_session remains for compatibility.
-- * Time extension: per-attempt minutes granted by an admin from
--   mission control; the client timer adds it to the batch end.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Organizations
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

INSERT INTO public.organizations (name) VALUES ('BharatVidya')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- Default existing batches to the home org
UPDATE public.batches
SET organization_id = (SELECT id FROM public.organizations WHERE name = 'BharatVidya')
WHERE organization_id IS NULL;

-- Invigilator role (monitor-only: mission control, no content access)
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('owner','examiner','invigilator','viewer'));

-- Org visibility helper: global admins (org NULL) see all; org admins
-- see their own org's rows.
CREATE OR REPLACE FUNCTION public.admin_org()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.admin_users
  WHERE email = (SELECT auth.jwt() ->> 'email')
$$;
REVOKE ALL ON FUNCTION public.admin_org() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_org() TO authenticated;

CREATE POLICY organizations_admin_select ON public.organizations
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY organizations_owner_write ON public.organizations
  FOR ALL TO authenticated
  USING (admin_role() = 'owner' AND admin_org() IS NULL)
  WITH CHECK (admin_role() = 'owner' AND admin_org() IS NULL);

-- Org-scope the admin view of batches: replace the blanket admin
-- SELECT policy with an org-aware one.
DROP POLICY IF EXISTS batches_select_admin ON public.batches;
CREATE POLICY batches_select_admin ON public.batches
  FOR SELECT TO authenticated
  USING (is_admin() AND (admin_org() IS NULL OR organization_id = admin_org()));

-- ----------------------------------------------------------------
-- 2. Presence + time extension
-- ----------------------------------------------------------------
ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS last_seen timestamptz,
  ADD COLUMN IF NOT EXISTS extra_time_minutes int NOT NULL DEFAULT 0
    CHECK (extra_time_minutes >= 0 AND extra_time_minutes <= 240);

CREATE INDEX IF NOT EXISTS idx_attempts_batch_lastseen ON public.attempts(batch_id, last_seen);

-- One heartbeat to rule them all: validates session, stamps presence,
-- returns batch status + extension. Replaces the client's separate
-- check_session call AND useTimer's 30s batch-status poll.
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

-- Admin grants extra time (mission control). Audit-logged.
CREATE OR REPLACE FUNCTION public.grant_time_extension(
  p_attempt_id uuid,
  p_minutes    int
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_roll text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
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

-- Mission control snapshot: one RPC, one round trip, ~2000 rows max.
-- 'disconnected' = in-exam but no heartbeat for 90s (3 missed beats).
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
  WHERE a.batch_id = p_batch_id
    AND public.is_admin()
  ORDER BY a.roll_number
$$;
REVOKE ALL ON FUNCTION public.mission_control(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mission_control(uuid) TO authenticated;
