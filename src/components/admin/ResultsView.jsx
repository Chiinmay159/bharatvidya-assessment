import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { generateCsv, downloadCsv } from '../../lib/csv'
import { formatInTimeZone } from 'date-fns-tz'

export function ResultsView({ batch, onBack }) {
  const [attempts,  setAttempts]  = useState([])
  const [questions, setQuestions] = useState([])
  const [responses, setResponses] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [sortKey,   setSortKey]   = useState('score')
  const [sortDir,   setSortDir]   = useState('desc')

  useEffect(() => { fetchAll() }, [batch.id])

  async function fetchAll() {
    setLoading(true)
    const [ar, qr] = await Promise.all([
      supabase.from('attempts').select('*').eq('batch_id', batch.id).not('submitted_at', 'is', null).order('submitted_at', { ascending: false }),
      supabase.from('questions').select('id, question_text, sort_order, correct_answer').eq('batch_id', batch.id).order('sort_order'),
    ])
    const att = ar.data || [], qs = qr.data || []
    setAttempts(att); setQuestions(qs)
    if (att.length) {
      const { data: resp } = await supabase.from('responses').select('attempt_id, question_id, selected_answer, is_correct').in('attempt_id', att.map(a => a.id))
      setResponses(resp || [])
    }
    setLoading(false)
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...attempts].sort((a, b) => {
    let va = sortKey === 'percentage' ? (a.total_questions ? a.score / a.total_questions : 0) : a[sortKey]
    let vb = sortKey === 'percentage' ? (b.total_questions ? b.score / b.total_questions : 0) : b[sortKey]
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortDir === 'asc' ? va - vb : vb - va
  })

  function handleExport() {
    const rm = {}
    responses.forEach(r => { if (!rm[r.attempt_id]) rm[r.attempt_id] = {}; rm[r.attempt_id][r.question_id] = r })
    const qf = questions.flatMap(q => [`q_${q.sort_order}_text`, `q_${q.sort_order}_answer`, `q_${q.sort_order}_correct`])
    const fields = ['roll_number', 'student_name', 'score', 'total_questions', 'percentage', 'time_taken_mins', 'submitted_at', ...qf]
    const rows = attempts.map(a => {
      const row = {
        roll_number: a.roll_number,
        student_name: a.student_name,
        score: a.score ?? '',
        total_questions: a.total_questions ?? '',
        percentage: a.total_questions ? ((a.score / a.total_questions) * 100).toFixed(1) : '',
        time_taken_mins: a.submitted_at && a.started_at ? Math.round((new Date(a.submitted_at) - new Date(a.started_at)) / 60000) : '',
        submitted_at: a.submitted_at ? formatInTimeZone(new Date(a.submitted_at), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm:ss') : '',
      }
      questions.forEach(q => {
        const r = rm[a.id]?.[q.id]
        row[`q_${q.sort_order}_text`]    = q.question_text.slice(0, 80)
        row[`q_${q.sort_order}_answer`]  = r ? r.selected_answer : ''
        row[`q_${q.sort_order}_correct`] = r ? (r.is_correct ? 'TRUE' : 'FALSE') : ''
      })
      return row
    })
    downloadCsv(generateCsv(rows, fields), `${batch.name.replace(/\s+/g, '_')}_results.csv`)
  }

  /* ── Stats ── */
  const avg = attempts.length && attempts[0]?.total_questions
    ? (attempts.reduce((s, a) => s + (a.total_questions ? (a.score / a.total_questions) * 100 : 0), 0) / attempts.length).toFixed(1)
    : null
  const highest = attempts.length ? Math.max(...attempts.map(a => a.total_questions ? Math.round((a.score / a.total_questions) * 100) : 0)) : null

  return (
    <div>
      <button onClick={onBack} style={backBtn}>← Back to batches</button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>{batch.name} — Results</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>{attempts.length} submissions</p>
        </div>
        <button onClick={handleExport} disabled={!attempts.length} style={{ ...btnSecondary, opacity: attempts.length ? 1 : .4 }}>
          ↓ Download CSV
        </button>
      </div>

      {loading && <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>Loading results…</div>}

      {!loading && attempts.length === 0 && (
        <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>No submissions yet.</p>
        </div>
      )}

      {!loading && attempts.length > 0 && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <StatCard label="Submissions" value={attempts.length} />
            {avg !== null && <StatCard label="Class average" value={`${avg}%`} />}
            {highest !== null && <StatCard label="Highest score" value={`${highest}%`} />}
          </div>

          {/* Table */}
          <div className="card" style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {[
                    { label: 'Roll No.',    key: 'roll_number' },
                    { label: 'Name',        key: 'student_name' },
                    { label: 'Score',       key: 'score' },
                    { label: 'Total',       key: 'total_questions' },
                    { label: '%',           key: 'percentage' },
                    { label: 'Time (min)',  key: null },
                    { label: 'Submitted',   key: null },
                  ].map(({ label, key }) => (
                    <th
                      key={label}
                      onClick={key ? () => toggleSort(key) : undefined}
                      style={{
                        padding: '10px 14px', textAlign: 'left',
                        fontWeight: 600, color: 'var(--text-2)', fontSize: 12,
                        whiteSpace: 'nowrap',
                        cursor: key ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                    >
                      {label}
                      {sortKey === key && <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((a, i) => {
                  const pct = a.total_questions ? ((a.score / a.total_questions) * 100).toFixed(1) : '-'
                  const timeTaken = a.submitted_at && a.started_at
                    ? Math.round((new Date(a.submitted_at) - new Date(a.started_at)) / 60000) : '-'
                  const passed = parseFloat(pct) >= 60
                  return (
                    <tr key={a.id} style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>{a.roll_number}</td>
                      <td style={{ padding: '11px 14px', fontWeight: 500, color: 'var(--text-1)' }}>{a.student_name}</td>
                      <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--text-1)' }}>{a.score ?? '-'}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-3)' }}>{a.total_questions ?? '-'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{
                          fontWeight: 700, fontSize: 13,
                          color: passed ? 'var(--success)' : 'var(--error)',
                        }}>{pct}{pct !== '-' ? '%' : ''}</span>
                      </td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>{timeTaken}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-3)', fontSize: 12 }}>
                        {a.submitted_at ? formatInTimeZone(new Date(a.submitted_at), 'Asia/Kolkata', 'dd MMM, hh:mm a') : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="card" style={{ padding: '14px 20px', minWidth: 120 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{label}</div>
    </div>
  )
}

const backBtn = { all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }
const btnSecondary = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-md)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500 }
