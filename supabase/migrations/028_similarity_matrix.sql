-- ================================================================
-- 028: Pairwise similarity forensics — answer matrix RPC
-- ================================================================
-- Returns one compact row per submitted attempt (answers as jsonb
-- keyed by question_id) so the client computes pairwise statistics.
-- The O(n^2) pair comparison deliberately does NOT happen in SQL:
-- a pairwise similarity join blew temp disk at ~1800 attempts (see
-- anomaly_report's history) — this RPC stays O(n) and the admin
-- browser does the n^2 loop on ~n*50 small integers.
--
-- Security: same admin gating pattern as item_analysis /
-- mission_control — WHERE-gated, anon/non-admin/foreign-org get [].
-- Exposes selected answers + roll/name, which batch-org admins can
-- already read row-by-row through RLS; this only changes the shape.

CREATE OR REPLACE FUNCTION public.batch_similarity_matrix(p_batch_id uuid)
RETURNS TABLE (
  attempt_id     uuid,
  roll_number    text,
  student_name   text,
  attempt_number int,
  answers        jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.roll_number, a.student_name, a.attempt_number,
         jsonb_object_agg(r.question_id, r.selected_answer)
  FROM public.attempts a
  JOIN public.responses r ON r.attempt_id = a.id
  WHERE a.batch_id = p_batch_id
    AND a.submitted_at IS NOT NULL
    AND public.is_admin()
    AND public.batch_in_my_org(p_batch_id)
  GROUP BY a.id, a.roll_number, a.student_name, a.attempt_number
$$;
REVOKE ALL ON FUNCTION public.batch_similarity_matrix(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_similarity_matrix(uuid) TO authenticated;
