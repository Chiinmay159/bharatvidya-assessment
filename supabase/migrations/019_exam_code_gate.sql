-- ================================================================
-- 019: Exam access redesign — code gate + roll+email verification
-- ================================================================
-- Problem solved: roll numbers are not globally unique and were the
-- only credential. Now:
-- 1. Exams are UNLISTED by default; students reach them by entering
--    a batch exam code (auto-generated, 6 chars, unambiguous).
--    Optional `listed` flag keeps open/practice events browsable.
-- 2. On rostered batches, identity = roll number + email, both
--    matching the roster row. No name disclosure on mismatch
--    (closes the name-harvesting oracle in old verify_roster_entry).
-- ================================================================

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS listed boolean NOT NULL DEFAULT false;
GRANT SELECT (listed) ON public.batches TO anon;

-- ----------------------------------------------------------------
-- Auto-generate an exam code on batch creation when none is given.
-- Unique across all batches (retry loop), unambiguous alphabet.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gen_exam_code()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  chars  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i      int;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, 1 + floor(random() * 32)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.batches_autocode()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_code text;
BEGIN
  IF NEW.access_code IS NULL OR NEW.access_code = '' THEN
    LOOP
      v_code := public.gen_exam_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.batches b WHERE upper(b.access_code) = v_code);
    END LOOP;
    NEW.access_code := v_code;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS batches_autocode ON public.batches;
CREATE TRIGGER batches_autocode
  BEFORE INSERT ON public.batches
  FOR EACH ROW EXECUTE FUNCTION batches_autocode();

-- Backfill codes for existing draft/scheduled batches without one
-- (active/completed are locked by protect_active_batch — left as is)
UPDATE public.batches b
SET access_code = sub.code
FROM (
  SELECT id, public.gen_exam_code() AS code
  FROM public.batches
  WHERE (access_code IS NULL OR access_code = '')
    AND status IN ('draft','scheduled')
) sub
WHERE b.id = sub.id;

-- ----------------------------------------------------------------
-- Code gate: find a joinable exam by its code. Anon-safe — returns
-- only the public column set, only for scheduled/active batches.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_batch_by_code(p_code text)
RETURNS TABLE (
  id uuid, name text, scheduled_start timestamptz, duration_minutes int,
  status text, questions_per_student int, has_access_code boolean,
  show_results boolean, pass_percentage int, max_attempts int,
  organization_id uuid, series_module_id uuid
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.name, b.scheduled_start, b.duration_minutes,
         b.status, b.questions_per_student, b.has_access_code,
         b.show_results, b.pass_percentage, b.max_attempts,
         b.organization_id, b.series_module_id
  FROM public.batches b
  WHERE upper(b.access_code) = upper(trim(p_code))
    AND b.status IN ('scheduled','active')
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.find_batch_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_batch_by_code(text) TO anon, authenticated;

-- ----------------------------------------------------------------
-- Roster identity check: roll + email must BOTH match. Returns the
-- roster name only on a full match; on mismatch reveals nothing —
-- not even whether the roll exists.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_roster_identity(
  p_batch_id    uuid,
  p_roll_number text,
  p_email       text
)
RETURNS TABLE (has_roster boolean, matched boolean, student_name text, email text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (
    SELECT EXISTS(SELECT 1 FROM public.roster WHERE batch_id = p_batch_id) AS has_roster
  ),
  m AS (
    SELECT ro.student_name, ro.email
    FROM public.roster ro
    JOIN public.batches b ON b.id = ro.batch_id
    WHERE ro.batch_id = p_batch_id
      AND ro.roll_number = trim(p_roll_number)
      AND lower(ro.email) = lower(trim(p_email))
      AND b.status IN ('scheduled','active')
    LIMIT 1
  )
  SELECT r.has_roster,
         EXISTS(SELECT 1 FROM m),
         (SELECT m.student_name FROM m),
         (SELECT m.email FROM m)
  FROM r
$$;
REVOKE ALL ON FUNCTION public.verify_roster_identity(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_roster_identity(uuid, text, text) TO anon, authenticated;

-- Close the name-harvesting oracle: old RPC returned a student's name
-- from roll number alone.
DROP FUNCTION IF EXISTS public.verify_roster_entry(uuid, text);
