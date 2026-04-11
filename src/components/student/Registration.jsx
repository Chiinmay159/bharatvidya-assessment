import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'

export function Registration({ batch, onRegistered, onBack }) {
  const [rollNumber, setRollNumber] = useState('')
  const [studentName, setStudentName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const roll = rollNumber.trim()
    const name = studentName.trim()

    if (!roll || !name) {
      setError('Please enter both roll number and name.')
      setSubmitting(false)
      return
    }

    const { data: existing } = await supabase.rpc('get_my_attempt', {
      p_batch_id: batch.id,
      p_roll_number: roll,
    })

    if (existing?.length > 0 && existing[0].submitted_at) {
      setError('This roll number has already completed this exam.')
      setSubmitting(false)
      return
    }

    onRegistered({ rollNumber: roll, studentName: name })
    setSubmitting(false)
  }

  const dateStr  = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'dd MMMM yyyy')
  const timeStr  = formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'hh:mm a')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <button
          onClick={onBack}
          style={{
            all: 'unset', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--text-2)', fontSize: 14, fontWeight: 500,
            padding: '4px 0',
          }}
        >
          <ArrowLeft /> Back
        </button>
      </header>

      {/* Body */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 20px' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          {/* Batch info card */}
          <div style={{
            background: 'var(--accent-lt)',
            border: '1px solid var(--accent-md)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 18px',
            marginBottom: 24,
          }}>
            <div style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 15, marginBottom: 3 }}>{batch.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {dateStr} · {timeStr} IST · {batch.duration_minutes} min
            </div>
          </div>

          {/* Form card */}
          <div className="card" style={{ padding: '28px 28px 24px' }}>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.3px' }}>
              Enter your details
            </h1>
            <p style={{ margin: '0 0 24px', color: 'var(--text-2)', fontSize: 14 }}>
              Your identity is verified by roll number — enter it exactly as assigned.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Roll Number" required>
                <input
                  type="text"
                  value={rollNumber}
                  onChange={e => setRollNumber(e.target.value)}
                  required
                  autoFocus
                  placeholder="e.g. 2023001"
                  style={inputStyle}
                />
              </Field>

              <Field label="Full Name" required>
                <input
                  type="text"
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  required
                  placeholder="As on your ID card"
                  style={inputStyle}
                />
              </Field>

              {error && (
                <div style={{
                  background: 'var(--error-lt)', border: '1px solid #FECACA',
                  borderRadius: 'var(--radius-sm)', padding: '10px 14px',
                  color: 'var(--error)', fontSize: 13,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  ...btnPrimary,
                  marginTop: 4,
                  opacity: submitting ? .6 : 1,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Checking…' : 'Enter Exam →'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}

/* ── Shared sub-components ─── */
function Field({ label, required, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
        {label}{required && <span style={{ color: 'var(--error)', marginLeft: 2 }}>*</span>}
      </label>
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

const inputStyle = {
  width: '100%', padding: '10px 14px',
  border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)',
  fontSize: 15, color: 'var(--text-1)', background: 'var(--surface)',
  outline: 'none', fontFamily: 'inherit',
}

const btnPrimary = {
  all: 'unset',
  display: 'block', width: '100%', textAlign: 'center',
  padding: '11px 20px',
  background: 'var(--accent)', color: '#fff',
  borderRadius: 'var(--radius-sm)',
  fontSize: 15, fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: '-.1px',
}
