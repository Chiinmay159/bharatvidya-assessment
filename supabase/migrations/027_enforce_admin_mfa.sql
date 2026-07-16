-- ================================================================
-- 027: Enforce MFA (TOTP) for all admin accounts
-- ================================================================
-- is_admin() and admin_role() now require an aal2 session. A password
-- or Google OAuth login alone (aal1) no longer opens any admin surface:
-- every RLS policy and admin RPC funnels through these two functions,
-- so enforcement lands everywhere at once.
--
-- Enrollment stays self-serve: the auth API permits mfa.enroll /
-- challenge / verify at aal1, so a newly provisioned admin reaches
-- aal2 on first login without needing any admin privilege.
--
-- APPLY-TIME CHECKLIST:
--   1. Dashboard → Authentication → Multi-Factor → TOTP must be
--      enabled BEFORE applying, or no admin can reach aal2.
--   2. Deploy the client (MFA gate in AdminPage) together with this
--      migration — older clients sign admins out at aal1 with no
--      path to enroll.
--   3. Every existing admin re-authenticates and enrolls an
--      authenticator app on next visit.

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

CREATE OR REPLACE FUNCTION public.admin_role()
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.admin_users
  WHERE email = (SELECT auth.jwt() ->> 'email')
    AND (SELECT auth.jwt() ->> 'aal') = 'aal2'
$$;
REVOKE ALL ON FUNCTION public.admin_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_role() TO authenticated;

-- UX-routing helper for the client's login gate only: an aal1 session
-- must decide between offering TOTP enrollment (admin without a factor)
-- and denying outright (not an admin). Returns membership for the
-- caller's own email only and grants no data access — the same fact
-- the caller could already infer from is_admin() before this migration.
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
