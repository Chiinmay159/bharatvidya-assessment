import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { logAuditEvent } from '../../lib/auditLog'
import { BatchListRow } from './BatchListRow'
import { Spinner, InboxIcon } from './batchIcons'

export function BatchList({ canManage = true, canMonitor = true, onSelectBatch, onCreateBatch, onViewResults, onManageQuestions, onManageRoster, onMissionControl }) {
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
  const [deleteTarget,     setDeleteTarget]  = useState(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleting,         setDeleting]      = useState(false)
  const liveRefreshRef = useRef(null)

  const fetchCounts = useCallback(async (ids) => {
    if (!ids.length) return
    const [qr, subr, allAttempts, rosterR] = await Promise.all([
      supabase.from('questions').select('batch_id').in('batch_id', ids),
      supabase.from('attempts').select('batch_id, roll_number').in('batch_id', ids).not('submitted_at', 'is', null),
      supabase.from('attempts').select('batch_id, roll_number').in('batch_id', ids),
      supabase.from('roster').select('batch_id').in('batch_id', ids),
    ])
    const qc = {}, ac = {}, sc = {}, rc = {}
    ids.forEach(id => { qc[id] = 0; ac[id] = 0; sc[id] = 0; rc[id] = 0 })
    qr.data?.forEach(q  => { qc[q.batch_id] = (qc[q.batch_id] || 0) + 1 })
    rosterR.data?.forEach(r => { rc[r.batch_id] = (rc[r.batch_id] || 0) + 1 })
    // Count UNIQUE students (by roll_number) — retries don't inflate numbers
    const submittedSets = {}, startedSets = {}
    ids.forEach(id => { submittedSets[id] = new Set(); startedSets[id] = new Set() })
    subr.data?.forEach(a => { submittedSets[a.batch_id]?.add(a.roll_number) })
    allAttempts.data?.forEach(a => { startedSets[a.batch_id]?.add(a.roll_number) })
    ids.forEach(id => { ac[id] = submittedSets[id].size; sc[id] = startedSets[id].size })
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
        .insert({
          name: `${batch.name} (copy)`,
          scheduled_start: batch.scheduled_start,
          duration_minutes: batch.duration_minutes,
          questions_per_student: batch.questions_per_student,
          access_code: batch.access_code,
          show_results: batch.show_results ?? true,
          pass_percentage: batch.pass_percentage ?? null,
          max_attempts: batch.max_attempts ?? 1,
          status: 'draft',
        })
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

  async function doDelete(batchId) {
    setDeleting(true)
    try {
      const { error } = await supabase.rpc('delete_batch', { p_batch_id: batchId })
      if (error) throw error
      setDeleteTarget(null)
      setDeleteConfirmName('')
      await fetchBatches()
    } catch (err) {
      alert('Delete failed: ' + err.message)
    } finally {
      setDeleting(false)
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
        {onCreateBatch && (
          <button onClick={onCreateBatch} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
            + New Batch
          </button>
        )}
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
          {onCreateBatch && (
            <button onClick={onCreateBatch} className="btn btn-primary" style={{ margin: '0 auto', padding: '10px 20px' }}>
              Create first batch
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {!loading && batches.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <caption className="sr-only">All exam batches</caption>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['Name', 'Scheduled (IST)', 'Duration', 'Status', 'Questions', 'Roster', 'Submissions', 'Actions'].map(h => (
                    <th key={h} scope="col" style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-3)', whiteSpace: 'nowrap', fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((batch, i) => (
                  <BatchListRow
                    key={batch.id}
                    batch={batch}
                    isLast={i === batches.length - 1}
                    canManage={canManage}
                    canMonitor={canMonitor}
                    questionCounts={questionCounts}
                    startedCounts={startedCounts}
                    submissionCounts={submissionCounts}
                    rosterCounts={rosterCounts}
                    transitioning={transitioning}
                    onSelectBatch={onSelectBatch}
                    onManageQuestions={onManageQuestions}
                    onManageRoster={onManageRoster}
                    onViewResults={onViewResults}
                    onMissionControl={onMissionControl}
                    setCloneTarget={setCloneTarget}
                    setDeleteTarget={setDeleteTarget}
                    setDeleteConfirmName={setDeleteConfirmName}
                    setConfirmAction={setConfirmAction}
                  />
                ))}
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

      {/* Delete modal — double-confirm (type batch name) */}
      {deleteTarget && (
        <div className="admin-overlay">
          <div className="card u-slide-up" style={{ maxWidth: 420, width: '100%', padding: '28px 24px', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700, color: 'var(--error)' }}>Delete batch permanently?</h3>
            <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 16, fontSize: 13, color: 'var(--error)', lineHeight: 1.6 }}>
              This will permanently delete <strong>{deleteTarget.name}</strong> and all its data: questions, roster, student attempts, responses, and tab switch logs. This cannot be undone.
            </div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>
              Type <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{deleteTarget.name}</strong> to confirm:
            </label>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={e => setDeleteConfirmName(e.target.value)}
              placeholder={deleteTarget.name}
              autoFocus
              style={{
                width: '100%', padding: '9px 13px',
                border: '1px solid var(--border-md)', borderRadius: 'var(--radius-md)',
                fontSize: 14, color: 'var(--text-1)', background: 'var(--surface)',
                outline: 'none', fontFamily: 'inherit', marginBottom: 20,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => doDelete(deleteTarget.id)}
                disabled={deleting || deleteConfirmName.trim() !== deleteTarget.name.trim()}
                style={{
                  all: 'unset', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  padding: '9px 18px', borderRadius: 'var(--radius-md)',
                  background: 'var(--error)', color: '#fff',
                  fontSize: 13, fontWeight: 600,
                  opacity: (deleting || deleteConfirmName.trim() !== deleteTarget.name.trim()) ? .4 : 1,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button onClick={() => { setDeleteTarget(null); setDeleteConfirmName('') }} disabled={deleting} className="btn btn-secondary" style={{ padding: '9px 18px', fontSize: 13 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
