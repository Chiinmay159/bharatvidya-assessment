-- ================================================================
-- 017: Tenant branding — organisations get a public face
-- ================================================================
-- * display_name / logo_url on organizations for in-app tenant
--   branding (students see the institution whose exam they take).
-- * Anon may read ONLY the branding fields of organisations that
--   have at least one publicly-visible batch (column-level grant +
--   row policy). Nothing else about orgs is exposed.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS logo_url     text;

UPDATE public.organizations SET display_name = 'BharatVidya', logo_url = '/logo.png'
WHERE name = 'BharatVidya' AND display_name IS NULL;

-- Column-level grant: anon can read id + branding fields only
REVOKE ALL ON public.organizations FROM anon;
GRANT SELECT (id, name, display_name, logo_url) ON public.organizations TO anon;

-- Students must know which institution a batch belongs to
GRANT SELECT (organization_id) ON public.batches TO anon;

DROP POLICY IF EXISTS organizations_anon_branding ON public.organizations;
CREATE POLICY organizations_anon_branding ON public.organizations
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.batches b
    WHERE b.organization_id = organizations.id
      AND b.status IN ('scheduled','active','completed')
  ));
