import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { logAuditEvent } from '../../lib/auditLog'
import { format } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import { Field } from '../shared/Field'

export function BatchForm({ batch, onSaved, onCancel }) {
  const isEditing = !!batch
  const locked = isEditing && (batch?.status === 'active' || batch?.status === 'completed')

  const [form, setForm] = useState({
    name:                  batch?.name ?? '',
    scheduled_date:        batch?.scheduled_start ? format(new Date(batch.scheduled_start), 'yyyy-MM-dd') : '',
    scheduled_time:        batch?.scheduled_start ? format(new Date(batch.scheduled_start), 'HH:mm') : '',
    duration_minutes:      batch?.duration_minutes ?? '',
    questions_per_student: batch?.questions_per_student ?? '',
    access_code:           batch?.access_code ?? '',
    show_results:          batch?.show_results ?? true,
    pass_percentage:       batch?.pass_percentage ?? '',
    max_attempts:          batch?.max_attempts ?? 1,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  function set(field, value) { setForm(p => ({ ...p, [field]: value })) }

  const hasPassPercentage = form.pass_percentage !== '' && form.pass_percentage !== null

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const start = fromZonedTime(`${form.scheduled_date}T${form.scheduled_time}`, 'Asia/Kolkata')
    if (isNaN(start.getTime())) { setError('Invalid date or time.'); return }
    const dur = parseInt(form.duration_minutes)
    if (!dur || dur <= 0) { setError('Duration must be a positive number.'); return }
    const qps = form.questions_per_student ? parseInt(form.questions_per_student) : null
    if (qps !== null && (!Number.isInteger(qps) || qps <= 0)) { setError('Questions per student must be a positive integer.'); return }

    // Access code validation
    const code = form.access_code.trim().toUpperCase() || null
    if (code && !/^[A-Z0-9]{4,6}$/.test(code)) {
      setError('Access code must be 4–6 alphanumeric characters (letters and numbers only).')
      return
    }

    // Pass percentage validation
    const passPct = form.pass_percentage !== '' && form.pass_percentage !== null
      ? parseInt(form.pass_percentage) : null
    if (passPct !== null && (!Number.isInteger(passPct) || passPct < 1 || passPct > 100)) {
      setError('Passing percentage must be between 1 and 100.')
      return
    }

    // Max attempts validation
    const maxAtt = parseInt(form.max_attempts) || 1
    if (maxAtt < 1) { setError('Max attempts must be at least 1.'); return }
    if (maxAtt > 1 && passPct === null) {
      setError('A passing percentage is required when allowing multiple attempts.')
      return
    }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      scheduled_start: start.toISOString(),
      duration_minutes: dur,
      questions_per_student: qps,
      access_code: code,
      show_results: form.show_results,
      pass_percentage: passPct,
      max_attempts: maxAtt,
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
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 'var(--radius-md)', padding: '10px 14px', color: '#9A3412', fontSize: 13, lineHeight: 1.5 }}>
            This batch is <strong>{batch?.status}</strong>. Most settings are locked to prevent mid-exam changes.
            {batch?.status !== 'completed' && ' You can still toggle result visibility.'}
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

        {/* Access code */}
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

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

        {/* Show Results toggle */}
        <Field
          label="Show results to students"
          hint="When off, students see 'Exam submitted' but not their score. You can toggle this any time."
        >
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <div
              onClick={() => set('show_results', !form.show_results)}
              role="switch"
              aria-checked={form.show_results}
              tabIndex={0}
              onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); set('show_results', !form.show_results) } }}
              style={{
                width: 40, height: 22, borderRadius: 11,
                background: form.show_results ? 'var(--success)' : 'var(--border-md)',
                position: 'relative', cursor: 'pointer',
                transition: 'background .15s ease',
                flexShrink: 0,
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.15)',
                position: 'absolute', top: 2,
                left: form.show_results ? 20 : 2,
                transition: 'left .15s ease',
              }} />
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>
              {form.show_results ? 'Results visible' : 'Results hidden'}
            </span>
          </label>
        </Field>

        {/* Pass Percentage */}
        <Field
          label="Passing percentage (optional)"
          hint={locked ? 'Locked while exam is active.' : 'Leave blank for no pass/fail threshold.'}
        >
          <input
            type="number" min="1" max="100"
            value={form.pass_percentage}
            onChange={e => {
              set('pass_percentage', e.target.value)
              // Reset max_attempts to 1 when clearing pass percentage
              if (!e.target.value) set('max_attempts', 1)
            }}
            disabled={locked}
            placeholder="e.g. 60"
            style={{ ...inputStyle, maxWidth: 160, ...(locked && lockedStyle) }}
          />
        </Field>

        {/* Max Attempts — only visible when pass percentage is set */}
        {hasPassPercentage && (
          <Field
            label="Maximum attempts per student"
            hint={locked ? 'Locked while exam is active.' : 'Students who fail can retry up to this many times (within the exam window). Each retry gives different questions.'}
          >
            <input
              type="number" min="1"
              value={form.max_attempts}
              onChange={e => set('max_attempts', e.target.value)}
              disabled={locked}
              placeholder="1"
              style={{ ...inputStyle, maxWidth: 120, ...(locked && lockedStyle) }}
            />
          </Field>
        )}

        {error && (
          <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 'var(--radius-md)', padding: '10px 14px', color: 'var(--error)', fontSize: 13 }}>
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


const inputStyle = {
  width: '100%', padding: '9px 13px',
  border: '1px solid var(--border-md)', borderRadius: 'var(--radius-md)',
  fontSize: 14, color: 'var(--text-1)', background: 'var(--surface)',
  outline: 'none', fontFamily: 'inherit',
}
const btnPrimary = {
  all: 'unset', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center',
  padding: '9px 18px', borderRadius: 'var(--radius-md)',
  background: 'var(--accent)', color: '#fff',
  fontSize: 14, fontWeight: 600,
}
const btnSecondary = {
  all: 'unset', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center',
  padding: '9px 18px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-md)', color: 'var(--text-2)',
  fontSize: 14, fontWeight: 500,
}
const lockedStyle = { opacity: 0.5, cursor: 'not-allowed', background: '#F8FAFC' }
