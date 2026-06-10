import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'
import { Spinner } from '../shared/Spinner'
import { downloadReportPack } from '../../lib/reportPack'

/**
 * BatchAnalytics — post-exam item analysis + anomaly report for a batch.
 *
 * Reading the numbers:
 *  difficulty_index = fraction who answered correctly (1.0 = everyone).
 *    Healthy spread: 0.3–0.9. Near 0.25 on a 4-option MCQ ≈ guessing.
 *  discrimination = top-27% correct-rate minus bottom-27%.
 *    > 0.3 strong · 0.1–0.3 acceptable · < 0.1 review the question
 *    (negative = strong students get it WRONG more often — usually a
 *     miskeyed answer).
 */
export function BatchAnalytics({ batch, onBack }) {
  const [items, setItems] = useState(null)
  const [anomalies, setAnomalies] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [ia, ar] = await Promise.all([
          supabase.rpc('item_analysis', { p_batch_id: batch.id }),
          supabase.rpc('anomaly_report', { p_batch_id: batch.id }),
        ])
        if (cancelled) return
        if (ia.error) throw ia.error
        if (ar.error) throw ar.error
        setItems(ia.data ?? [])
        setAnomalies(ar.data ?? [])
      } catch (err) {
        if (!cancelled) setError(formatDbError(err, 'Failed to load analytics.'))
      }
    }
    load()
    return () => { cancelled = true }
  }, [batch.id])

  if (error) {
    return (
      <div>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <div role="alert" className="card" style={{ padding: 20, color: 'var(--error)', fontSize: 14 }}>{error}</div>
      </div>
    )
  }
  if (!items || !anomalies) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={26} color="var(--accent)" /></div>
  }

  const flagged = items.filter(i => i.n_responses > 0 && (i.discrimination < 0.1 || i.difficulty_index < 0.15 || i.difficulty_index > 0.95))

  return (
    <div>
      <button onClick={onBack} style={backBtn}>← Back to results</button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>{batch.name} — Item Analysis</h2>
          <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--text-3)' }}>
            {items.length} questions · {flagged.length} flagged for review · {anomalies.length} integrity flag{anomalies.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => downloadReportPack(batch)}
          className="btn btn-secondary" style={{ padding: '9px 16px', fontSize: 13, flexShrink: 0 }}
          title="Excel workbook: Results, Item Analysis, Anomalies, Certificates — the hand-off artifact for the institution"
        >
          ⬇ Download report pack (.xlsx)
        </button>
      </div>

      {/* ── Anomalies ── */}
      <section style={{ marginBottom: 28 }}>
        <h3 style={sectionHead}>Integrity & anomaly flags</h3>
        {anomalies.length === 0 ? (
          <div className="card" style={{ padding: '18px 20px', fontSize: 13, color: 'var(--success)' }}>
            ✓ No anomalies detected — no improbably fast finishers, no shared wrong-answer patterns, no elevated integrity signals.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {anomalies.map((a, i) => (
              <div key={i} className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ ...kindPill, ...KIND_STYLE[a.kind] }}>{KIND_LABEL[a.kind] ?? a.kind}</span>
                <strong style={{ fontSize: 13, color: 'var(--text-1)' }}>{a.roll_a} · {a.name_a}</strong>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.detail}</span>
              </div>
            ))}
          </div>
        )}
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Flags are signals for human review, not verdicts. Investigate before acting on any of them.
        </p>
      </section>

      {/* ── Item table ── */}
      <section>
        <h3 style={sectionHead}>Question performance</h3>
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={th}>#</th>
                <th style={{ ...th, textAlign: 'left', minWidth: 220 }}>Question</th>
                <th style={th} title="Fraction answering correctly. 0.3–0.9 healthy.">Difficulty</th>
                <th style={th} title="Top-27% minus bottom-27% correct rate. >0.3 strong, <0.1 review, negative = likely miskeyed.">Discrim.</th>
                <th style={th}>Avg time</th>
                <th style={th} title="How often each option was chosen. Correct option marked ✓.">A / B / C / D</th>
                <th style={th}>n</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q, idx) => {
                const flag = q.n_responses > 0 && (q.discrimination < 0.1 || q.difficulty_index < 0.15 || q.difficulty_index > 0.95)
                const negDisc = q.discrimination < 0
                return (
                  <tr key={q.question_id} style={{ borderBottom: '1px solid var(--border)', background: flag ? 'var(--warn-lt)' : undefined }}>
                    <td style={td}>{idx + 1}</td>
                    <td style={{ ...td, textAlign: 'left' }}>
                      {q.question_text.length > 90 ? q.question_text.slice(0, 89) + '…' : q.question_text}
                      {negDisc && <span style={{ display: 'block', fontSize: 11, color: 'var(--error)', fontWeight: 600 }}>⚠ negative discrimination — check the answer key</span>}
                    </td>
                    <td style={td}>{fmt(q.difficulty_index)}</td>
                    <td style={{ ...td, color: negDisc ? 'var(--error)' : q.discrimination >= 0.3 ? 'var(--success)' : 'var(--text-1)' }}>{fmt(q.discrimination)}</td>
                    <td style={td}>{q.avg_time_s != null ? `${q.avg_time_s}s` : '—'}</td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {['a', 'b', 'c', 'd'].map((l, i) => (
                        <span key={l} style={{ marginRight: i < 3 ? 8 : 0, fontWeight: q.correct_answer === l.toUpperCase() ? 700 : 400, color: q.correct_answer === l.toUpperCase() ? 'var(--success)' : 'var(--text-2)' }}>
                          {q[`picked_${l}`]}{q.correct_answer === l.toUpperCase() ? '✓' : ''}
                        </span>
                      ))}
                    </td>
                    <td style={td}>{q.n_responses}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Highlighted rows need review: too easy (&gt;0.95), too hard (&lt;0.15), or weak discrimination (&lt;0.1).
          Questions composed from the bank feed these statistics back into cross-exam bank performance automatically.
        </p>
      </section>
    </div>
  )
}

const kindPill = {
  padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 11,
  fontWeight: 700, border: '1px solid var(--border)', flexShrink: 0,
}
const KIND_LABEL = { fast_finisher: 'Fast finisher', answer_twins: 'Answer twins', integrity_signals: 'Integrity signals' }
const KIND_STYLE = {
  fast_finisher:     { background: 'var(--warn-lt)',  color: 'var(--warn)' },
  answer_twins:      { background: 'var(--error-lt)', color: 'var(--error)' },
  integrity_signals: { background: 'var(--accent-lt)', color: 'var(--accent-deep)' },
}

function fmt(v) { return v == null ? '—' : Number(v).toFixed(2) }

const backBtn = {
  all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16,
}
const sectionHead = { margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }
const th = { padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center', whiteSpace: 'nowrap' }
const td = { padding: '10px 12px', textAlign: 'center', color: 'var(--text-1)', verticalAlign: 'top' }
