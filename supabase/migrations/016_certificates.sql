-- ================================================================
-- 016: Certificates with public verification
-- ================================================================
-- * issue_certificates(batch_id): admin generates certificates for
--   submitted attempts (passing-only when the batch has a
--   pass_percentage, everyone otherwise). Idempotent per attempt.
-- * verify_certificate(code): anon-safe public lookup returning
--   only certificate-face fields — powers the /verify page that
--   the QR on every certificate points to.
-- * Codes: BV-XXXX-XXXX-XXXX from a no-ambiguity alphabet
--   (no 0/O/1/I), ~10^17 space — unguessable in practice, and
--   the verify RPC does exact-match lookups only.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.certificates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_code text NOT NULL UNIQUE,
  attempt_id       uuid NOT NULL UNIQUE REFERENCES public.attempts(id),
  batch_id         uuid NOT NULL REFERENCES public.batches(id),
  -- Snapshot fields: certificate must stay valid even if batch/attempt
  -- data is later reset or deleted is attempted (FK prevents deletion;
  -- snapshots make the certificate face immutable regardless).
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

CREATE POLICY certificates_admin_select ON public.certificates
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY certificates_admin_update ON public.certificates
  FOR UPDATE TO authenticated
  USING (admin_role() IN ('owner','examiner'))
  WITH CHECK (admin_role() IN ('owner','examiner'));

CREATE INDEX IF NOT EXISTS idx_certificates_batch ON public.certificates(batch_id);

-- Code generator: BV-XXXX-XXXX-XXXX, unambiguous alphabet
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

-- Issue certificates for a completed/active batch (idempotent).
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
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
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

-- Public verification: exact-match only, certificate-face fields only.
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
