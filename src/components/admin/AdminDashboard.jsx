import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'

export function AdminDashboard({ onViewAllBatches, onCreateBatch, onViewResults, onManageRoster, onManageQuestions }) {
  const [live,      setLive]      = useState([])
  const [upcoming,  setUpcoming]  = useState([])
  const [completed, setCompleted] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [counts,    setCounts]    = useState({})

  const fetchAll = useCallback(async () => {
    const now      = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const [liveR, upcomingR, completedR] = await Promise.all([
      supabase.from('batches').select('*').eq('status', 'active'),
      supabase.from('batches').select('*').eq('status', 'scheduled')
        .gte('scheduled_start', now.toISOString())
        .lte('scheduled_start', nextWeek.toISOString())
        .order('scheduled_start'),
      supabase.from('batches').select('*').eq('status', 'completed')
        .order('scheduled_start', { ascending: false }).limit(5),
    ])

    const allBatches = [...(liveR.data || []), ...(upcomingR.data || []), ...(completedR.data || [])]
    setLive(liveR.data || [])
    setUpcoming(upcomingR.data || [])
    setCompleted(completedR.data || [])

    if (allBatches.length) {
      const ids = allBatches.map(b => b.id)
      const [attR, rosterR] = await Promise.all([
        supabase.from('attempts').select('batch_id, submitted_at, score, total_questions').in('batch_id', ids),
        supabase.from('roster').select('batch_id').in('batch_id', ids),
      ])
      const c = {}
      ids.forEach(id => { c[id] = { started: 0, submitted: 0, rostered: 0, scores: [] } })
      attR.data?.forEach(a => {
        c[a.batch_id].started++
        if (a.submitted_at) {
          c[a.batch_id].submitted++
          if (a.score !== null && a.total_questions) {
            c[a.batch_id].scores.push(Math.round((a.score / a.total_questions) * 100))
          }
        }
      })
      rosterR.data?.forEach(r => { c[r.batch_id].rostered++ })
      Object.keys(c).forEach(id => {
        const s = c[id].scores
        c[id].avg = s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null
      })
      setCounts(c)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // fetchAll is async—setState calls happen after await, not synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll()
    const interval = setInterval(fetchAll, 30_000)
    return () => clearInterval(interval)
  }, [fetchAll])

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <Spinner size={24} />
        <p style={{ marginTop: 12, color: 'var(--text-3)', fontSize: 13 }}>Loading dashboard…</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── Page header ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.4px' }}>Dashboard</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            Overview of your exam batches
            {live.length > 0 && (
              <span className="u-pulse-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', marginLeft: 8, verticalAlign: 'middle' }} />
            )}
            {live.length > 0 && (
              <span style={{ marginLeft: 4, color: 'var(--success)', fontWeight: 600 }}>{live.length} live now</span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCreateBatch} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
            + New Batch
          </button>
          <button onClick={onViewAllBatches} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: 13 }}>
            All Batches
          </button>
        </div>
      </div>

      {/* ── Summary stat strip ──────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard
          value={live.length}
          label="Active now"
          color="var(--success)"
          bg="var(--success-lt)"
          border="#A7F3D0"
          icon={<ActiveIcon />}
        />
        <StatCard
          value={upcoming.length}
          label="Upcoming (7 days)"
          color="var(--accent)"
          bg="var(--accent-lt)"
          border="var(--accent-md)"
          icon={<CalendarIcon />}
        />
        <StatCard
          value={completed.length}
          label="Recently completed"
          color="#7C3AED"
          bg="#F5F3FF"
          border="#DDD6FE"
          icon={<CheckIcon />}
        />
      </div>

      {/* ── Live Now ─────────────────────────────────────── */}
      <Section title="Live Now" count={live.length} countColor="var(--success)">
        {live.length === 0 ? (
          <EmptyCard icon={<BroadcastIcon />} text="No exams running right now." />
        ) : (
          live.map(batch => {
            const c = counts[batch.id] || {}
            const rostered  = c.rostered  || 0
            const submitted = c.submitted  || 0
            const started   = c.started   || 0
            const pct = rostered > 0 ? Math.round((submitted / rostered) * 100) : null

            return (
              <div key={batch.id} className="live-card">
                {/* Green top strip */}
                <div style={{ height: 3, background: 'var(--success)' }} />
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span
                          className="u-pulse-dot"
                          style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }}
                        />
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)', letterSpacing: '-.1px' }}>{batch.name}</span>
                      </div>

                      {/* Stats row */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 13, color: 'var(--text-2)', marginBottom: pct !== null ? 10 : 0 }}>
                        <span><strong style={{ color: 'var(--text-1)' }}>{started}</strong> started</span>
                        <span><strong style={{ color: 'var(--success)', fontSize: 14 }}>{submitted}</strong> submitted</span>
                        {rostered > 0 && <span><strong style={{ color: 'var(--text-1)' }}>{rostered}</strong> rostered</span>}
                      </div>

                      {/* Progress bar */}
                      {pct !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 320 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--success)', borderRadius: 3, transition: 'width .5s ease' }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', minWidth: 32 }}>{pct}%</span>
                        </div>
                      )}
                    </div>

                    <button onClick={() => onViewResults(batch)} className="btn btn-secondary" style={{ padding: '7px 14px', fontSize: 12, flexShrink: 0 }}>
                      View Results
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </Section>

      {/* ── Upcoming ─────────────────────────────────────── */}
      <Section title="Upcoming — Next 7 Days" count={upcoming.length} countColor="var(--accent)">
        {upcoming.length === 0 ? (
          <EmptyCard icon={<CalendarIcon />} text="No exams scheduled in the next 7 days." />
        ) : (
          upcoming.map(batch => (
            <div key={batch.id} className="card" style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', marginBottom: 3, letterSpacing: '-.1px' }}>{batch.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', flexWrap: 'wrap', gap: '2px 8px', alignItems: 'center' }}>
                    <span>{formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'EEE, dd MMM · hh:mm a')} IST</span>
                    <span style={{ color: 'var(--border-md)' }}>·</span>
                    <span>{batch.duration_minutes} min</span>
                    {(counts[batch.id]?.rostered || 0) > 0 && (
                      <><span style={{ color: 'var(--border-md)' }}>·</span><span style={{ color: 'var(--success)', fontWeight: 600 }}>{counts[batch.id].rostered} rostered</span></>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => onManageRoster(batch)} className="action-link">Roster</button>
                  <button onClick={() => onManageQuestions(batch)} className="action-link">Questions</button>
                </div>
              </div>
            </div>
          ))
        )}
      </Section>

      {/* ── Recently Completed ───────────────────────────── */}
      <Section title="Recently Completed" count={completed.length} countColor="#7C3AED">
        {completed.length === 0 ? (
          <EmptyCard icon={<CheckIcon />} text="No completed exams yet." />
        ) : (
          completed.map(batch => {
            const c = counts[batch.id] || {}
            const completionRate = c.rostered > 0 ? Math.round((c.submitted / c.rostered) * 100) : null
            return (
              <div key={batch.id} className="card" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', marginBottom: 4, letterSpacing: '-.1px' }}>{batch.name}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 12, color: 'var(--text-2)', alignItems: 'center' }}>
                      <span>{formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'dd MMM yyyy')}</span>
                      <span style={{ color: 'var(--border-md)' }}>·</span>
                      <span><strong style={{ color: 'var(--text-1)' }}>{c.submitted || 0}</strong> submissions</span>
                      {c.avg !== null && (
                        <><span style={{ color: 'var(--border-md)' }}>·</span><span style={{ color: 'var(--accent)', fontWeight: 600 }}>Avg {c.avg}%</span></>
                      )}
                      {completionRate !== null && (
                        <><span style={{ color: 'var(--border-md)' }}>·</span><span>{completionRate}% completion</span></>
                      )}
                    </div>
                  </div>
                  <button onClick={() => onViewResults(batch)} className="action-link">Results →</button>
                </div>
              </div>
            )
          })
        )}
      </Section>
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────── */

function StatCard({ value, label, color, bg, border, icon }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1, marginBottom: 4, letterSpacing: '-.5px' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{label}</div>
    </div>
  )
}

function Section({ title, count, countColor, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.1px' }}>{title}</h2>
        {count > 0 && (
          <span style={{ padding: '1px 8px', borderRadius: 'var(--radius-pill)', background: countColor, color: '#fff', fontSize: 11, fontWeight: 700 }}>
            {count}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}

function EmptyCard({ icon, text }) {
  return (
    <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
      <div style={{ color: 'var(--text-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <span style={{ fontSize: 13 }}>{text}</span>
      </div>
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

/* ── Icons ───────────────────────────────────────────────── */
function ActiveIcon() {
  return <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
function CalendarIcon() {
  return <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
}
function CheckIcon() {
  return <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
function BroadcastIcon() {
  return <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.49-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" strokeLinecap="round"/></svg>
}
