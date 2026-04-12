import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'
import { formatDbError } from '../../lib/errors'

export function Registration({ batch, onRegistered, onBack }) {
  const [rollNumber,  setRollNumber]  = useState('')
  const [accessCode,  setAccessCode]  = useState('')
  const [studentName, setStudentName] = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState(null)
  const [rosterEntry, setRosterEntry] = useState(null)
  const [lookingUp,   setLookingUp]   = useState(false)
  const [phase,       setPhase]       = useState('roll') // 'roll' | 'name' | 'ready'

  const hasAccessCode = !!batch.access_code
  const dateStr = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'dd MMMM yyyy')
  const timeStr = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'hh:mm a')

  async function handleRollSubmit(e) {
    e.preventDefault()
    setError(null)
    const roll = rollNumber.trim()
    if (!roll) { setError('Please enter your roll number.'); return }

    if (hasAccessCode) {
      if (!accessCode.trim()) { setError('Please enter the exam access code.'); return }
      if (accessCode.trim().toUpperCase() !== batch.access_code.toUpperCase()) {
        setError('Invalid access code. Please check and try again.')
        return
      }
    }

    setLookingUp(true)
    try {
      const { count, error: countErr } = await supabase
        .from('roster')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', batch.id)

      if (countErr) throw countErr
      const hasRoster = (count ?? 0) > 0

      if (hasRoster) {
        const { data: entry, error: entryErr } = await supabase
          .from('roster')
          .select('student_name, email')
          .eq('batch_id', batch.id)
          .eq('roll_number', roll)
          .maybeSingle()

        if (entryErr) throw entryErr

        if (!entry) {
          setError('You are not registered for this exam. Contact your instructor.')
          setLookingUp(false)
          return
        }

        const { data: existing } = await supabase.rpc('get_my_attempt', {
          p_batch_id: batch.id, p_roll_number: roll,
        })
        if (existing?.length > 0 && existing[0].submitted_at) {
          setError('This roll number has already completed this exam.')
          setLookingUp(false)
          return
        }

        setRosterEntry(entry)
        setPhase('ready')
        onRegistered({ rollNumber: roll, studentName: entry.student_name, email: entry.email })
      } else {
        setRosterEntry(false)
        setPhase('name')
      }
    } catch (err) {
      setError(formatDbError(err, 'Could not verify your details. Please try again.'))
    } finally {
      setLookingUp(false)
    }
  }

  async function handleNameSubmit(e) {
    e.preventDefault()
    setError(null)
    const roll = rollNumber.trim()
    const name = studentName.trim()
    if (!name) { setError('Please enter your full name.'); return }

    setSubmitting(true)
    try {
      const { data: existing } = await supabase.rpc('get_my_attempt', {
        p_batch_id: batch.id, p_roll_number: roll,
      })
      if (existing?.length > 0 && existing[0].submitted_at) {
        setError('This roll number has already completed this exam.')
        setSubmitting(false)
        return
      }
      onRegistered({ rollNumber: roll, studentName: name, email: null })
    } catch (err) {
      setError(formatDbError(err, 'Could not verify your details. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', fontSize: 14, fontWeight: 500, padding: '4px 0' }}>
          <ArrowLeft /> Back
        </button>
      </header>

      {/* ── Body ──────────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px 60px' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* Batch info pill */}
          <div style={{ background: 'var(--accent-lt)', border: '1px solid var(--accent-md)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 28 }}>
            <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14, marginBottom: 2, letterSpacing: '-.1px' }}>{batch.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{dateStr} · {timeStr} IST · {batch.duration_minutes} min</div>
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <StepDot n={1} active={phase === 'roll'} done={phase !== 'roll'} />
            <div style={{ flex: 1, height: 2, borderRadius: 1, background: phase !== 'roll' ? 'var(--accent)' : 'var(--border)', transition: 'background .3s ease' }} />
            <StepDot n={2} active={phase === 'name'} done={phase === 'ready'} />
          </div>

          {/* Phase 1 — Roll number */}
          {phase === 'roll' && (
            <div className="card u-slide-up" style={{ padding: '28px 28px 24px' }}>
              <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.3px' }}>
                Verify your roll number
              </h1>
              <p style={{ margin: '0 0 24px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55 }}>
                Enter the roll number assigned to you by your institution.
              </p>

              <form onSubmit={handleRollSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field label="Roll Number" required>
                  <input
                    type="text" value={rollNumber}
                    onChange={e => setRollNumber(e.target.value)}
                    required autoFocus placeholder="e.g. 2023001"
                    className="form-input"
                  />
                </Field>

                {hasAccessCode && (
                  <Field label="Access Code" required hint="Provided by your instructor">
                    <input
                      type="text" value={accessCode}
                      onChange={e => setAccessCode(e.target.value.toUpperCase())}
                      required placeholder="4–6 character code"
                      className="form-input"
                      style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.08em', fontSize: 16 }}
                    />
                  </Field>
                )}

                {error && <ErrorBanner>{error}</ErrorBanner>}

                <button
                  type="submit"
                  disabled={lookingUp}
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 4 }}
                >
                  {lookingUp ? <><Spinner size={15} /> Checking…</> : 'Continue →'}
                </button>
              </form>
            </div>
          )}

          {/* Phase 2 — Name entry (no roster) */}
          {phase === 'name' && (
            <div className="card u-slide-up" style={{ padding: '28px 28px 24px' }}>
              <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.3px' }}>
                Enter your name
              </h1>
              <p style={{ margin: '0 0 24px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55 }}>
                Roll <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>{rollNumber}</span> — please enter your full name as it appears on your ID.
              </p>

              <form onSubmit={handleNameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field label="Full Name" required>
                  <input
                    type="text" value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                    required autoFocus placeholder="As on your ID card"
                    className="form-input"
                  />
                </Field>

                {error && <ErrorBanner>{error}</ErrorBanner>}

                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button type="button" onClick={() => { setPhase('roll'); setError(null) }} className="btn btn-secondary" style={{ padding: '11px 16px' }}>
                    ← Back
                  </button>
                  <button type="submit" disabled={submitting} className="btn btn-primary btn-block" style={{ flex: 1 }}>
                    {submitting ? <><Spinner size={15} /> Checking…</> : 'Enter Exam →'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────── */
function StepDot({ n, active, done }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700,
      background: done ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--surface-2)',
      border: `2px solid ${active || done ? 'var(--accent)' : 'var(--border-md)'}`,
      color: active || done ? '#fff' : 'var(--text-3)',
      transition: 'all .25s ease',
    }}>
      {done ? '✓' : n}
    </div>
  )
}

function Field({ label, required, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
          {label}{required && <span style={{ color: 'var(--error)', marginLeft: 2 }}>*</span>}
        </label>
        {hint && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function ErrorBanner({ children }) {
  return (
    <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--error)', fontSize: 13, lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

function ArrowLeft() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0l7-7m-7 7l7 7" />
    </svg>
  )
}

function Spinner({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="u-spin" style={{ display: 'block' }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
    </svg>
  )
}
