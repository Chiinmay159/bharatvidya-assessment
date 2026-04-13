import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'

export function WaitingRoom({ batch, rollNumber, studentName, onExamStarted }) {
  const [hh, setHh] = useState('--')
  const [mm, setMm] = useState('--')
  const [ss, setSs] = useState('--')
  const checkingRef = useRef(false)

  // Server time sync — same monotonic pattern as useTimer
  const baselinePerfRef = useRef(null)
  const baselineServerMsRef = useRef(null)

  const checkAndTransition = useCallback(async () => {
    if (checkingRef.current) return
    checkingRef.current = true
    try {
      const { data } = await supabase.from('batches').select('status').eq('id', batch.id).single()
      if (data?.status === 'active') onExamStarted()
    } finally { checkingRef.current = false }
  }, [batch.id, onExamStarted])

  // Fetch server time once and establish monotonic baseline
  useEffect(() => {
    let cancelled = false
    async function syncServerTime() {
      try {
        const t1 = performance.now()
        const { data, error } = await supabase.rpc('get_server_time')
        const t2 = performance.now()
        if (cancelled) return
        if (error || !data) throw new Error('Server time unavailable')
        const rtt = t2 - t1
        const serverMs = new Date(data).getTime()
        const estimatedServerNow = serverMs + rtt / 2
        baselinePerfRef.current = t2
        baselineServerMsRef.current = estimatedServerNow
      } catch {
        if (!cancelled) {
          // Fallback: use wall clock
          baselinePerfRef.current = performance.now()
          baselineServerMsRef.current = Date.now()
        }
      }
    }
    syncServerTime()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const startTime = new Date(batch.scheduled_start).getTime()

    const tick = () => {
      // Use monotonic server-synced time if available, else wall clock
      const now = baselinePerfRef.current != null
        ? baselineServerMsRef.current + (performance.now() - baselinePerfRef.current)
        : Date.now()
      const diff = startTime - now
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
    const timer = setInterval(tick, 1000)
    const poll  = setInterval(checkAndTransition, 10_000)
    return () => { clearInterval(timer); clearInterval(poll) }
  }, [batch.id, batch.scheduled_start, checkAndTransition])

  const timeStr = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'hh:mm a')

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px',
    }}>
      <div className="card u-slide-up" style={{ width: '100%', maxWidth: 460, padding: '40px 32px 32px', textAlign: 'center' }}>

        {/* Clock icon with breathing animation */}
        <div
          className="u-breathe"
          style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'var(--accent-lt)', border: '2px solid var(--accent-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 22px',
          }}
        >
          <ClockIcon />
        </div>

        <h1 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.25px' }}>
          {batch.name}
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: 'var(--text-2)' }}>
          Starts at <strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>{timeStr} IST</strong>
          <span style={{ color: 'var(--text-3)', margin: '0 6px' }}>·</span>
          {batch.duration_minutes} min
        </p>

        {/* Countdown */}
        <div style={{
          background: 'var(--gradient-hero)',
          borderRadius: 'var(--radius-md)',
          padding: '22px 20px',
          marginBottom: 28,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', marginBottom: 12 }}>
            Exam starts in
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 4, fontFamily: 'var(--font-mono)' }}>
            <TimeUnit value={hh} label="HR" />
            <Colon />
            <TimeUnit value={mm} label="MIN" />
            <Colon />
            <TimeUnit value={ss} label="SEC" />
          </div>
        </div>

        {/* Student chip */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 14,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-pill)', padding: '8px 18px',
          fontSize: 13, color: 'var(--text-2)', marginBottom: 16,
        }}>
          <span><span style={{ color: 'var(--text-3)' }}>Roll </span><strong style={{ color: 'var(--text-1)' }}>{rollNumber}</strong></span>
          <span style={{ width: 1, height: 12, background: 'var(--border-md)' }} />
          <strong style={{ color: 'var(--text-1)' }}>{studentName}</strong>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
          This page auto-advances when the exam begins.<br />Keep this tab open and your device on.
        </p>
      </div>
    </div>
  )
}

function TimeUnit({ value, label }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 64 }}>
      <div style={{ fontSize: 52, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '-.03em' }}>
        {value}
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.14em', color: 'rgba(255,255,255,.45)', marginTop: 6, textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  )
}

function Colon() {
  return (
    <div style={{ fontSize: 40, fontWeight: 700, color: 'rgba(255,255,255,.35)', lineHeight: 1, paddingBottom: 18, paddingLeft: 2, paddingRight: 2 }}>
      :
    </div>
  )
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
