import { useState } from 'react'
import Papa from 'papaparse'
import { fromZonedTime } from 'date-fns-tz'
import { supabase } from '../../lib/supabase'
import { logAuditEvent } from '../../lib/auditLog'

/**
 * 3.4 Bulk Batch Creation
 * CSV format: batch_name,scheduled_start,duration_minutes,questions_per_student,access_code
 * Example:    "Batch A","2026-04-15 10:00",30,25,ABC123
 */
export function BulkBatchCreate({ onBack, onCreated }) {
  const [pending,   setPending]   = useState(null)  // parsed rows
  const [creating,  setCreating]  = useState(false)
  const [error,     setError]     = useState(null)
  const [success,   setSuccess]   = useState(null)

  function downloadTemplate() {
    const csv = [
      'batch_name,scheduled_start,duration_minutes,questions_per_student,access_code',
      '"Batch A","2026-04-15 10:00",30,25,ABC123',
      '"Batch B","2026-04-15 14:00",30,25,XYZ789',
    ].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'bulk_batches_template.csv'
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null); setSuccess(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      transformHeader: h => h.trim().toLowerCase(),
      complete(results) {
        const headers = results.meta.fields || []
        const required = ['batch_name', 'scheduled_start', 'duration_minutes']
        const missing = required.filter(h => !headers.includes(h))
        if (missing.length) { setError(`Missing columns: ${missing.join(', ')}`); return }

        const rows = []
        const errs = []
        results.data.forEach((row, i) => {
          const name  = (row.batch_name || '').trim()
          const start = (row.scheduled_start || '').trim()
          const dur   = parseInt(row.duration_minutes || '')
          const qps   = row.questions_per_student ? parseInt(row.questions_per_student) : null
          const code  = (row.access_code || '').trim() || null

          if (!name)                  { errs.push(`Row ${i + 2}: missing batch name`); return }
          if (!start)                 { errs.push(`Row ${i + 2}: missing scheduled_start`); return }
          if (isNaN(dur) || dur <= 0) { errs.push(`Row ${i + 2}: invalid duration`); return }

          // Treat CSV dates as IST (Asia/Kolkata)
          const parsedStart = fromZonedTime(start, 'Asia/Kolkata')
          if (isNaN(parsedStart.getTime())) { errs.push(`Row ${i + 2}: invalid date "${start}"`); return }

          rows.push({
            name,
            scheduled_start: parsedStart.toISOString(),
            duration_minutes: dur,
            questions_per_student: (qps && qps > 0) ? qps : null,
            access_code: code,
            status: 'draft',
          })
        })

        if (errs.length) {
          setError(errs.slice(0, 5).join('. ') + (errs.length > 5 ? ` (+${errs.length - 5} more)` : ''))
          return
        }
        if (!rows.length) { setError('No valid rows found.'); return }
        setPending(rows)
      },
    })
    e.target.value = ''
  }

  async function confirmCreate() {
    if (!pending) return
    setCreating(true); setError(null)
    try {
      const { data, error: err } = await supabase.from('batches').insert(pending).select('id')
      if (err) throw err
      await logAuditEvent({
        action: 'bulk_batches_created', entity: 'batch',
        details: { count: pending.length, ids: data.map(d => d.id) },
      })
      setSuccess(`${pending.length} batches created in draft status.`)
      setPending(null)
      setTimeout(() => onCreated?.(), 1500)
    } catch (err) {
      setError(err.message || 'Creation failed. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <button onClick={onBack} style={backBtn}>← Back to batches</button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>Bulk Create Batches</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>Upload a CSV to create multiple batches at once (all created in draft status)</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={downloadTemplate} style={btnSecondary}>↓ Download Template</button>
          <label style={{ ...btnPrimary, cursor: 'pointer' }}>
            Upload CSV
            <input type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'var(--success-lt)', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px', color: 'var(--success)', fontSize: 13, marginBottom: 16 }}>
          {success}
        </div>
      )}

      {/* CSV format reference */}
      {!pending && !success && (
        <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
          <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>CSV Format</p>
          <code style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-2)', padding: '10px 14px', borderRadius: 6, fontFamily: 'var(--font-mono)', lineHeight: 1.7 }}>
            batch_name,scheduled_start,duration_minutes,questions_per_student,access_code<br />
            "Batch A","2026-04-15 10:00",30,25,ABC123<br />
            "Batch B","2026-04-15 14:00",30,,
          </code>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
            <strong>questions_per_student</strong> and <strong>access_code</strong> are optional. Date format: YYYY-MM-DD HH:MM.
          </p>
        </div>
      )}

      {/* Preview */}
      {pending && (
        <div className="card" style={{ padding: '20px 24px', marginBottom: 20, border: '2px solid var(--accent)' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
            Preview — {pending.length} batches
          </h3>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <caption className="sr-only">Bulk batch creation preview</caption>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['Batch Name', 'Scheduled Start', 'Duration', 'Qs/Student', 'Access Code'].map(h => (
                    <th key={h} scope="col" style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 12px', fontWeight: 500 }}>{row.name}</td>
                    <td style={{ padding: '7px 12px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      {new Date(row.scheduled_start).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td style={{ padding: '7px 12px', color: 'var(--text-2)' }}>{row.duration_minutes} min</td>
                    <td style={{ padding: '7px 12px', color: 'var(--text-2)' }}>{row.questions_per_student ?? '—'}</td>
                    <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.access_code ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={confirmCreate} disabled={creating} style={{ ...btnPrimary, opacity: creating ? .6 : 1 }}>
              {creating ? 'Creating…' : `Create ${pending.length} batches`}
            </button>
            <button onClick={() => setPending(null)} disabled={creating} style={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

const backBtn = {
  all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20,
}
const btnPrimary = {
  all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
  padding: '8px 16px', borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
}
const btnSecondary = {
  all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
  padding: '8px 16px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-md)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500,
}
