-- ================================================================
-- 022: Student-data RPCs verify email, not guessable name (H2)
-- ================================================================
-- get_my_attempt / get_my_responses / get_my_series_standing /
-- claim_session authenticated on roll + student_name — both
-- discoverable. A classmate could read a victim's email/score or
-- claim_session to evict them from a live exam. These now verify the
-- caller's email against the stored attempt / roster row.
-- ================================================================

-- Remove the legacy roll-only overload (probing surface)
DROP FUNCTION IF EXISTS public.get_my_attempt(uuid, text);
DROP FUNCTION IF EXISTS public.get_my_attempt(uuid, text, text);

CREATE OR REPLACE FUNCTION public.get_my_attempt(
  p_batch_id     uuid,
  p_roll_number  text,
  p_email        text
)
RETURNS TABLE (id uuid, batch_id uuid, roll_number text, student_name text, email text,
  started_at timestamptz, submitted_at timestamptz, score int, total_questions int, attempt_number int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.batch_id, a.roll_number, a.student_name, a.email,
         a.started_at, a.submitted_at, a.score, a.total_questions, a.attempt_number
  FROM public.attempts a
  WHERE a.batch_id = p_batch_id
    AND a.roll_number = p_roll_number
    AND lower(a.email) = lower(p_email)
  ORDER BY a.attempt_number DESC
$$;
REVOKE ALL ON FUNCTION public.get_my_attempt(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_attempt(uuid, text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_my_responses(uuid, text, text);
CREATE OR REPLACE FUNCTION public.get_my_responses(
  p_attempt_id uuid,
  p_roll_number text,
  p_email       text
)
RETURNS TABLE (question_id uuid, selected_answer text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.question_id, r.selected_answer
  FROM public.responses r
  JOIN public.attempts a ON a.id = r.attempt_id
  WHERE r.attempt_id   = p_attempt_id
    AND a.roll_number  = p_roll_number
    AND lower(a.email) = lower(p_email)
    AND a.submitted_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.get_my_responses(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_responses(uuid, text, text) TO anon, authenticated;

-- claim_session: verify email against the attempt row
DROP FUNCTION IF EXISTS public.claim_session(uuid, text, text);
CREATE OR REPLACE FUNCTION public.claim_session(
  p_attempt_id  uuid,
  p_roll_number text,
  p_email       text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token uuid;
BEGIN
  v_token := gen_random_uuid();
  UPDATE public.attempts
  SET session_token = v_token
  WHERE id           = p_attempt_id
    AND roll_number  = p_roll_number
    AND lower(email) = lower(p_email)
    AND submitted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot claim session — details do not match or attempt already submitted';
  END IF;
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_session(uuid, text, text) TO anon, authenticated;

-- get_my_series_standing: verify email against the series roster
DROP FUNCTION IF EXISTS public.get_my_series_standing(uuid, text, text);
CREATE OR REPLACE FUNCTION public.get_my_series_standing(
  p_series_id   uuid,
  p_roll_number text,
  p_email       text
)
RETURNS TABLE (series_name text, module_position int, module_label text, weight_marks int,
  status text, my_marks numeric, running_total numeric, visible_weight_total int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT sr.roll_number FROM public.series_roster sr
    WHERE sr.series_id = p_series_id AND sr.roll_number = p_roll_number AND lower(sr.email) = lower(p_email)
  ),
  ser AS (SELECT s.name, s.show_running_total FROM public.exam_series s WHERE s.id = p_series_id),
  best AS (
    SELECT DISTINCT ON (m.id) m.id AS module_id, a.score, a.total_questions, b.show_results
    FROM public.attempts a JOIN public.batches b ON b.id = a.batch_id
    JOIN public.series_modules m ON m.id = b.series_module_id JOIN me ON me.roll_number = a.roll_number
    WHERE m.series_id = p_series_id AND a.submitted_at IS NOT NULL
    ORDER BY m.id, (CASE WHEN a.total_questions>0 THEN a.score::numeric/a.total_questions ELSE 0 END) DESC
  ),
  module_state AS (
    SELECT m.position, m.label, m.weight_marks, bst.score, bst.total_questions, bst.show_results,
      NOT EXISTS (SELECT 1 FROM public.batches b WHERE b.series_module_id = m.id AND b.status IN ('active','completed')) AS upcoming,
      CASE WHEN bst.show_results AND bst.total_questions>0 THEN round(bst.score::numeric/bst.total_questions*m.weight_marks,1)
           WHEN bst.show_results THEN 0 ELSE NULL END AS visible_marks
    FROM public.series_modules m LEFT JOIN best bst ON bst.module_id = m.id WHERE m.series_id = p_series_id
  )
  SELECT (SELECT name FROM ser), ms.position, ms.label, ms.weight_marks,
    CASE WHEN ms.total_questions IS NOT NULL AND ms.show_results THEN 'scored'
         WHEN ms.total_questions IS NOT NULL THEN 'pending'
         WHEN ms.upcoming THEN 'upcoming' ELSE 'absent' END,
    ms.visible_marks,
    sum(coalesce(ms.visible_marks,0)) OVER (),
    sum(CASE WHEN ms.visible_marks IS NOT NULL THEN ms.weight_marks ELSE 0 END) OVER ()
  FROM module_state ms
  WHERE EXISTS (SELECT 1 FROM me) AND (SELECT show_running_total FROM ser)
  ORDER BY ms.position
$$;
REVOKE ALL ON FUNCTION public.get_my_series_standing(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_series_standing(uuid, text, text) TO anon, authenticated;
