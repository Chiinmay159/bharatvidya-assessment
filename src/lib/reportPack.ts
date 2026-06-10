import * as XLSX from 'xlsx'
import { supabase } from './supabase'

/**
 * reportPack — one-click post-event export for an exam batch.
 *
 * Produces a single .xlsx workbook — the hand-off artifact for partner
 * colleges (who handle all student communication themselves):
 *   1. Results        — one row per submitted attempt
 *   2. Item Analysis  — difficulty/discrimination/distractors per question
 *   3. Anomalies      — integrity flags for human review
 *   4. Certificates   — issued certificates with verification codes
 */

interface BatchLike {
  id: string
  name: string
  scheduled_start?: string
  duration_minutes?: number
  pass_percentage?: number | null
}

export async function downloadReportPack(batch: BatchLike): Promise<void> {
  const [attempts, items, anomalies, certs] = await Promise.all([
    supabase.from('attempts')
      .select('roll_number, student_name, email, attempt_number, score, total_questions, started_at, submitted_at, extra_time_minutes')
      .eq('batch_id', batch.id).not('submitted_at', 'is', null)
      .order('roll_number'),
    supabase.rpc('item_analysis', { p_batch_id: batch.id }),
    supabase.rpc('anomaly_report', { p_batch_id: batch.id }),
    supabase.from('certificates')
      .select('certificate_code, roll_number, student_name, percentage, passed, issued_at, revoked')
      .eq('batch_id', batch.id).order('roll_number'),
  ])

  const wb = XLSX.utils.book_new()

  const resultRows = (attempts.data ?? []).map((a: Record<string, unknown>) => ({
    'Roll Number': a.roll_number,
    'Name': a.student_name,
    'Email': a.email ?? '',
    'Attempt': a.attempt_number,
    'Score': a.score,
    'Total': a.total_questions,
    'Percentage': a.total_questions ? Math.round(((a.score as number) / (a.total_questions as number)) * 100) : null,
    'Result': batch.pass_percentage != null && a.total_questions
      ? (Math.round(((a.score as number) / (a.total_questions as number)) * 100) >= batch.pass_percentage ? 'PASS' : 'FAIL')
      : '',
    'Started': a.started_at,
    'Submitted': a.submitted_at,
    'Extra Time (min)': a.extra_time_minutes ?? 0,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultRows), 'Results')

  const itemRows = (items.data ?? []).map((q: Record<string, unknown>, i: number) => ({
    '#': i + 1,
    'Question': q.question_text,
    'Responses': q.n_responses,
    'Difficulty Index': q.difficulty_index,
    'Discrimination': q.discrimination,
    'Avg Time (s)': q.avg_time_s,
    'Picked A': q.picked_a, 'Picked B': q.picked_b, 'Picked C': q.picked_c, 'Picked D': q.picked_d,
    'Correct': q.correct_answer,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), 'Item Analysis')

  const anomalyRows = (anomalies.data ?? []).map((a: Record<string, unknown>) => ({
    'Type': a.kind,
    'Roll Number': a.roll_a,
    'Name': a.name_a,
    'Detail': a.detail,
  }))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(anomalyRows.length ? anomalyRows : [{ 'Type': 'none', 'Roll Number': '', 'Name': '', 'Detail': 'No anomalies detected' }]),
    'Anomalies'
  )

  const certRows = (certs.data ?? []).map((c: Record<string, unknown>) => ({
    'Certificate Code': c.certificate_code,
    'Roll Number': c.roll_number,
    'Name': c.student_name,
    'Percentage': c.percentage,
    'Passed': c.passed ? 'Yes' : 'No',
    'Issued': c.issued_at,
    'Revoked': c.revoked ? 'Yes' : '',
    'Verify At': `${window.location.origin}/verify?c=${c.certificate_code}`,
  }))
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(certRows.length ? certRows : [{ 'Certificate Code': 'none issued' }]),
    'Certificates'
  )

  const safeName = batch.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  XLSX.writeFile(wb, `${safeName}-report-pack.xlsx`)
}
