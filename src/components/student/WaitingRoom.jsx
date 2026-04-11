import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'

export function WaitingRoom({ batch, rollNumber, studentName, onExamStarted }) {
  const [hh, setHh] = useState('--')
  const [mm, setMm] = useState('--')
  const [ss, setSs] = useState('--')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const startTime = new Date(batch.scheduled_start).getTime()

    const tick = () => {
      const diff = startTime - Date.now()
      if (diff <= 0) {
        setHh('00'); setMm('00'); setSs('00')
        checkAndTransition()
        return
      }
      setHh(String(Math.floor(diff / 3600000)).padStart(2, '0'))
      setMm(String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0'))
      setSs(String(Math.floor((diff % 60000) / 1000)).padStart(2, '0'))
    }

    tick()
    const timer   = setInterval(tick, 1000)
    const poll    = setInterval(checkAndTransition, 10_000)
    return () => { clearInterval(timer); clearInterval(poll) }
  }, [batch.id])

  async function checkAndTransition() {
    if (checking) return
    setChecking(true)
    try {
      const { data } = await supabase.from('batches').select('status').eq('id', batch.id).single()
      if (data?.status === 'active') onExamStarted()
    } finally { setChecking(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <div className="card" style={{ width: '100%', maxWidth: 480, padding: '40px 36px', textAlign: 'center' }}>

        {/* Icon */}
        <div style={{
          width: 56, height: 56,
          borderRadius: '50%',
          background: 'var(--accent-lt)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <ClockIcon />
        </div>

        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.3px' }}>
          {batch.name}
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: 'var(--text-2)' }}>
          Starts at <strong style={{ color: 'var(--text-1)' }}>
            {formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'hh:mm a')} IST
          </strong> · {batch.duration_minutes} min
        </p>

        {/* Countdown */}
        <div style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '20px 24px',
          marginBottom: 28,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 10 }}>
            Exam starts in
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4, fontFamily: 'var(--font-mono)' }}>
            <TimeSegment value={hh} label="HR" />
            <Colon />
            <TimeSegment value={mm} label="MIN" />
            <Colon />
            <TimeSegment value={ss} label="SEC" />
          </div>
        </div>

        {/* Student info */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 20,
          fontSize: 13, color: 'var(--text-2)',
          borderTop: '1px solid var(--border)', paddingTop: 20, marginBottom: 16,
        }}>
          <div><span style={{ color: 'var(--text-3)' }}>Roll No </span><strong style={{ color: 'var(--text-1)' }}>{rollNumber}</strong></div>
          <div><span style={{ color: 'var(--text-3)' }}>Name </span><strong style={{ color: 'var(--text-1)' }}>{studentName}</strong></div>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
          This page auto-advances when the exam begins. Keep this tab open.
        </p>
      </div>
    </div>
  )
}

function TimeSegment({ value, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 44, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1, letterSpacing: '-.02em' }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', color: 'var(--text-3)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function Colon() {
  return <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-3)', lineHeight: 1, paddingBottom: 14, paddingLeft: 2, paddingRight: 2 }}>:</div>
}

function ClockIcon() {
  return (
    <svg width="24" height="24" fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
