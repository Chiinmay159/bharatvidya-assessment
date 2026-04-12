import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'

export function BatchSelect({ onSelectBatch }) {
  const [batches,    setBatches]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [rollFilter, setRollFilter] = useState('')
  const [filtered,   setFiltered]   = useState([])
  const [filtering,  setFiltering]  = useState(false)

  const fetchBatches = useCallback(async () => {
    const { data, error } = await supabase
      .from('batches')
      .select('id, name, scheduled_start, duration_minutes, status, questions_per_student, access_code')
      .in('status', ['scheduled', 'active'])
      .order('scheduled_start', { ascending: true })

    if (error) setError('Failed to load exam batches. Please refresh.')
    else { setBatches(data || []); setError(null) }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchBatches()
    const interval = setInterval(fetchBatches, 30_000)
    return () => clearInterval(interval)
  }, [fetchBatches])

  useEffect(() => {
    if (!rollFilter.trim() || !batches.length) { setFiltered(batches); return }
    applyRosterFilter(rollFilter.trim(), batches)
  }, [rollFilter, batches])

  async function applyRosterFilter(roll, allBatches) {
    setFiltering(true)
    const ids = allBatches.map(b => b.id)
    try {
      const { data: allRoster } = await supabase
        .from('roster').select('batch_id').in('batch_id', ids)
      const batchesWithRoster = new Set((allRoster || []).map(r => r.batch_id))
      const { data: myRoster } = await supabase
        .from('roster').select('batch_id').in('batch_id', ids).eq('roll_number', roll)
      const myBatches = new Set((myRoster || []).map(r => r.batch_id))
      setFiltered(allBatches.filter(b => !batchesWithRoster.has(b.id) || myBatches.has(b.id)))
    } catch (_) { setFiltered(allBatches) }
    setFiltering(false)
  }

  const displayBatches = rollFilter.trim() ? filtered : batches

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Hero ──────────────────────────────────────────── */}
      <div style={{ background: 'var(--gradient-hero)', padding: '32px 24px 56px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {/* Brand bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
            <img src="/logo.png" alt="BharatVidya" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, boxShadow: '0 0 0 2px rgba(255,255,255,.2)' }} />
            <span style={{ fontWeight: 600, color: 'rgba(255,255,255,.8)', fontSize: 15, letterSpacing: '-.1px' }}>
              BharatVidya Exams
            </span>
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-.6px', lineHeight: 1.15 }}>
            Select your exam
          </h1>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 15, lineHeight: 1.55 }}>
            Choose the batch scheduled for you and enter your details to begin.
          </p>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────── */}
      <main style={{ flex: 1, maxWidth: 640, width: '100%', margin: '0 auto', padding: '0 20px 60px' }}>

        {/* Filter card — overlaps hero */}
        <div className="card" style={{ marginTop: -28, padding: '18px 20px', marginBottom: 24, boxShadow: 'var(--shadow-md)' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8 }}>
            Filter by roll number
          </label>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none', display: 'flex' }}>
              <SearchIcon />
            </div>
            <input
              type="text"
              value={rollFilter}
              onChange={e => setRollFilter(e.target.value)}
              placeholder="Enter your roll number (optional)"
              className="form-input"
              style={{ paddingLeft: 38 }}
            />
            {filtering && (
              <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', display: 'flex' }}>
                <Spinner size={15} />
              </div>
            )}
          </div>
          {rollFilter.trim() && !filtering && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              {displayBatches.length === 0
                ? 'No exams found for this roll number. Try clearing the field to see all.'
                : <>
                    Showing {displayBatches.length} exam{displayBatches.length !== 1 ? 's' : ''} for{' '}
                    <strong style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{rollFilter.trim()}</strong>
                  </>
              }
            </p>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)', padding: '40px 0' }}>
            <Spinner size={18} />
            <span style={{ fontSize: 14 }}>Loading available exams…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '12px 16px', color: 'var(--error)', fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && displayBatches.length === 0 && (
          <div className="card u-slide-up" style={{ padding: '56px 32px', textAlign: 'center' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 18px',
            }}>
              <InboxIcon />
            </div>
            <p style={{ fontWeight: 700, color: 'var(--text-1)', fontSize: 17, marginBottom: 8, letterSpacing: '-.2px' }}>
              {rollFilter.trim() ? 'No exams found' : 'No exams scheduled'}
            </p>
            <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.65, maxWidth: 300, margin: '0 auto' }}>
              {rollFilter.trim()
                ? 'Clear the filter to see all available exams, or contact your instructor.'
                : 'Check back closer to your exam time.'}
            </p>
          </div>
        )}

        {/* Batch list */}
        {!loading && !error && displayBatches.length > 0 && (
          <div className="u-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayBatches.map(batch => {
              const isLive = batch.status === 'active'
              const dateStr = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'EEE, d MMM yyyy')
              const timeStr = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'hh:mm a')

              return (
                <button key={batch.id} className="batch-card" onClick={() => onSelectBatch(batch)}>
                  <div style={{ display: 'flex', alignItems: 'stretch' }}>
                    {/* Left accent stripe */}
                    <div style={{
                      width: 4, flexShrink: 0,
                      background: isLive ? 'var(--success)' : 'var(--accent)',
                      borderRadius: '11px 0 0 11px',
                    }} />

                    <div style={{ flex: 1, padding: '18px 20px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)', marginBottom: 5, letterSpacing: '-.15px' }}>
                            {batch.name}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '3px 8px' }}>
                            <span>{dateStr} · {timeStr} IST</span>
                            <Dot />
                            <span>{batch.duration_minutes} min</span>
                            {batch.questions_per_student && (
                              <><Dot /><span>{batch.questions_per_student} questions</span></>
                            )}
                          </div>
                          {batch.access_code && (
                            <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-lt)', border: '1px solid #FDE68A', borderRadius: 'var(--radius-pill)', padding: '2px 8px' }}>
                              <LockIcon /> Access code required
                            </div>
                          )}
                        </div>
                        <LiveBadge live={isLive} />
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────── */

function LiveBadge({ live }) {
  return (
    <span style={{
      flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 'var(--radius-pill)',
      fontSize: 12, fontWeight: 600,
      background: live ? 'var(--success-lt)' : 'var(--accent-lt)',
      color: live ? 'var(--success)' : 'var(--accent)',
      border: `1px solid ${live ? '#A7F3D0' : 'var(--accent-md)'}`,
    }}>
      {live && (
        <span
          className="u-pulse-dot"
          style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }}
        />
      )}
      {live ? 'Live now' : 'Upcoming'}
    </span>
  )
}

function Dot() {
  return <span style={{ color: 'var(--border-md)', fontSize: 10, lineHeight: 1 }}>●</span>
}

function SearchIcon() {
  return (
    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" />
    </svg>
  )
}

function InboxIcon() {
  return (
    <svg width="26" height="26" fill="none" stroke="var(--text-3)" strokeWidth="1.5" viewBox="0 0 24 24">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Spinner({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="u-spin" style={{ display: 'block' }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
    </svg>
  )
}
