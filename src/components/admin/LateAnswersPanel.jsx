import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'

/**
 * LateAnswersPanel — quarantined post-deadline answers awaiting review.
 * Renders nothing when the batch has no late arrivals. Accepting applies
 * the answer and rescores the attempt; rejecting keeps the record. Both
 * are audited. Client timestamps are shown as context but labeled as the
 * device's own clock — only received_at is server truth.
 */
export function LateAnswersPanel({ batch, canManage, onReviewed }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: err } = await supabase
        .from('late_responses')
        .select('id, question_id, selected_answer, client_saved_at, received_at, status, reviewed_by, attempts!inner(batch_id, roll_number, student_name)')
        .eq('attempts.batch_id', batch.id)
        .order('received_at', { ascending: true })
      if (cancelled) return
      if (err) { setError(formatDbError(err, 'Failed to load late answers.')); return }
      setRows(data ?? [])
    }
    load()
    return () => { cancelled = true }
  }, [batch.id, reloadKey])

  async function review(id, accept) {
    setBusyId(id)
    setError(null)
    const { error: err } = await supabase.rpc('review_late_response', { p_late_id: id, p_accept: accept })
    if (err) setError(formatDbError(err, 'Review failed.'))
    else {
      setReloadKey(k => k + 1)
      if (accept) onReviewed?.() // scores changed — parent refreshes results
    }
    setBusyId(null)
  }

  const pending = (rows ?? []).filter(r => r.status === 'quarantined')
  const reviewed = (rows ?? []).filter(r => r.status !== 'quarantined')
  if (!rows || rows.length === 0) return null

  return (
    <section style={{ marginBottom: 24 }}>
      <div className="card" style={{ padding: '16px 20px', borderLeft: '3px solid var(--warn)' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
          Late answers awaiting review {pending.length > 0 && <span style={{ color: 'var(--warn)' }}>({pending.length})</span>}
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
          These answers reached the server after the exam deadline (buffered on the student's device
          during a connection outage). They are <strong>not counted</strong> unless you accept them.
          Accepting applies the answer and rescores the attempt — re-issue any certificate afterwards.
          The "saved on device" time is the student's own clock; treat it as context, not proof.
        </p>
        {error && <p role="alert" style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--error)' }}>{error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pending.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, padding: '8px 10px', background: 'var(--warn-lt)', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ whiteSpace: 'nowrap' }}>{r.attempts.roll_number} · {r.attempts.student_name}</strong>
              <span style={{ color: 'var(--text-2)' }}>answered <strong>{r.selected_answer}</strong></span>
              <span style={{ color: 'var(--text-3)', fontSize: 11 }}>
                saved on device {fmtTime(r.client_saved_at)} · received {fmtTime(r.received_at)}
              </span>
              {canManage && (
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button onClick={() => review(r.id, true)} disabled={busyId === r.id} className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 12 }}>Accept</button>
                  <button onClick={() => review(r.id, false)} disabled={busyId === r.id} className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 12, color: 'var(--error)' }}>Reject</button>
                </span>
              )}
            </div>
          ))}
          {reviewed.length > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
              {reviewed.length} previously reviewed ({reviewed.filter(r => r.status === 'accepted').length} accepted,{' '}
              {reviewed.filter(r => r.status === 'rejected').length} rejected) — full trail in the activity log.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function fmtTime(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return '—'
  }
}
