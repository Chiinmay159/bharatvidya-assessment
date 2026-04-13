import { useState, useEffect, useCallback } from 'react'
import Papa from 'papaparse'
import { supabase } from '../../lib/supabase'
import { logAuditEvent } from '../../lib/auditLog'
import { formatDbError } from '../../lib/errors'

export function RosterUpload({ batch, onBack }) {
  const [roster,    setRoster]    = useState([])
  const [pending,   setPending]   = useState(null)  // parsed rows awaiting confirm
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState(null)
  const [success,   setSuccess]   = useState(null)

  const fetchRoster = useCallback(async () => {
    const { data } = await supabase
      .from('roster')
      .select('id, roll_number, student_name, email')
      .eq('batch_id', batch.id)
      .order('roll_number')
    setRoster(data || [])
  }, [batch.id])

  useEffect(() => { fetchRoster() }, [fetchRoster])

  function downloadTemplate() {
    const csv = 'roll_number,student_name,email\n'
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'roster_template.csv'
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
        const required = ['roll_number', 'student_name', 'email']
        const missing = required.filter(h => !headers.includes(h))
        if (missing.length) { setError(`Missing required columns: ${missing.join(', ')}`); return }

        const rows = []
        const errs = []
        results.data.forEach((row, i) => {
          const roll  = (row.roll_number || '').trim()
          const name  = (row.student_name || '').trim()
          const email = (row.email || '').trim()
          if (!roll || !name || !email) { errs.push(`Row ${i + 2}: missing required data`); return }
          rows.push({ roll_number: roll, student_name: name, email })
        })

        if (errs.length) {
          setError(errs.slice(0, 5).join('. ') + (errs.length > 5 ? ` (+${errs.length - 5} more)` : ''))
          return
        }
        if (!rows.length) { setError('No valid rows found in the file.'); return }
        setPending(rows)
      },
    })
    e.target.value = ''
  }

  async function confirmUpload() {
    if (!pending) return
    setUploading(true); setError(null)
    try {
      const { error: err } = await supabase.rpc('replace_roster', {
        p_batch_id: batch.id,
        p_rows: pending,
      })
      if (err) throw err
      await logAuditEvent({
        action: 'roster_uploaded', entity: 'batch', entityId: batch.id,
        details: { count: pending.length },
      })
      setSuccess(`Roster updated — ${pending.length} students enrolled.`)
      setPending(null)
      await fetchRoster()
    } catch (err) {
      setError(formatDbError(err, 'Upload failed. Please try again.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <button onClick={onBack} style={backBtn}>← Back to batches</button>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>
            {batch.name} — Roster
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>{roster.length} students enrolled</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={downloadTemplate} style={btnSecondary}>↓ Download Template</button>
          <label style={{ ...btnPrimary, cursor: 'pointer' }}>
            Upload Roster CSV
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

      {/* Upload preview */}
      {pending && (
        <div className="card" style={{ padding: '20px 24px', marginBottom: 20, border: '2px solid var(--accent)' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
            Preview — {pending.length} students
          </h3>
          <div style={{ overflowX: 'auto', marginBottom: 16, maxHeight: 280, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <caption className="sr-only">Upload preview</caption>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['Roll Number', 'Name', 'Email'].map(h => (
                    <th key={h} scope="col" style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.roll_number}</td>
                    <td style={{ padding: '7px 12px' }}>{row.student_name}</td>
                    <td style={{ padding: '7px 12px', color: 'var(--text-2)' }}>{row.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={confirmUpload} disabled={uploading} style={{ ...btnPrimary, opacity: uploading ? .6 : 1 }}>
              {uploading ? 'Uploading…' : `Confirm upload (${pending.length} students)`}
            </button>
            <button onClick={() => setPending(null)} disabled={uploading} style={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {/* Current roster */}
      {roster.length > 0 && (
        <div className="card" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <caption className="sr-only">Enrolled students</caption>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {['Roll Number', 'Name', 'Email'].map(h => (
                  <th key={h} scope="col" style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((row, i) => (
                <tr key={row.id} style={{ borderBottom: i < roster.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>{row.roll_number}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text-1)' }}>{row.student_name}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{row.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {roster.length === 0 && !pending && (
        <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text-1)' }}>No roster yet</p>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>
            Download the template, fill in student details, then upload the CSV.
          </p>
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
