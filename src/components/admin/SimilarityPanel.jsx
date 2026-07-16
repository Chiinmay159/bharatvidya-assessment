import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'
import { Spinner } from '../shared/Spinner'
import { computeSimilarityReport } from '../../lib/similarity'
import { generateCsv, downloadCsv } from '../../lib/csv'

/**
 * SimilarityPanel — on-demand pairwise answer-similarity forensics.
 * Statistical upgrade of the anomaly report's "answer twins" signature
 * check: standardized wrong-match scores (g2/omega family) with
 * chance-corrected flags. Computation runs in the browser — the RPC
 * returns one row per attempt, never a pairwise join (that blew temp
 * disk at ~1800 attempts when tried in SQL).
 */
export function SimilarityPanel({ batch }) {
  const [report, setReport] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [showAll, setShowAll] = useState(false)

  async function run() {
    setRunning(true)
    setError(null)
    try {
      const [matrix, qs] = await Promise.all([
        supabase.rpc('batch_similarity_matrix', { p_batch_id: batch.id }),
        supabase.from('questions').select('id, correct_answer').eq('batch_id', batch.id),
      ])
      if (matrix.error) throw matrix.error
      if (qs.error) throw qs.error
      // Let the spinner paint before the O(n²) loop occupies the thread
      await new Promise(r => setTimeout(r, 30))
      setReport(computeSimilarityReport(qs.data ?? [], matrix.data ?? []))
    } catch (err) {
      setError(formatDbError(err, 'Failed to run similarity analysis.'))
    }
    setRunning(false)
  }

  function exportCsv() {
    if (!report) return
    const fields = ['roll_a', 'name_a', 'roll_b', 'name_b', 'common_items', 'matches',
      'wrong_matches', 'expected_wrong_matches', 'z_wrong', 'z_all', 'p_one_sided', 'p_bonferroni', 'tier']
    const rows = report.pairs.map(p => ({
      ...p,
      expected_wrong_matches: p.expected_wrong_matches.toFixed(2),
      z_wrong: p.z_wrong == null ? '' : p.z_wrong.toFixed(2),
      z_all: p.z_all == null ? '' : p.z_all.toFixed(2),
      p_one_sided: p.p_one_sided.toExponential(2),
      p_bonferroni: p.p_bonferroni.toExponential(2),
      tier: p.tier ?? '',
    }))
    downloadCsv(generateCsv(rows, fields), `similarity-${batch.name.replace(/[^a-z0-9]+/gi, '-')}.csv`)
  }

  const flagged = report?.pairs.filter(p => p.tier) ?? []
  const visible = report ? (showAll ? report.pairs.slice(0, 200) : report.pairs.slice(0, 15)) : []

  return (
    <section style={{ marginBottom: 28 }}>
      <h3 style={sectionHead}>Pairwise similarity (collusion forensics)</h3>

      {!report && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
            Compares every pair of students on <strong>shared wrong answers</strong>, standardized
            against how popular each wrong option was in this cohort. Strong students matching on
            correct answers is expected — repeatedly choosing the <em>same wrong option</em> is the signal.
          </p>
          <button onClick={run} disabled={running} className="btn btn-primary" style={{ padding: '9px 16px', fontSize: 13 }}>
            {running ? <Spinner size={14} color="#fff" /> : 'Run similarity analysis'}
          </button>
          {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--error)' }}>{error}</p>}
        </div>
      )}

      {report && (
        <>
          <div className="card" style={{ padding: '14px 18px', marginBottom: 10, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-1)' }}>{report.n_students}</strong> students ·{' '}
            <strong style={{ color: 'var(--text-1)' }}>{report.n_pairs.toLocaleString()}</strong> pairs compared ·{' '}
            <strong style={{ color: flagged.length ? 'var(--error)' : 'var(--success)' }}>
              {flagged.length === 0 ? 'no pairs flagged' : `${flagged.length} pair${flagged.length > 1 ? 's' : ''} flagged`}
            </strong>
            {report.excluded_pairs > 0 && <> · {report.excluded_pairs.toLocaleString()} pairs skipped (fewer than {report.min_common_items} questions answered by both)</>}
            <br />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              A <strong>HIGH</strong> flag is chance-corrected across all {report.n_pairs.toLocaleString()} pairs — in an
              honest batch the chance of even one false HIGH flag is under 5%. <strong>REVIEW</strong> flags clear a
              per-pair 1-in-1000 bar only; expect ~{Math.max(1, Math.round(report.n_pairs * 0.001))} by chance in a batch this size.
            </span>
            {report.low_cohort && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--warn)', fontWeight: 600 }}>
                ⚠ Fewer than 25 students — option-popularity estimates are noisy; treat every score as indicative only.
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Pair</th>
                  <th style={th} title="Shared wrong answers vs expected by chance">Wrong matches</th>
                  <th style={th} title="Standardized wrong-match score. Higher = less explainable by chance.">z (wrong)</th>
                  <th style={th} title="All matching answers over questions both answered">Matches</th>
                  <th style={th} title="One-sided probability of this much wrong-agreement by chance">Chance odds</th>
                  <th style={th}>Flag</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: p.tier === 'high' ? 'var(--error-lt)' : p.tier === 'review' ? 'var(--warn-lt)' : undefined }}>
                    <td style={{ ...td, textAlign: 'left', whiteSpace: 'nowrap' }}>
                      <strong>{p.roll_a}</strong> {p.name_a} <span style={{ color: 'var(--text-3)' }}>×</span> <strong>{p.roll_b}</strong> {p.name_b}
                    </td>
                    <td style={td}>{p.wrong_matches} <span style={{ color: 'var(--text-3)', fontSize: 11 }}>(exp {p.expected_wrong_matches.toFixed(1)})</span></td>
                    <td style={{ ...td, fontWeight: p.tier ? 700 : 400 }}>{p.z_wrong == null ? '—' : p.z_wrong.toFixed(2)}</td>
                    <td style={td}>{p.matches}/{p.common_items}</td>
                    <td style={td}>{oddsLabel(p.p_one_sided)}</td>
                    <td style={td}>{p.tier ? <span style={{ ...pill, ...(p.tier === 'high' ? pillHigh : pillReview) }}>{p.tier.toUpperCase()}</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {report.pairs.length > 15 && (
              <button onClick={() => setShowAll(s => !s)} style={linkBtn}>
                {showAll ? 'Show top 15' : `Show top ${Math.min(200, report.pairs.length)}`}
              </button>
            )}
            <button onClick={exportCsv} style={linkBtn}>⬇ Export all pairs (CSV)</button>
            <button onClick={run} disabled={running} style={linkBtn}>↻ Recompute</button>
          </div>

          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
            A similarity flag is an investigative lead, never a verdict — statistics cannot distinguish copying
            from shared coaching or a common wrong method. Corroborate with seating/venue, submission timing,
            and the integrity flags above before any action involving a student.
          </p>
        </>
      )}
    </section>
  )
}

function oddsLabel(p) {
  if (p >= 0.01) return `1 in ${Math.round(1 / p)}`
  if (p >= 1e-9) return `1 in ${Math.round(1 / p).toLocaleString()}`
  return '< 1 in a billion'
}

const sectionHead = { margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }
const th = { padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center', whiteSpace: 'nowrap' }
const td = { padding: '10px 12px', textAlign: 'center', color: 'var(--text-1)', verticalAlign: 'top' }
const pill = { padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, border: '1px solid var(--border)' }
const pillHigh = { background: 'var(--error-lt)', color: 'var(--error)' }
const pillReview = { background: 'var(--warn-lt)', color: 'var(--warn)' }
const linkBtn = { all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent)' }
