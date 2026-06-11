-- ================================================================
-- 024: Program analytics — org-scoped longitudinal aggregates
-- ================================================================
-- One row per completed/active batch the caller is allowed to see,
-- with submission counts, average score, and pass rate. Powers the
-- Insights dashboard's trend and distribution charts. Org-scoped:
-- global admins see all, org admins see only their org.
-- ================================================================

CREATE OR REPLACE FUNCTION public.program_analytics()
RETURNS TABLE (
  batch_id        uuid,
  batch_name      text,
  scheduled_start timestamptz,
  status          text,
  pass_percentage int,
  submissions     bigint,
  avg_percentage  numeric,
  pass_rate       numeric        -- NULL when no pass mark set
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    b.id,
    b.name,
    b.scheduled_start,
    b.status,
    b.pass_percentage,
    COUNT(a.id) FILTER (WHERE a.submitted_at IS NOT NULL) AS submissions,
    round(avg(CASE WHEN a.submitted_at IS NOT NULL AND a.total_questions > 0
                   THEN a.score::numeric / a.total_questions * 100 END), 1) AS avg_percentage,
    CASE WHEN b.pass_percentage IS NULL THEN NULL
         ELSE round(
           100.0 * COUNT(a.id) FILTER (
             WHERE a.submitted_at IS NOT NULL AND a.total_questions > 0
               AND round(a.score::numeric / a.total_questions * 100) >= b.pass_percentage
           ) / NULLIF(COUNT(a.id) FILTER (WHERE a.submitted_at IS NOT NULL), 0), 0)
    END AS pass_rate
  FROM public.batches b
  LEFT JOIN public.attempts a ON a.batch_id = b.id
  WHERE b.status IN ('active','completed')
    AND public.batch_in_my_org(b.id)
  GROUP BY b.id, b.name, b.scheduled_start, b.status, b.pass_percentage
  ORDER BY b.scheduled_start
$$;
REVOKE ALL ON FUNCTION public.program_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.program_analytics() TO authenticated;
