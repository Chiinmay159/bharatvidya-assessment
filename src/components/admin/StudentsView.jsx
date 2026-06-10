import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'
import { Spinner } from '../shared/Spinner'

/**
 * StudentsView — persistent student identities with cross-exam history.
 * Identity is keyed by email and linked automatically at attempt creation.
 */
export function StudentsView() {
  const [students, setStudents] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)   // student id
  const [history, setHistory] = useState({})        // student id → attempts[]

  const load = useCallback(async () => {
    let q = supabase.from('students').select('*').order('full_name').limit(500)
    if (search.trim()) q = q.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`)
    const { data, error: err } = await q
    if (err) { setError(formatDbError(err, 'Failed to load students.')); return }
    setStudents(data ?? [])
  }, [search])

  useEffect(() => {
    // Deferred a tick (also debounces rapid search keystrokes slightly)
    const t = setTimeout(load, 150)
    return () => clearTimeout(t)
  }, [load])

  async function toggle(student) {
    if (expanded === student.id) { setExpanded(null); return }
    setExpanded(student.id)
    if (!history[student.id]) {
      const { data } = await supabase.from('attempts')
        .select('id, batch_id, roll_number, attempt_number, score, total_questions, submitted_at, batches(name)')
        .eq('student_id', student.id)
        .order('started_at', { ascending: false })
      setHistory(h => ({ ...h, [student.id]: data ?? [] }))
    }
  }

  if (!students && !error) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={26} color="var(--accent)" /></div>
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>Students</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-3)' }}>
        {students?.length ?? 0} identities · linked automatically by email across all exams
      </p>

      <input
        type="search" placeholder="Search by name or email…" value={search}
        onChange={e => setSearch(e.target.value)} aria-label="Search students"
        style={{ width: '100%', maxWidth: 380, boxSizing: 'border-box', padding: '10px 14px', fontSize: 13, border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit', marginBottom: 16 }}
      />

      {error && <div role="alert" style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14, background: 'var(--error-lt)', color: 'var(--error)', border: '1px solid var(--border)' }}>{error}</div>}

      {students?.length === 0 ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
          {search ? 'No students match this search.' : 'No student identities yet — they are created automatically when students take exams with an email.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {students?.map(s => (
            <div key={s.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                onClick={() => toggle(s)}
                aria-expanded={expanded === s.id}
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', boxSizing: 'border-box', padding: '13px 18px' }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{s.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{s.email}</div>
                </div>
                <span aria-hidden="true" style={{ color: 'var(--text-3)', fontSize: 12 }}>{expanded === s.id ? '▲' : '▼'}</span>
              </button>

              {expanded === s.id && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px', background: 'var(--surface-2)' }}>
                  {!history[s.id] ? (
                    <Spinner size={16} />
                  ) : history[s.id].length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>No linked attempts.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--text-3)' }}>
                          <th style={hth}>Exam</th><th style={hth}>Roll</th><th style={hth}>Attempt</th><th style={hth}>Score</th><th style={hth}>Submitted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history[s.id].map(a => (
                          <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={htd}>{a.batches?.name ?? '—'}</td>
                            <td style={{ ...htd, fontFamily: 'var(--font-mono)' }}>{a.roll_number}</td>
                            <td style={htd}>#{a.attempt_number}</td>
                            <td style={htd}>{a.submitted_at && a.total_questions ? `${a.score}/${a.total_questions} (${Math.round((a.score / a.total_questions) * 100)}%)` : 'in progress'}</td>
                            <td style={htd}>{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('en-IN') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const hth = { padding: '4px 8px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }
const htd = { padding: '6px 8px', color: 'var(--text-1)' }
