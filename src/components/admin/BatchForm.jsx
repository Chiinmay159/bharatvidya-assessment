import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { logAuditEvent } from '../../lib/auditLog'
import { format } from 'date-fns'

export function BatchForm({ batch, onSaved, onCancel }) {
  const isEditing = !!batch
  const locked = isEditing && (batch?.status === 'active' || batch?.status === 'completed')

  const [form, setForm] = useState({
    name:                  batch?.name ?? '',
    scheduled_date:        batch?.scheduled_start ? format(new Date(batch.scheduled_start), 'yyyy-MM-dd') : '',
    scheduled_time:        batch?.scheduled_start ? format(new Date(batch.scheduled_start), 'HH:mm') : '',
    duration_minutes:      batch?.duration_minutes ?? '',
    questions_per_student: batch?.questions_per_student ?? '',
    access_code:           batch?.access_code ?? '',          // 2.2
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  function set(field, value) { setForm(p => ({ ...p, [field]: value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const start = new Date(`${form.scheduled_date}T${form.scheduled_time}`)
    if (isNaN(start.getTime())) { setError('Invalid date or time.'); return }
    const dur = parseInt(form.duration_minutes)
    if (!dur || dur <= 0) { setError('Duration must be a positive number.'); return }
    const qps = form.questions_per_student ? parseInt(form.questions_per_student) : null
    if (qps !== null && (!Number.isInteger(qps) || qps <= 0)) { setError('Questions per student must be a positive integer.'); return }

    // 2.2 access code validation: if provided, must be 4-6 alphanumeric chars
    const code = form.access_code.trim().toUpperCase() || null
    if (code && !/^[A-Z0-9]{4,6}$/.test(code)) {
      setError('Access code must be 4–6 alphanumeric characters (letters and numbers only).')
      return
    }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      scheduled_start: start.toISOString(),
      duration_minutes: dur,
      questions_per_student: qps,
      access_code: code,
    }
    const { error: err } = isEditing
      ? await supabase.from('batches').update(payload).eq('id', batch.id)
      : await supabase.from('batches').insert(payload)

    if (err) {
      setError(err.message)
      setSaving(false)
    } else {
      await logAuditEvent({
        action: isEditing ? 'batch_updated' : 'batch_created',
        entity: 'batch',
        entityId: batch?.id,
        details: { name: payload.name },
      })
      onSaved()
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 520 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {locked && (
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '10px 14px', color: '#9A3412', fontSize: 13, lineHeight: 1.5 }}>
            This batch is <strong>{batch?.status}</strong>. Schedule, duration, and access code are locked to prevent mid-exam changes.
          </div>
        )}

        <Field label="Batch Name" required>
          <input value={form.name} onChange={e => set('name', e.target.value)} required
            disabled={locked}
            placeholder="e.g. Batch A – Morning Session"
            style={{ ...inputStyle, ...(locked && lockedStyle) }} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Date" required hint={locked ? 'Locked while exam is active.' : undefined}>
            <input type="date" value={form.scheduled_date} onChange={e => set('scheduled_date', e.target.value)}
              required disabled={locked} style={{ ...inputStyle, ...(locked && lockedStyle) }} />
          </Field>
          <Field label="Time" required hint={locked ? 'Locked while exam is active.' : undefined}>
            <input type="time" value={form.scheduled_time} onChange={e => set('scheduled_time', e.target.value)}
              required disabled={locked} style={{ ...inputStyle, ...(locked && lockedStyle) }} />
          </Field>
        </div>

        <Field label="Duration (minutes)" required hint={locked ? 'Locked while exam is active.' : undefined}>
          <input type="number" min="1" value={form.duration_minutes} onChange={e => set('duration_minutes', e.target.value)}
            required disabled={locked}
            placeholder="e.g. 60" style={{ ...inputStyle, maxWidth: 160, ...(locked && lockedStyle) }} />
        </Field>

        <Field
          label="Questions per student"
          hint={locked ? 'Cannot be changed once exam is active.' : 'Leave blank to give students all questions from the bank.'}
        >
          <input type="number" min="1" value={form.questions_per_student} onChange={e => set('questions_per_student', e.target.value)}
            disabled={locked}
            placeholder="e.g. 50  (leave blank = all)"
            style={{ ...inputStyle, maxWidth: 220, ...(locked && lockedStyle) }} />
        </Field>

        {/* 2.2 Access code */}
        <Field
          label="Access Code (optional)"
          hint={locked ? 'Locked while exam is active.' : '4\u20136 alphanumeric characters. If set, students must enter this to enter the exam.'}
        >
          <input
            type="text"
            value={form.access_code}
            onChange={e => set('access_code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={6}
            disabled={locked}
            placeholder="e.g. ABC123"
            style={{ ...inputStyle, maxWidth: 180, fontFamily: 'var(--font-mono)', letterSpacing: '.1em', ...(locked && lockedStyle) }}
          />
        </Field>

        {error && (
          <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? .6 : 1 }}>
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Batch'}
          </button>
          <button type="button" onClick={onCancel} style={btnSecondary}>Cancel</button>
        </div>

      </div>
    </form>
  )
}

function Field({ label, required, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
        {label}{required && <span style={{ color: 'var(--error)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>{hint}</p>}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '9px 13px',
  border: '1px solid var(--border-md)', borderRadius: 8,
  fontSize: 14, color: 'var(--text-1)', background: 'var(--surface)',
  outline: 'none', fontFamily: 'inherit',
}
const btnPrimary = {
  all: 'unset', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center',
  padding: '9px 18px', borderRadius: 8,
  background: 'var(--accent)', color: '#fff',
  fontSize: 14, fontWeight: 600,
}
const btnSecondary = {
  all: 'unset', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center',
  padding: '9px 18px', borderRadius: 8,
  border: '1px solid var(--border-md)', color: 'var(--text-2)',
  fontSize: 14, fontWeight: 500,
}
const lockedStyle = { opacity: 0.5, cursor: 'not-allowed', background: '#F8FAFC' }
