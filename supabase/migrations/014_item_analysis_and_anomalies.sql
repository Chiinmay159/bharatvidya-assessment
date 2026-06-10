-- ================================================================
-- 014: Item analysis + anomaly detection (admin-only RPCs)
-- ================================================================
-- Consumes Bundle-1 telemetry (time_spent_ms, integrity_events,
-- tab_switches) and Bundle-2 lineage (questions.bank_question_id).
--
-- All functions are admin-gated SECURITY DEFINER RPCs rather than
-- views, so RLS on the underlying tables stays strict.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Item analysis for one batch.
--    difficulty_index  = proportion correct (higher = easier)
--    discrimination    = upper27% correct-rate minus lower27%
--                        (classical U-L index; > 0.3 good, < 0.1 review)
--    distractor counts = how often each option was chosen
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.item_analysis(p_batch_id uuid)
RETURNS TABLE (
  question_id       uuid,
  bank_question_id  uuid,
  question_text     text,
  n_responses       bigint,
  difficulty_index  numeric,
  discrimination    numeric,
  avg_time_s        numeric,
  picked_a          bigint,
  picked_b          bigint,
  picked_c          bigint,
  picked_d          bigint,
  correct_answer    text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH scored_attempts AS (
    SELECT a.id, a.score,
           ntile(100) OVER (ORDER BY a.score) AS pctile
    FROM public.attempts a
    WHERE a.batch_id = p_batch_id AND a.submitted_at IS NOT NULL AND a.total_questions > 0
  ),
  bands AS (
    SELECT id,
           CASE WHEN pctile >= 73 THEN 'upper'
                WHEN pctile <= 27 THEN 'lower'
                ELSE 'mid' END AS band
    FROM scored_attempts
  )
  SELECT
    q.id,
    q.bank_question_id,
    q.question_text,
    COUNT(r.id) AS n_responses,
    round(avg(CASE WHEN r.is_correct THEN 1.0 ELSE 0.0 END), 3) AS difficulty_index,
    round(
      coalesce(avg(CASE WHEN b.band = 'upper' THEN (CASE WHEN r.is_correct THEN 1.0 ELSE 0.0 END) END), 0)
      - coalesce(avg(CASE WHEN b.band = 'lower' THEN (CASE WHEN r.is_correct THEN 1.0 ELSE 0.0 END) END), 0)
    , 3) AS discrimination,
    round(avg(r.time_spent_ms) / 1000.0, 1) AS avg_time_s,
    COUNT(*) FILTER (WHERE r.selected_answer = 'A') AS picked_a,
    COUNT(*) FILTER (WHERE r.selected_answer = 'B') AS picked_b,
    COUNT(*) FILTER (WHERE r.selected_answer = 'C') AS picked_c,
    COUNT(*) FILTER (WHERE r.selected_answer = 'D') AS picked_d,
    q.correct_answer
  FROM public.questions q
  LEFT JOIN public.responses r ON r.question_id = q.id
  LEFT JOIN bands b ON b.id = r.attempt_id
  WHERE q.batch_id = p_batch_id
    AND public.is_admin()  -- returns empty set for non-admins
  GROUP BY q.id, q.bank_question_id, q.question_text, q.correct_answer
  ORDER BY q.sort_order
$$;
REVOKE ALL ON FUNCTION public.item_analysis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.item_analysis(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- 2. Anomaly report for one batch. Three signal families:
--    fast_finisher      — total exam time < 25% of the batch median
--    answer_twins       — attempts sharing an IDENTICAL wrong-answer
--                         pattern (>= 3 wrong answers). Signature-based
--                         (md5 of the wrong-answer set) so it runs O(n);
--                         a pairwise similarity join was tested and blew
--                         temp disk at ~1800 attempts — never do that.
--    integrity_signals  — tab switches + fullscreen exits + copy attempts
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anomaly_report(p_batch_id uuid)
RETURNS TABLE (
  kind        text,
  roll_a      text,
  name_a      text,
  roll_b      text,   -- only for answer_twins
  name_b      text,
  metric      numeric,
  detail      text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH submitted AS (
    SELECT a.id, a.roll_number, a.student_name,
           extract(epoch FROM (a.submitted_at - a.started_at)) AS dur_s
    FROM public.attempts a
    WHERE a.batch_id = p_batch_id AND a.submitted_at IS NOT NULL
  ),
  med AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY dur_s) AS median_s FROM submitted
  ),
  fast AS (
    SELECT 'fast_finisher'::text AS kind,
           s.roll_number, s.student_name,
           NULL::text AS roll_b, NULL::text AS name_b,
           round(s.dur_s::numeric, 0) AS metric,
           'finished in ' || round((s.dur_s / 60.0)::numeric, 1) || ' min vs batch median ' || round((m.median_s / 60.0)::numeric, 1) || ' min' AS detail
    FROM submitted s, med m
    WHERE m.median_s > 0 AND s.dur_s < m.median_s * 0.25
  ),
  wrong_sigs AS (
    SELECT r.attempt_id,
           md5(string_agg(r.question_id::text || ':' || r.selected_answer, ',' ORDER BY r.question_id)) AS sig,
           COUNT(*) AS n_wrong
    FROM public.responses r
    JOIN submitted s ON s.id = r.attempt_id
    WHERE NOT r.is_correct
    GROUP BY r.attempt_id
    HAVING COUNT(*) >= 3
  ),
  sig_groups AS (
    SELECT sig, n_wrong, COUNT(*) AS group_size
    FROM wrong_sigs
    GROUP BY sig, n_wrong
    HAVING COUNT(*) > 1
  ),
  twins AS (
    SELECT 'answer_twins'::text,
           s.roll_number, s.student_name,
           NULL::text, NULL::text,
           g.group_size::numeric,
           'identical wrong-answer pattern (' || g.n_wrong || ' wrong answers) shared by '
             || g.group_size || ' students — signature ' || left(g.sig, 8)
    FROM sig_groups g
    JOIN wrong_sigs w ON w.sig = g.sig
    JOIN submitted s ON s.id = w.attempt_id
  ),
  signals AS (
    SELECT 'integrity_signals'::text,
           a.roll_number, a.student_name,
           NULL::text, NULL::text,
           (coalesce(t.n, 0) + coalesce(e.n, 0))::numeric,
           coalesce(t.n, 0) || ' tab switch(es), '
             || coalesce(e.fs, 0) || ' fullscreen exit(s), '
             || coalesce(e.cp, 0) || ' copy attempt(s)'
    FROM public.attempts a
    LEFT JOIN (
      SELECT attempt_id, COUNT(*) AS n FROM public.tab_switches GROUP BY attempt_id
    ) t ON t.attempt_id = a.id
    LEFT JOIN (
      SELECT attempt_id, COUNT(*) AS n,
             COUNT(*) FILTER (WHERE event_type = 'fullscreen_exit') AS fs,
             COUNT(*) FILTER (WHERE event_type = 'copy_attempt')    AS cp
      FROM public.integrity_events GROUP BY attempt_id
    ) e ON e.attempt_id = a.id
    WHERE a.batch_id = p_batch_id
      AND (coalesce(t.n, 0) + coalesce(e.n, 0)) >= 3
  )
  SELECT * FROM fast
  UNION ALL SELECT * FROM twins
  UNION ALL SELECT * FROM signals
  WHERE public.is_admin()
$$;
REVOKE ALL ON FUNCTION public.anomaly_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anomaly_report(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- 3. Cross-exam bank item performance (the compounding asset):
--    every exam an approved question appears in sharpens its stats.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bank_item_performance()
RETURNS TABLE (
  bank_question_id uuid,
  question_text    text,
  topic            text,
  difficulty       text,
  exams_used       bigint,
  n_responses      bigint,
  difficulty_index numeric,
  avg_time_s       numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    bq.id,
    bq.question_text,
    bq.topic,
    bq.difficulty,
    COUNT(DISTINCT q.batch_id) AS exams_used,
    COUNT(r.id) AS n_responses,
    round(avg(CASE WHEN r.is_correct THEN 1.0 ELSE 0.0 END), 3) AS difficulty_index,
    round(avg(r.time_spent_ms) / 1000.0, 1) AS avg_time_s
  FROM public.bank_questions bq
  JOIN public.questions q ON q.bank_question_id = bq.id
  LEFT JOIN public.responses r ON r.question_id = q.id
  WHERE public.is_admin()
  GROUP BY bq.id, bq.question_text, bq.topic, bq.difficulty
  HAVING COUNT(r.id) > 0
  ORDER BY COUNT(r.id) DESC
$$;
REVOKE ALL ON FUNCTION public.bank_item_performance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bank_item_performance() TO authenticated;
