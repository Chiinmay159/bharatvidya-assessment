import { useState, useEffect, useCallback } from 'react'
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

  // Confirm states
  const [confirmDelete, setConfirmDelete] = useState(null)  // attempt object
  const [confirmReset,  setConfirmReset]  = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError,   setActionError]   = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [ar, qr] = await Promise.all([
      supabase.from('attempts')
        .select('*')
        .eq('batch_id', batch.id)
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: false }),
      supabase.from('questions')
        .select('id, question_text, sort_order, correct_answer')
        .eq('batch_id', batch.id)
        .order('sort_order'),
    ])
    const att = ar.data || [], qs = qr.data || []
    setAttempts(att); setQuestions(qs)
    if (att.length) {
      const { data: resp } = await supabase
        .from('responses')
        .select('attempt_id, question_id, selected_answer, is_correct')
        .in('attempt_id', att.map(a => a.id))
      setResponses(resp || [])
    } else {
      setResponses([])
    }
    setLoading(false)
  }, [batch.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  /* ── Delete single attempt ─────────────────────────────── */
  async function handleDeleteAttempt() {
    if (!confirmDelete) return
    setActionLoading(true); setActionError(null)
    try {
      const { error } = await supabase
        .from('attempts')
        .delete()
        .eq('id', confirmDelete.id)
      if (error) throw error
      setConfirmDelete(null)
      await fetchAll()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  /* ── Reset all attempts for this batch ─────────────────── */
  async function handleResetBatch() {
    setActionLoading(true); setActionError(null)
    try {
      // Delete all attempts (submitted + in-progress). Responses cascade.
      const { error } = await supabase
        .from('attempts')
        .delete()
        .eq('batch_id', batch.id)
      if (error) throw error
      setConfirmReset(false)
      await fetchAll()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  /* ── Sort & export ──────────────────────────────────────── */
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
        time_taken_mins: a.submitted_at && a.started_at
          ? Math.round((new Date(a.submitted_at) - new Date(a.started_at)) / 60000) : '',
        submitted_at: a.submitted_at
          ? formatInTimeZone(new Date(a.submitted_at), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm:ss') : '',
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

  /* ── Stats ────────────────────────────────────────────────── */
  const avg = attempts.length && attempts[0]?.total_questions
    ? (attempts.reduce((s, a) => s + (a.total_questions ? (a.score / a.total_questions) * 100 : 0), 0) / attempts.length).toFixed(1)
    : null
  const highest = attempts.length
    ? Math.max(...attempts.map(a => a.total_questions ? Math.round((a.score / a.total_questions) * 100) : 0))
    : null

  return (
    <div>
      <button onClick={onBack} style={backBtn}>← Back to batches</button>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>
            {batch.name} — Results
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>{attempts.length} submissions</p>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setConfirmReset(true)}
            disabled={loading}
            style={{ ...btnDanger, opacity: loading ? .4 : 1 }}
          >
            ↺ Reset all attempts
          </button>
          <button
            onClick={handleExport}
            disabled={!attempts.length}
            style={{ ...btnSecondary, opacity: attempts.length ? 1 : .4 }}
          >
            ↓ Download CSV
          </button>
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>
          {actionError}
        </div>
      )}

      {loading && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
          Loading results…
        </div>
      )}

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

          {/* Results table */}
          <div className="card" style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {[
                    { label: 'Roll No.',   key: 'roll_number' },
                    { label: 'Name',       key: 'student_name' },
                    { label: 'Score',      key: 'score' },
                    { label: 'Total',      key: 'total_questions' },
                    { label: '%',          key: 'percentage' },
                    { label: 'Time (min)', key: null },
                    { label: 'Submitted',  key: null },
                    { label: '',           key: null },   // actions column
                  ].map(({ label, key }, i) => (
                    <th
                      key={i}
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
                        <span style={{ fontWeight: 700, fontSize: 13, color: passed ? 'var(--success)' : 'var(--error)' }}>
                          {pct}{pct !== '-' ? '%' : ''}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>{timeTaken}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--text-3)', fontSize: 12 }}>
                        {a.submitted_at ? formatInTimeZone(new Date(a.submitted_at), 'Asia/Kolkata', 'dd MMM, hh:mm a') : '-'}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <button
                          onClick={() => { setActionError(null); setConfirmDelete(a) }}
                          style={deleteLink}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Delete single attempt modal ──────────────────── */}
      {confirmDelete && (
        <Modal>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
          <h3 style={modalTitle}>Delete attempt?</h3>
          <p style={modalBody}>
            <strong>{confirmDelete.student_name}</strong> ({confirmDelete.roll_number}) will be
            able to retake the exam. Their responses and score will be permanently deleted.
          </p>
          {actionError && <p style={{ color: 'var(--error)', fontSize: 12, margin: '0 0 12px' }}>{actionError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleDeleteAttempt}
              disabled={actionLoading}
              style={{ ...btnDestructive, flex: 1, opacity: actionLoading ? .6 : 1 }}
            >
              {actionLoading ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              onClick={() => { setConfirmDelete(null); setActionError(null) }}
              disabled={actionLoading}
              style={{ ...btnSecondary, flex: 1 }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── Reset batch modal ────────────────────────────── */}
      {confirmReset && (
        <Modal>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h3 style={modalTitle}>Reset all attempts?</h3>
          <p style={modalBody}>
            This will permanently delete <strong>all {attempts.length} submission{attempts.length !== 1 ? 's' : ''}</strong> for{' '}
            <strong>{batch.name}</strong>, including in-progress attempts. Students will be
            able to retake the exam from scratch.
          </p>
          <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--error)', background: 'var(--error-lt)', padding: '8px 12px', borderRadius: 6 }}>
            This action cannot be undone.
          </p>
          {actionError && <p style={{ color: 'var(--error)', fontSize: 12, margin: '0 0 12px' }}>{actionError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleResetBatch}
              disabled={actionLoading}
              style={{ ...btnDestructive, flex: 1, opacity: actionLoading ? .6 : 1 }}
            >
              {actionLoading ? 'Resetting…' : 'Yes, reset all'}
            </button>
            <button
              onClick={() => { setConfirmReset(false); setActionError(null) }}
              disabled={actionLoading}
              style={{ ...btnSecondary, flex: 1 }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────── */
function StatCard({ label, value }) {
  return (
    <div className="card" style={{ padding: '14px 20px', minWidth: 120 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{label}</div>
    </div>
  )
}

function Modal({ children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(15,23,42,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div className="card" style={{ maxWidth: 400, width: '100%', padding: '32px 28px', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}>
        {children}
      </div>
    </div>
  )
}

/* ── Styles ─────────────────────────────────────────────────── */
const backBtn = {
  all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20,
}
const btnSecondary = {
  all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
  justifyContent: 'center',
  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-md)',
  color: 'var(--text-2)', fontSize: 13, fontWeight: 500,
}
const btnDanger = {
  all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
  padding: '8px 14px', borderRadius: 8,
  background: 'var(--error-lt)', color: 'var(--error)',
  border: '1px solid #FECACA',
  fontSize: 13, fontWeight: 500,
}
const btnDestructive = {
  all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
  justifyContent: 'center',
  padding: '9px 16px', borderRadius: 8,
  background: 'var(--error)', color: '#fff',
  fontSize: 13, fontWeight: 600,
}
const deleteLink = {
  all: 'unset', cursor: 'pointer',
  fontSize: 12, fontWeight: 600,
  color: 'var(--error)',
  padding: '3px 8px', borderRadius: 5,
  border: '1px solid #FECACA',
  background: 'var(--error-lt)',
  whiteSpace: 'nowrap',
}
const modalTitle = {
  margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: 'var(--text-1)',
}
const modalBody = {
  margin: '0 0 20px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6,
}
