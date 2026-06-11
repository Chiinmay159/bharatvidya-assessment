-- ================================================================
-- 026: Failure-based rate limiting (anti-enumeration / anti-brute-force)
-- ================================================================
-- Throttles ONLY failed attempts per client IP — so a 2,000-student
-- campus sharing one egress IP (entering the correct code + identity)
-- is never affected, while a brute-forcer (all misses) is cut off.
-- Applied to the two anon discovery/identity surfaces:
--   find_batch_by_code  — code enumeration
--   verify_roster_identity — roll+email guessing
-- ================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket  text PRIMARY KEY,
  n       int NOT NULL DEFAULT 0,
  updated timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;  -- no anon policy: only SECURITY DEFINER fns touch it

-- Best-effort client IP from the proxy headers (Vercel/Supabase set XFF)
CREATE OR REPLACE FUNCTION public.client_ip()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(split_part(coalesce(
    current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1), '')
$$;

-- Record a failure for (action, ip) in a fixed window; raise once over the cap.
CREATE OR REPLACE FUNCTION public.bump_rate(p_action text, p_max int, p_window_secs int DEFAULT 900)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ip text; v_bucket text; v_n int;
BEGIN
  v_ip := public.client_ip();
  IF v_ip IS NULL THEN RETURN; END IF;  -- no resolvable IP → don't throttle (never block legit traffic)
  v_bucket := p_action || ':' || v_ip || ':' || floor(extract(epoch FROM now()) / p_window_secs)::text;
  INSERT INTO public.rate_limits(bucket, n, updated) VALUES (v_bucket, 1, now())
    ON CONFLICT (bucket) DO UPDATE SET n = rate_limits.n + 1, updated = now()
    RETURNING n INTO v_n;
  IF v_n > p_max THEN
    RAISE EXCEPTION 'Too many attempts. Please wait a few minutes and try again.';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.bump_rate(text, int, int) FROM PUBLIC;

-- find_batch_by_code: count MISSES (legit code entry = a hit = no count)
CREATE OR REPLACE FUNCTION public.find_batch_by_code(p_code text)
RETURNS TABLE (
  id uuid, name text, scheduled_start timestamptz, duration_minutes int,
  status text, questions_per_student int, has_access_code boolean,
  show_results boolean, pass_percentage int, max_attempts int,
  organization_id uuid, series_module_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT b.id, b.name, b.scheduled_start, b.duration_minutes,
           b.status, b.questions_per_student, b.has_access_code,
           b.show_results, b.pass_percentage, b.max_attempts,
           b.organization_id, b.series_module_id
    FROM public.batches b
    WHERE upper(b.access_code) = upper(trim(p_code))
      AND b.status IN ('scheduled','active')
    LIMIT 1;
  IF NOT FOUND THEN
    PERFORM public.bump_rate('find_miss', 25);  -- ~25 wrong codes / 15 min / IP
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.find_batch_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_batch_by_code(text) TO anon, authenticated;

-- verify_roster_identity: count failed identity probes (real roster, no match)
CREATE OR REPLACE FUNCTION public.verify_roster_identity(
  p_batch_id uuid, p_roll_number text, p_email text
)
RETURNS TABLE (has_roster boolean, matched boolean, student_name text, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_has boolean; v_name text; v_email text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.roster WHERE batch_id = p_batch_id) INTO v_has;
  SELECT ro.student_name, ro.email INTO v_name, v_email
  FROM public.roster ro JOIN public.batches b ON b.id = ro.batch_id
  WHERE ro.batch_id = p_batch_id
    AND ro.roll_number = trim(p_roll_number)
    AND lower(ro.email) = lower(trim(p_email))
    AND b.status IN ('scheduled','active')
  LIMIT 1;

  IF v_has AND v_name IS NULL THEN
    PERFORM public.bump_rate('identity_miss', 25);  -- failed roll+email guesses
  END IF;

  RETURN QUERY SELECT v_has, (v_name IS NOT NULL), v_name, v_email;
END; $$;
REVOKE ALL ON FUNCTION public.verify_roster_identity(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_roster_identity(uuid, text, text) TO anon, authenticated;
