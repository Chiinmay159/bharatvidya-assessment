import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'

export function BatchSelect({ onSelectBatch }) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchBatches()
    const interval = setInterval(fetchBatches, 30_000)
    return () => clearInterval(interval)
  }, [])

  async function fetchBatches() {
    const { data, error } = await supabase
      .from('batches')
      .select('id, name, scheduled_start, duration_minutes, status, questions_per_student')
      .in('status', ['scheduled', 'active'])
      .order('scheduled_start', { ascending: true })

    if (error) setError('Failed to load exam batches. Please refresh.')
    else { setBatches(data || []); setError(null) }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <img src="/logo.png" alt="BharatVidya" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
        <span style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 15 }}>BharatVidya Exams</span>
      </header>

      {/* Body */}
      <main style={{ flex: 1, maxWidth: 640, width: '100%', margin: '0 auto', padding: '48px 20px' }}>
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.4px' }}>
            Select your exam
          </h1>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 15 }}>
            Choose the batch scheduled for you and enter your details to begin.
          </p>
        </div>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)', padding: '32px 0' }}>
            <Spinner size={18} />
            <span style={{ fontSize: 14 }}>Loading available exams…</span>
          </div>
        )}

        {error && (
          <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '12px 16px', color: 'var(--error)', fontSize: 14 }}>
            {error}
          </div>
        )}

        {!loading && !error && batches.length === 0 && (
          <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
            <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text-1)' }}>No exams scheduled right now</p>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>Check back closer to your exam time.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {batches.map(batch => {
            const isLive = batch.status === 'active'
            return (
              <button
                key={batch.id}
                onClick={() => onSelectBatch(batch)}
                style={{
                  all: 'unset',
                  display: 'block',
                  cursor: 'pointer',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px 24px',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'border-color .15s, box-shadow .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-1)', marginBottom: 6 }}>
                      {batch.name}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                      <span>
                        {formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'EEE, dd MMM yyyy')}
                        {' · '}
                        {formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'hh:mm a')} IST
                      </span>
                      <span style={{ color: 'var(--text-3)' }}>·</span>
                      <span>{batch.duration_minutes} min</span>
                    </div>
                  </div>
                  <StatusBadge live={isLive} />
                </div>
              </button>
            )
          })}
        </div>
      </main>
    </div>
  )
}

function StatusBadge({ live }) {
  return (
    <span style={{
      flexShrink: 0,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 10px',
      borderRadius: 99,
      fontSize: 12,
      fontWeight: 600,
      background: live ? 'var(--success-lt)' : 'var(--accent-lt)',
      color: live ? 'var(--success)' : 'var(--accent)',
      border: `1px solid ${live ? '#A7F3D0' : 'var(--accent-md)'}`,
    }}>
      {live && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />}
      {live ? 'Live now' : 'Upcoming'}
    </span>
  )
}

function Spinner({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
    </svg>
  )
}
