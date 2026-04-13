-- ================================================================
-- Migration 006: Security findings round 2
-- ================================================================
-- P1: Hide access_code from anon via column-level privilege
-- P2: Session-token enforcement (claim_session / check_session RPCs)
-- ================================================================

-- ---------------------------------------------------------------
-- P1: Add a computed boolean so the client can show "Access code
--     required" without ever seeing the real code value.
-- ---------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'batches' AND column_name = 'has_access_code'
  ) THEN
    ALTER TABLE public.batches ADD COLUMN has_access_code boolean
      GENERATED ALWAYS AS (access_code IS NOT NULL AND access_code != '') STORED;
  END IF;
END $$;

-- ---------------------------------------------------------------
-- P1: Revoke broad table-level grants from anon and re-grant
--     column-level SELECT on every column EXCEPT access_code.
--     RLS policies still apply on the granted columns.
-- ---------------------------------------------------------------
REVOKE ALL ON public.batches FROM anon;

GRANT SELECT (
  id, name, scheduled_start, duration_minutes, status,
  created_by, questions_per_student, created_at, has_access_code
) ON public.batches TO anon;


-- ---------------------------------------------------------------
-- P2: claim_session — atomically rotates the session token.
--     Called once per window on exam init.  Invalidates any prior
--     token so the previous window's heartbeat detects the conflict.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_session(
  p_attempt_id   uuid,
  p_roll_number  text,
  p_student_name text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token uuid;
BEGIN
  v_token := gen_random_uuid();
  UPDATE public.attempts
  SET session_token = v_token
  WHERE id           = p_attempt_id
    AND roll_number  = p_roll_number
    AND student_name = p_student_name
    AND submitted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot claim session — attempt not found or already submitted';
  END IF;

  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_session(uuid, text, text) TO anon, authenticated;


-- ---------------------------------------------------------------
-- P2: check_session — returns true if the token still matches.
--     Returns false when another window claimed a newer token.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_session(
  p_attempt_id    uuid,
  p_session_token uuid
)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.attempts
    WHERE id            = p_attempt_id
      AND session_token = p_session_token
      AND submitted_at  IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.check_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_session(uuid, uuid) TO anon, authenticated;
