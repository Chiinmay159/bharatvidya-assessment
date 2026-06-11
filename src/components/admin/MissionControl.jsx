import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'
import { Spinner } from '../shared/Spinner'
import { FocusTrapModal } from '../shared/FocusTrapModal'

const REFRESH_MS = 10_000

/**
 * MissionControl — live exam-day view of every student in a batch.
 * States: in_exam (heartbeat < 90s old) · disconnected · submitted.
 * Actions: grant per-student time extension (audit-logged server-side).
 * Re-admission needs no action — a dropped student refreshes and resumes
 * (claim_session rotates their token; answers are already saved).
 */
export function MissionControl({ batch, onBack }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [filter, setFilter] = useState('all') // all | in_exam | disconnected | submitted | flagged
  const [extendTarget, setExtendTarget] = useState(null)
  const [extendMinutes, setExtendMinutes] = useState(15)
  const [extendBusy, setExtendBusy] = useState(false)
  const timerRef = useRef(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('mission_control', { p_batch_id: batch.id })
    if (err) { setError(formatDbError(err, 'Failed to load live status.')); return }
    setError(null)
    setRows(data ?? [])
    setLastUpdated(new Date())
  }, [batch.id])

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, REFRESH_MS)
    return () => clearInterval(timerRef.current)
  }, [load])

  async function handleExtend() {
    if (!extendTarget) return
    setExtendBusy(true)
    try {
      const { error: err } = await supabase.rpc('grant_time_extension', {
        p_attempt_id: extendTarget.attempt_id,
        p_minutes: extendMinutes,
      })
      if (err) throw err
      setExtendTarget(null)
      load()
    } catch (err) {
      setError(formatDbError(err, 'Could not grant the extension.'))
      setExtendTarget(null)
    } finally {
      setExtendBusy(false)
    }
  }

  if (!rows && !error) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={26} color="var(--accent)" /></div>
  }

  const all = rows ?? []
  const counts = {
    in_exam: all.filter(r => r.state === 'in_exam').length,
    disconnected: all.filter(r => r.state === 'disconnected').length,
    submitted: all.filter(r => r.state === 'submitted').length,
    flagged: all.filter(r => r.tab_switches + r.integrity_flags >= 3).length,
  }
  const visible = all.filter(r => {
    if (filter === 'all') return true
    if (filter === 'flagged') return r.tab_switches + r.integrity_flags >= 3
    return r.state === filter
  })

  return (
    <div>
      <button onClick={onBack} style={backBtn}>← Back</button>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>
          {batch.name} — Mission Control
        </h2>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }} role="status">
          {lastUpdated ? `auto-refreshing · updated ${lastUpdated.toLocaleTimeString()}` : ''}
        </span>
      </div>

      {/* Exam code — front and centre for invigilators to read out */}
      {batch.access_code && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'var(--accent-lt)', border: '1px solid var(--accent-md)', borderRadius: 'var(--radius-sm)', padding: '8px 14px', margin: '6px 0 4px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent-deep)' }}>Exam code</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, letterSpacing: '.14em', color: 'var(--text-1)' }}>{batch.access_code}</span>
          <button
            onClick={() => navigator.clipboard?.writeText(batch.access_code)}
            className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}
            aria-label="Copy exam code"
          >Copy</button>
        </div>
      )}

      {error && (
        <div role="alert" style={{ background: 'var(--error-lt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--error)', fontSize: 13, margin: '10px 0' }}>
          {error}
        </div>
      )}

      {/* State summary / filter chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 18px' }}>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} label={`All ${all.length}`} />
        <Chip active={filter === 'in_exam'} onClick={() => setFilter('in_exam')} color="var(--success)" bg="var(--success-lt)" label={`In exam ${counts.in_exam}`} />
        <Chip active={filter === 'disconnected'} onClick={() => setFilter('disconnected')} color="var(--error)" bg="var(--error-lt)" label={`Disconnected ${counts.disconnected}`} />
        <Chip active={filter === 'submitted'} onClick={() => setFilter('submitted')} color="var(--text-2)" bg="var(--surface-2)" label={`Submitted ${counts.submitted}`} />
        <Chip active={filter === 'flagged'} onClick={() => setFilter('flagged')} color="var(--warn)" bg="var(--warn-lt)" label={`Flagged ${counts.flagged}`} />
      </div>

      {all.length === 0 ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
          No students have entered this exam yet.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={th}>Roll</th>
                <th style={{ ...th, textAlign: 'left' }}>Name</th>
                <th style={th}>State</th>
                <th style={th}>Answers</th>
                <th style={th}>Last seen</th>
                <th style={th}>Signals</th>
                <th style={th}>Extension</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.attempt_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.roll_number}</td>
                  <td style={{ ...td, textAlign: 'left' }}>{r.student_name}</td>
                  <td style={td}><StateBadge state={r.state} /></td>
                  <td style={td}>{r.answers_saved}</td>
                  <td style={{ ...td, fontSize: 12, color: 'var(--text-3)' }}>{ago(r.last_seen)}</td>
                  <td style={{ ...td, fontSize: 12, color: r.tab_switches + r.integrity_flags >= 3 ? 'var(--warn)' : 'var(--text-3)' }}>
                    {r.tab_switches + r.integrity_flags > 0 ? `${r.tab_switches} tab · ${r.integrity_flags} other` : '—'}
                  </td>
                  <td style={td}>{r.extra_time_minutes > 0 ? `+${r.extra_time_minutes}m` : '—'}</td>
                  <td style={td}>
                    {r.state !== 'submitted' && (
                      <button
                        onClick={() => { setExtendMinutes(r.extra_time_minutes > 0 ? r.extra_time_minutes : 15); setExtendTarget(r) }}
                        className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}
                      >
                        Extend time
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
        "Disconnected" = no heartbeat for 90s — usually a network drop or closed tab. The student can simply
        reopen the exam link and resume; their answers are already saved. Extensions take effect on the
        student's next heartbeat (within ~30s) and must be granted before their timer expires.
      </p>

      {extendTarget && (
        <FocusTrapModal ariaLabel="Grant time extension" onClose={() => setExtendTarget(null)}>
          <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>Extend time</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)' }}>
            {extendTarget.roll_number} · {extendTarget.student_name}
          </p>
          <label style={{ display: 'block', marginBottom: 18, textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5 }}>
              Total extra minutes (replaces any previous extension)
            </span>
            <input
              type="number" min="0" max="240" value={extendMinutes}
              onChange={e => setExtendMinutes(parseInt(e.target.value) || 0)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: 14, border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleExtend} disabled={extendBusy} className="btn btn-primary" style={{ flex: 1, padding: '11px 16px' }}>
              {extendBusy ? <><Spinner size={14} /> Granting…</> : `Grant +${extendMinutes} min`}
            </button>
            <button onClick={() => setExtendTarget(null)} className="btn btn-secondary" style={{ flex: 1, padding: '11px 16px' }}>
              Cancel
            </button>
          </div>
        </FocusTrapModal>
      )}
    </div>
  )
}

function Chip({ active, onClick, label, color = 'var(--text-1)', bg = 'var(--surface)' }) {
  return (
    <button onClick={onClick} aria-pressed={active} style={{
      all: 'unset', cursor: 'pointer', padding: '6px 14px',
      borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700,
      background: bg, color,
      border: `2px solid ${active ? color : 'var(--border)'}`,
    }}>{label}</button>
  )
}

function StateBadge({ state }) {
  const map = {
    in_exam:      { label: 'In exam',      color: 'var(--success)', bg: 'var(--success-lt)' },
    disconnected: { label: 'Disconnected', color: 'var(--error)',   bg: 'var(--error-lt)' },
    submitted:    { label: 'Submitted',    color: 'var(--text-2)',  bg: 'var(--surface-2)' },
  }
  const s = map[state] ?? map.submitted
  return (
    <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, border: '1px solid var(--border)' }}>
      {s.label}
    </span>
  )
}

function ago(ts) {
  if (!ts) return 'never'
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

const backBtn = {
  all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16,
}
const th = { padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center', whiteSpace: 'nowrap' }
const td = { padding: '9px 12px', textAlign: 'center', color: 'var(--text-1)', verticalAlign: 'middle' }
