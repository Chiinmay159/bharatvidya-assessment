import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'

const STATUS_STYLE = {
  draft:     { bg: 'var(--surface-2)',  color: 'var(--text-3)',   border: 'var(--border)' },
  scheduled: { bg: '#EFF6FF',           color: '#2563EB',         border: '#BFDBFE' },
  active:    { bg: 'var(--success-lt)', color: 'var(--success)',  border: '#A7F3D0' },
  completed: { bg: '#F5F3FF',           color: '#7C3AED',         border: '#DDD6FE' },
}

const TRANSITIONS = {
  draft:     [{ label: 'Mark Scheduled', next: 'scheduled', variant: 'default' }],
  scheduled: [{ label: 'Start Now',       next: 'active',    variant: 'success' },
              { label: 'Revert to Draft', next: 'draft',     variant: 'danger'  }],
  active:    [{ label: 'End Exam',        next: 'completed', variant: 'danger'  }],
  completed: [],
}

export function BatchList({ onSelectBatch, onCreateBatch, onViewResults, onManageQuestions }) {
  const [batches, setBatches]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [questionCounts, setQCounts]      = useState({})
  const [submissionCounts, setSCounts]    = useState({})
  const [confirmAction, setConfirmAction] = useState(null)
  const [transitioning, setTransitioning] = useState(null)

  useEffect(() => { fetchBatches() }, [])

  async function fetchBatches() {
    setLoading(true)
    const { data } = await supabase.from('batches').select('*').order('created_at', { ascending: false })
    if (data) { setBatches(data); fetchCounts(data.map(b => b.id)) }
    setLoading(false)
  }

  async function fetchCounts(ids) {
    if (!ids.length) return
    const [qr, ar] = await Promise.all([
      supabase.from('questions').select('batch_id').in('batch_id', ids),
      supabase.from('attempts').select('batch_id').in('batch_id', ids).not('submitted_at', 'is', null),
    ])
    const qc = {}, ac = {}
    ids.forEach(id => { qc[id] = 0; ac[id] = 0 })
    qr.data?.forEach(q => { qc[q.batch_id] = (qc[q.batch_id] || 0) + 1 })
    ar.data?.forEach(a => { ac[a.batch_id] = (ac[a.batch_id] || 0) + 1 })
    setQCounts(qc); setSCounts(ac)
  }

  async function doTransition(batchId, next) {
    if (next === 'scheduled') {
      const b = batches.find(x => x.id === batchId)
      const qc = questionCounts[batchId] || 0
      if (qc === 0) { alert('Upload questions before scheduling.'); setConfirmAction(null); return }
      if (b?.questions_per_student && b.questions_per_student > qc) {
        alert(`Question bank has ${qc} questions but batch requires ${b.questions_per_student} per student. Upload more or reduce the per-student count.`)
        setConfirmAction(null); return
      }
    }
    setTransitioning(batchId)
    await supabase.from('batches').update({ status: next }).eq('id', batchId)
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: next } : b))
    setConfirmAction(null); setTransitioning(null)
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.3px' }}>Batches</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-3)' }}>{batches.length} total</p>
        </div>
        <button onClick={onCreateBatch} style={btnPrimary}>+ New Batch</button>
      </div>

      {loading && <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>Loading…</div>}

      {!loading && batches.length === 0 && (
        <div className="card" style={{ padding: '60px 32px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text-1)' }}>No batches yet</p>
          <p style={{ margin: '0 0 20px', color: 'var(--text-2)', fontSize: 14 }}>Create your first exam batch to get started.</p>
          <button onClick={onCreateBatch} style={btnPrimary}>Create first batch</button>
        </div>
      )}

      {!loading && batches.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {['Name', 'Scheduled (IST)', 'Duration', 'Status', 'Questions', 'Submissions', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap', fontSize: 12, letterSpacing: '.02em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((batch, i) => {
                const ss = STATUS_STYLE[batch.status] || STATUS_STYLE.draft
                const transitions = TRANSITIONS[batch.status] || []
                return (
                  <tr key={batch.id} style={{ borderBottom: i < batches.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-1)' }}>{batch.name}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      {formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'dd MMM yy, hh:mm a')}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-2)' }}>{batch.duration_minutes} min</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 9px', borderRadius: 99,
                        fontSize: 11, fontWeight: 600,
                        background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
                        textTransform: 'capitalize',
                      }}>{batch.status}</span>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-2)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{questionCounts[batch.id] ?? 0}</span>
                      {batch.questions_per_student && (
                        <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>/ {batch.questions_per_student} each</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-2)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{submissionCounts[batch.id] ?? 0}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <ActionLink onClick={() => onSelectBatch(batch)}>Edit</ActionLink>
                        <ActionLink onClick={() => onManageQuestions(batch)}>Questions</ActionLink>
                        {(batch.status === 'active' || batch.status === 'completed') && (
                          <ActionLink onClick={() => onViewResults(batch)}>Results</ActionLink>
                        )}
                        {transitions.map(t => (
                          <button
                            key={t.next}
                            onClick={() => setConfirmAction({ batchId: batch.id, ...t })}
                            disabled={transitioning === batch.id}
                            style={transitionBtn(t.variant)}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm modal */}
      {confirmAction && (
        <div style={overlayStyle}>
          <div className="card" style={{ maxWidth: 380, width: '100%', padding: '28px 24px', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700 }}>Confirm: {confirmAction.label}</h3>
            {confirmAction.next === 'active' && (
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--warn)', background: 'var(--warn-lt)', padding: '8px 12px', borderRadius: 6 }}>
                This will immediately allow students to begin the exam.
              </p>
            )}
            {confirmAction.next === 'completed' && (
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--error)', background: 'var(--error-lt)', padding: '8px 12px', borderRadius: 6 }}>
                This will end the exam for all students immediately.
              </p>
            )}
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-2)' }}>Are you sure you want to continue?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => doTransition(confirmAction.batchId, confirmAction.next)} style={btnPrimary}>Confirm</button>
              <button onClick={() => setConfirmAction(null)} style={btnSecondary}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionLink({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: 2 }}
    >
      {children}
    </button>
  )
}

function transitionBtn(variant) {
  const colors = {
    default: { bg: 'var(--surface)', color: 'var(--text-2)', border: 'var(--border-md)' },
    success: { bg: 'var(--success-lt)', color: 'var(--success)', border: '#A7F3D0' },
    danger:  { bg: 'var(--error-lt)', color: 'var(--error)', border: '#FECACA' },
  }
  const c = colors[variant] || colors.default
  return {
    all: 'unset', cursor: 'pointer',
    fontSize: 11, fontWeight: 600,
    padding: '3px 9px', borderRadius: 6,
    background: c.bg, color: c.color,
    border: `1px solid ${c.border}`,
    whiteSpace: 'nowrap',
  }
}

const btnPrimary = {
  all: 'unset', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center',
  padding: '8px 16px', borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)', color: '#fff',
  fontSize: 13, fontWeight: 600,
}
const btnSecondary = {
  all: 'unset', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center',
  padding: '8px 16px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-md)', color: 'var(--text-2)',
  fontSize: 13, fontWeight: 500,
}
const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 50,
  background: 'rgba(15,23,42,.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
}
