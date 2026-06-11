/**
 * examReport — build a printable, self-contained HTML report for one exam
 * and open it for printing / Save-as-PDF. Distinct from the .xlsx report
 * pack: this is the formatted, human-readable document an institution can
 * file or hand out. No server-side PDF rendering needed — the browser's
 * print dialog produces the PDF.
 */

interface BatchLike {
  id: string
  name: string
  scheduled_start?: string
  duration_minutes?: number
  pass_percentage?: number | null
}
interface ItemRow {
  question_text: string
  n_responses: number
  difficulty_index: number | string | null
  discrimination: number | string | null
  avg_time_s: number | string | null
  correct_answer: string
}
interface AnomalyRow {
  kind: string
  roll_a: string
  name_a: string
  detail: string
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export function openExamReport(
  batch: BatchLike,
  items: ItemRow[],
  anomalies: AnomalyRow[],
  summary: { submissions: number; avgPct: number | null; passRate: number | null },
): void {
  const date = batch.scheduled_start
    ? new Date(batch.scheduled_start).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })
    : '—'

  const itemRows = items.map((q, i) => {
    const di = q.difficulty_index == null ? null : Number(q.difficulty_index)
    const disc = q.discrimination == null ? null : Number(q.discrimination)
    const flag = di != null && (disc! < 0.1 || di < 0.15 || di > 0.95)
    return `<tr${flag ? ' class="flag"' : ''}>
      <td>${i + 1}</td>
      <td class="l">${esc(q.question_text.length > 110 ? q.question_text.slice(0, 109) + '…' : q.question_text)}</td>
      <td>${di == null ? '—' : di.toFixed(2)}</td>
      <td>${disc == null ? '—' : disc.toFixed(2)}</td>
      <td>${q.avg_time_s == null ? '—' : esc(q.avg_time_s) + 's'}</td>
      <td>${q.n_responses}</td>
      <td>${esc(q.correct_answer)}</td>
    </tr>`
  }).join('')

  const anomalyRows = anomalies.length
    ? anomalies.map(a => `<tr>
        <td>${esc(a.kind.replace(/_/g, ' '))}</td>
        <td class="l">${esc(a.roll_a)} · ${esc(a.name_a)}</td>
        <td class="l">${esc(a.detail)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="l muted">No anomalies detected.</td></tr>`

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(batch.name)} — Exam Report</title>
<style>
  :root{--ink:#1C1B18;--ink3:#6B685F;--blue:#1B2D4F;--gold:#A8871E;--rule:#E3DCCB;--bg:#FAF8F2}
  *{box-sizing:border-box} body{margin:0;color:var(--ink);font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:20mm}
  .rule{height:3px;background:linear-gradient(90deg,var(--gold),#C9A227 40%,#E8D48A);margin-bottom:14px;border-radius:2px}
  .sub{color:var(--ink3);font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin:0}
  h1{font-family:Georgia,serif;font-size:24px;margin:2px 0 2px;letter-spacing:-.3px}
  h2{font-family:Georgia,serif;font-size:16px;margin:22px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--rule)}
  .meta{color:var(--ink3);font-size:12px;margin:0 0 4px}
  .cards{display:flex;gap:12px;margin:14px 0}
  .c{flex:1;border:1px solid var(--rule);border-top:3px solid var(--blue);border-radius:6px;padding:12px 14px}
  .c .n{font-size:24px;font-weight:800;font-family:Georgia,serif}
  .c .k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);margin-top:2px}
  table{width:100%;border-collapse:collapse;margin:6px 0;font-size:12px}
  th,td{padding:6px 8px;border-bottom:1px solid var(--rule);text-align:center}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink3)}
  td.l,th.l{text-align:left} .muted{color:var(--ink3)} tr.flag{background:#FFF8EB}
  .foot{margin-top:24px;font-size:10px;color:var(--ink3);border-top:1px solid var(--rule);padding-top:8px}
  @media print{body{padding:0} @page{size:A4;margin:16mm} h2{break-after:avoid} tr{break-inside:avoid}}
</style></head><body>
  <div class="rule"></div>
  <p class="sub">Examination Report · Matra Assessment Platform</p>
  <h1>${esc(batch.name)}</h1>
  <p class="meta">${esc(date)} · ${esc(batch.duration_minutes ?? '—')} min${batch.pass_percentage != null ? ` · pass mark ${batch.pass_percentage}%` : ''}</p>

  <div class="cards">
    <div class="c"><div class="n">${summary.submissions}</div><div class="k">Submissions</div></div>
    <div class="c"><div class="n">${summary.avgPct == null ? '—' : summary.avgPct + '%'}</div><div class="k">Average score</div></div>
    <div class="c"><div class="n">${summary.passRate == null ? '—' : summary.passRate + '%'}</div><div class="k">Pass rate</div></div>
    <div class="c"><div class="n">${items.length}</div><div class="k">Questions</div></div>
  </div>

  <h2>Item analysis</h2>
  <table>
    <thead><tr><th>#</th><th class="l">Question</th><th>Difficulty</th><th>Discrim.</th><th>Avg time</th><th>n</th><th>Key</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <p class="muted" style="font-size:10px">Difficulty = fraction correct (0.3–0.9 healthy). Discrimination = top-27% minus bottom-27% (&gt;0.3 strong, &lt;0.1 review). Shaded rows warrant review.</p>

  <h2>Integrity &amp; anomaly flags</h2>
  <table>
    <thead><tr><th>Type</th><th class="l">Student</th><th class="l">Detail</th></tr></thead>
    <tbody>${anomalyRows}</tbody>
  </table>
  <p class="muted" style="font-size:10px">Flags are signals for human review, not verdicts.</p>

  <div class="foot">Generated ${new Date().toLocaleString('en-IN')} · Matra Assessment Platform · exams.matramedia.co.in</div>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
}
