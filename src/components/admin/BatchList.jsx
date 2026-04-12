import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { logAuditEvent } from '../../lib/auditLog'
import { formatInTimeZone } from 'date-fns-tz'

const STATUS_STYLE = {
  draft:     { bg: 'var(--surface-2)',  color: 'var(--text-3)',  border: 'var(--border)' },
  scheduled: { bg: '#EFF6FF',           color: '#2563EB',        border: '#BFDBFE' },
  active:    { bg: 'var(--success-lt)', color: 'var(--success)', border: '#A7F3D0' },
  completed: { bg: '#F5F3FF',           color: '#7C3AED',        border: '#DDD6FE' },
}

const TRANSITIONS = {
  draft:     [{ label: 'Mark Scheduled', next: 'scheduled', variant: 'default' }],
  scheduled: [{ label: 'Start Now',      next: 'active',    variant: 'success' },
              { label: 'Revert Draft',   next: 'draft',     variant: 'danger'  }],
  active:    [{ label: 'End Exam',       next: 'completed', variant: 'danger'  }],
  completed: [],
}

export function BatchList({ onSelectBatch, onCreateBatch, onViewResults, onManageQuestions, onManageRoster }) {
  const [batches,          setBatches]       = useState([])
  const [loading,          setLoading]       = useState(true)
  const [questionCounts,   setQCounts]       = useState({})
  const [submissionCounts, setSCounts]       = useState({})
  const [startedCounts,    setStartedCounts] = useState({})
  const [rosterCounts,     setRosterCounts]  = useState({})
  const [confirmAction,    setConfirmAction] = useState(null)
  const [cloneTarget,      setCloneTarget]   = useState(null)
  const [cloning,          setCloning]       = useState(false)
  const [transitioning,    setTransitioning] = useState(null)
  const liveRefreshRef = useRef(null)

  const fetchCounts = useCallback(async (ids) => {
    if (!ids.length) return
    const [qr, subr, allAttempts, rosterR] = await Promise.all([
      supabase.from('questions').select('batch_id').in('batch_id', ids),
      supabase.from('attempts').select('batch_id').in('batch_id', ids).not('submitted_at', 'is', null),
      supabase.from('attempts').select('batch_id').in('batch_id', ids),
      supabase.from('roster').select('batch_id').in('batch_id', ids),
    ])
    const qc = {}, ac = {}, sc = {}, rc = {}
    ids.forEach(id => { qc[id] = 0; ac[id] = 0; sc[id] = 0; rc[id] = 0 })
    qr.data?.forEach(q  => { qc[q.batch_id] = (qc[q.batch_id] || 0) + 1 })
    subr.data?.forEach(a => { ac[a.batch_id] = (ac[a.batch_id] || 0) + 1 })
    allAttempts.data?.forEach(a => { sc[a.batch_id] = (sc[a.batch_id] || 0) + 1 })
    rosterR.data?.forEach(r => { rc[r.batch_id] = (rc[r.batch_id] || 0) + 1 })
    setQCounts(qc); setSCounts(ac); setStartedCounts(sc); setRosterCounts(rc)
  }, [])

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('batches').select('*').order('created_at', { ascending: false })
    if (data) { setBatches(data); fetchCounts(data.map(b => b.id)) }
    setLoading(false)
  }, [fetchCounts])

  useEffect(() => { fetchBatches() }, [fetchBatches])

  useEffect(() => {
    const hasActive = batches.some(b => b.status === 'active')
    if (hasActive) {
      liveRefreshRef.current = setInterval(() => fetchCounts(batches.map(b => b.id)), 10_000)
    }
    return () => { if (liveRefreshRef.current) clearInterval(liveRefreshRef.current) }
  }, [batches, fetchCounts])

  async function doTransition(batchId, next) {
    if (next === 'scheduled') {
      const b = batches.find(x => x.id === batchId)
      const qc = questionCounts[batchId] || 0
      if (qc === 0) { alert('Upload questions before scheduling.'); setConfirmAction(null); return }
      if (b?.questions_per_student && b.questions_per_student > qc) {
        alert(`Question bank has ${qc} but batch requires ${b.questions_per_student} per student.`)
        setConfirmAction(null); return
      }
    }
    setTransitioning(batchId)
    await supabase.from('batches').update({ status: next }).eq('id', batchId)
    await logAuditEvent({ action: 'status_changed', entity: 'batch', entityId: batchId, details: { new_status: next } })
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: next } : b))
    setConfirmAction(null); setTransitioning(null)
  }

  async function doClone(batch) {
    setCloning(true)
    try {
      const { data: cloned, error } = await supabase
        .from('batches')
        .insert({ name: `${batch.name} (copy)`, scheduled_start: batch.scheduled_start, duration_minutes: batch.duration_minutes, questions_per_student: batch.questions_per_student, access_code: batch.access_code, status: 'draft' })
        .select('id').single()
      if (error) throw error

      const { data: questions } = await supabase
        .from('questions')
        .select('question_text, option_a, option_b, option_c, option_d, correct_answer, sort_order')
        .eq('batch_id', batch.id)
      if (questions?.length) {
        await supabase.from('questions').insert(questions.map(q => ({ ...q, batch_id: cloned.id })))
      }
      await logAuditEvent({ action: 'batch_cloned', entity: 'batch', entityId: cloned.id, details: { source_batch_id: batch.id, source_name: batch.name } })
      setCloneTarget(null)
      await fetchBatches()
    } catch (err) {
      alert('Clone failed: ' + err.message)
    } finally {
      setCloning(false)
    }
  }

  const hasActiveBatch = batches.some(b => b.status === 'active')

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.4px' }}>All Batches</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {batches.length} total
            {hasActiveBatch && (
              <>
                <span
                  className="u-pulse-dot"
                  style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }}
                />
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>Live monitoring on</span>
              </>
            )}
          </p>
        </div>
        <button onClick={onCreateBatch} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
          + New Batch
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner />
          <p style={{ marginTop: 12, color: 'var(--text-3)', fontSize: 13 }}>Loading batches…</p>
        </div>
      )}

      {/* Empty */}
      {!loading && batches.length === 0 && (
        <div className="card" style={{ padding: '64px 32px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <InboxIcon />
          </div>
          <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--text-1)', fontSize: 16 }}>No batches yet</p>
          <p style={{ margin: '0 0 24px', color: 'var(--text-2)', fontSize: 13 }}>Create your first exam batch to get started.</p>
          <button onClick={onCreateBatch} className="btn btn-primary" style={{ margin: '0 auto', padding: '10px 20px' }}>
            Create first batch
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && batches.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['Name', 'Scheduled (IST)', 'Duration', 'Status', 'Questions', 'Roster', 'Submissions', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', whiteSpace: 'nowrap', fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((batch, i) => {
                  const ss          = STATUS_STYLE[batch.status] || STATUS_STYLE.draft
                  const transitions = TRANSITIONS[batch.status] || []
                  const isActive    = batch.status === 'active'
                  const started     = startedCounts[batch.id]    ?? 0
                  const submitted   = submissionCounts[batch.id] ?? 0
                  const rostered    = rosterCounts[batch.id]     ?? 0

                  return (
                    <tr
                      key={batch.id}
                      className="table-row"
                      style={{ borderBottom: i < batches.length - 1 ? '1px solid var(--border)' : 'none' }}
                    >
                      {/* Name */}
                      <td style={{ padding: '13px 14px', fontWeight: 600, color: 'var(--text-1)', minWidth: 140 }}>
                        {batch.name}
                        {batch.access_code && (
                          <div style={{ marginTop: 3, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-lt)', border: '1px solid #FDE68A', borderRadius: 99, padding: '1px 6px', marginLeft: 6 }}>
                            🔒 Code
                          </div>
                        )}
                      </td>

                      {/* Date */}
                      <td style={{ padding: '13px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'dd MMM yy, hh:mm a')}
                      </td>

                      {/* Duration */}
                      <td style={{ padding: '13px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {batch.duration_minutes} min
                      </td>

                      {/* Status badge */}
                      <td style={{ padding: '13px 14px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                          fontSize: 11, fontWeight: 600,
                          background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
                          textTransform: 'capitalize', whiteSpace: 'nowrap',
                        }}>
                          {isActive && <span className="u-pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />}
                          {batch.status}
                        </span>
                      </td>

                      {/* Questions */}
                      <td style={{ padding: '13px 14px', color: 'var(--text-2)' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{questionCounts[batch.id] ?? 0}</span>
                        {batch.questions_per_student && (
                          <span style={{ color: 'var(--text-3)', marginLeft: 3, fontSize: 11 }}>/ {batch.questions_per_student} ea</span>
                        )}
                      </td>

                      {/* Roster */}
                      <td style={{ padding: '13px 14px' }}>
                        {rostered > 0
                          ? <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{rostered}</span>
                          : <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                        }
                      </td>

                      {/* Submissions / live progress */}
                      <td style={{ padding: '13px 14px', minWidth: 110 }}>
                        {isActive && rostered > 0 ? (
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>
                              {started} started · <strong style={{ color: 'var(--success)' }}>{submitted}</strong> done
                            </div>
                            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%',
                                width: `${rostered > 0 ? Math.round((submitted / rostered) * 100) : 0}%`,
                                background: 'var(--success)', borderRadius: 3,
                                transition: 'width .5s ease',
                              }} />
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
                              {rostered > 0 ? Math.round((submitted / rostered) * 100) : 0}% of {rostered}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{submitted}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '13px 14px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          <button onClick={() => onSelectBatch(batch)} className="action-link">Edit</button>
                          <button onClick={() => onManageQuestions(batch)} className="action-link">Questions</button>
                          <button onClick={() => onManageRoster(batch)} className="action-link">Roster</button>
                          {(batch.status === 'active' || batch.status === 'completed') && (
                            <button onClick={() => onViewResults(batch)} className="action-link">Results</button>
                          )}
                          <button onClick={() => setCloneTarget(batch)} className="action-link">Clone</button>

                          {transitions.map(t => (
                            <button
                              key={t.next}
                              onClick={() => setConfirmAction({ batchId: batch.id, ...t })}
                              disabled={transitioning === batch.id}
                              style={{
                                all: 'unset', cursor: 'pointer',
                                fontSize: 11, fontWeight: 600,
                                padding: '3px 9px', borderRadius: 6,
                                border: '1px solid',
                                whiteSpace: 'nowrap',
                                ...(t.variant === 'success'
                                  ? { background: 'var(--success-lt)', color: 'var(--success)', borderColor: '#A7F3D0' }
                                  : t.variant === 'danger'
                                    ? { background: 'var(--error-lt)', color: 'var(--error)', borderColor: '#FECACA' }
                                    : { background: 'var(--surface)', color: 'var(--text-2)', borderColor: 'var(--border-md)' }
                                ),
                                opacity: transitioning === batch.id ? .5 : 1,
                              }}
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
        </div>
      )}

      {/* Status transition modal */}
      {confirmAction && (
        <div className="admin-overlay">
          <div className="card u-slide-up" style={{ maxWidth: 380, width: '100%', padding: '28px 24px', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700 }}>Confirm: {confirmAction.label}</h3>
            {confirmAction.next === 'active' && (
              <div style={{ background: 'var(--warn-lt)', border: '1px solid #FDE68A', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--warn)' }}>
                This will immediately allow students to begin the exam.
              </div>
            )}
            {confirmAction.next === 'completed' && (
              <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--error)' }}>
                This will end the exam for all students immediately.
              </div>
            )}
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-2)' }}>Are you sure you want to continue?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => doTransition(confirmAction.batchId, confirmAction.next)} className="btn btn-primary" style={{ padding: '9px 18px', fontSize: 13 }}>
                Confirm
              </button>
              <button onClick={() => setConfirmAction(null)} className="btn btn-secondary" style={{ padding: '9px 18px', fontSize: 13 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone modal */}
      {cloneTarget && (
        <div className="admin-overlay">
          <div className="card u-slide-up" style={{ maxWidth: 400, width: '100%', padding: '28px 24px', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700 }}>Clone batch?</h3>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-2)' }}>
              A new draft batch <strong>"{cloneTarget.name} (copy)"</strong> will be created with:
            </p>
            <ul style={{ margin: '8px 0 20px', paddingLeft: 18, fontSize: 13, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>Same name, schedule, duration, and question settings</li>
              <li>All questions copied from the original</li>
              <li>Status set to <strong>draft</strong></li>
              <li>Roster <strong>not</strong> copied — must upload separately</li>
            </ul>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => doClone(cloneTarget)} disabled={cloning} className="btn btn-primary" style={{ padding: '9px 18px', fontSize: 13 }}>
                {cloning ? <><Spinner size={14} /> Cloning…</> : 'Clone'}
              </button>
              <button onClick={() => setCloneTarget(null)} disabled={cloning} className="btn btn-secondary" style={{ padding: '9px 18px', fontSize: 13 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="u-spin" style={{ display: 'block', margin: '0 auto' }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
    </svg>
  )
}

function InboxIcon() {
  return (
    <svg width="24" height="24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" viewBox="0 0 24 24">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
