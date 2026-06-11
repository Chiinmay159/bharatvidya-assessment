import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'
import { formatDbError } from '../../lib/errors'
import { Spinner } from '../shared/Spinner'
import { BackButton } from '../shared/BackButton'
import { Field } from '../shared/Field'

export function Registration({ batch, onRegistered, onBack }) {
  const [rollNumber,  setRollNumber]  = useState('')
  const [email,       setEmail]       = useState('')
  // Exam code carried from the /exam gate — re-verified server-side anyway
  const [accessCode,  setAccessCode]  = useState(batch.enteredCode ?? '')
  const [studentName, setStudentName] = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState(null)
  const [lookingUp,   setLookingUp]   = useState(false)
  const [phase,       setPhase]       = useState('roll') // 'roll' | 'name' | 'ready'
  const codeFromGate = Boolean(batch.enteredCode)

  const dateStr = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'dd MMMM yyyy')
  const timeStr = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'hh:mm a')

  async function handleRollSubmit(e) {
    e.preventDefault()
    setError(null)
    const roll = rollNumber.trim()
    const mail = email.trim()
    if (!roll) { setError('Please enter your roll number.'); return }
    if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError('Please enter a valid email address.')
      return
    }

    setLookingUp(true)

    // Always verify access code server-side (even when field is empty —
    // the server tells us whether a code is required for this batch)
    try {
      const { data: codeCheck, error: codeErr } = await supabase.rpc('verify_access_code', {
        p_batch_id: batch.id, p_access_code: accessCode.trim(),
      })
      if (codeErr) throw codeErr
      const codeResult = codeCheck?.[0]
      if (codeResult?.required && !codeResult?.valid) {
        setError(
          accessCode.trim()
            ? 'Invalid access code. Please check and try again.'
            : 'This exam requires an access code. Please enter the code provided by your instructor.'
        )
        setLookingUp(false)
        return
      }
    } catch {
      // If access-code verification fails, block entry rather than allowing bypass
      setError('Could not verify access. Please check your connection and try again.')
      setLookingUp(false)
      return
    }
    try {
      // Identity check: roll + email must BOTH match the roster row.
      // On mismatch the server reveals nothing — not even whether the
      // roll exists (no name-harvesting oracle).
      const { data: identCheck, error: identErr } = await supabase.rpc('verify_roster_identity', {
        p_batch_id: batch.id, p_roll_number: roll, p_email: mail,
      })
      if (identErr) throw identErr
      const ident = identCheck?.[0]

      if (ident?.has_roster) {
        if (!ident.matched) {
          setError('These details don’t match our records for this exam. Check your roll number and email, or contact your instructor.')
          setLookingUp(false)
          return
        }

        // Matched — proceed under the roster identity
        const { data: existing } = await supabase.rpc('get_my_attempt', {
          p_batch_id: batch.id, p_roll_number: roll, p_email: mail,
        })
        if (existing?.length > 0 && existing[0].submitted_at) {
          setError('This roll number has already completed this exam.')
          setLookingUp(false)
          return
        }

        setPhase('ready')
        onRegistered({ rollNumber: roll, studentName: ident.student_name, email: ident.email, accessCode: accessCode.trim() || null })
      } else {
        // No roster on this batch — collect the name (email already captured)
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
    const mail = email.trim()
    if (!name) { setError('Please enter your full name.'); return }

    setSubmitting(true)
    try {
      // Scope the lookup to this student's verified email
      const { data: existing } = await supabase.rpc('get_my_attempt', {
        p_batch_id: batch.id, p_roll_number: roll, p_email: mail,
      })
      if (existing?.length > 0 && existing[0].submitted_at) {
        setError('This roll number has already completed this exam.')
        setSubmitting(false)
        return
      }
      onRegistered({ rollNumber: roll, studentName: name, email: email.trim() || null, accessCode: accessCode.trim() || null })
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
        <BackButton onClick={onBack} />
      </header>

      {/* ── Body ──────────────────────────────────────────── */}
      <main id="main-content" tabIndex={-1} style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px 60px', outline: 'none' }}>
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
            <div className="card card-heritage u-slide-up" style={{ padding: '28px 28px 24px' }}>
              <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.3px' }}>
                Verify your identity
              </h1>
              <p style={{ margin: '0 0 24px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55 }}>
                Enter the roll number and email your institution registered for you.
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

                <Field label="Email" required hint="The one your institution has on record">
                  <input
                    type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    required placeholder="you@example.com"
                    autoComplete="email"
                    className="form-input"
                  />
                </Field>

                {!codeFromGate && (
                  <Field label="Exam Code" hint="The code shared by your institution">
                    <input
                      type="text" value={accessCode}
                      onChange={e => setAccessCode(e.target.value.toUpperCase())}
                      placeholder="6-character code"
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
            <div className="card card-heritage u-slide-up" style={{ padding: '28px 28px 24px' }}>
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

function ErrorBanner({ children }) {
  return (
    <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--error)', fontSize: 13, lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

