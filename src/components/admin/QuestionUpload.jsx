import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { parseQuestionsCsv } from '../../lib/csv'

export function QuestionUpload({ batch, onBack }) {
  const [preview, setPreview]           = useState(null)
  const [parseErrors, setParseErrors]   = useState([])
  const [uploading, setUploading]       = useState(false)
  const [uploadError, setUploadError]   = useState(null)
  const [existingCount, setExistingCount] = useState(0)
  const [success, setSuccess]           = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchCount() {
      const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('batch_id', batch.id)
      if (!cancelled) setExistingCount(count ?? 0)
    }
    fetchCount()
    return () => { cancelled = true }
  }, [batch.id])

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setPreview(null); setParseErrors([]); setSuccess(false); setUploadError(null)
    const { questions, errors } = await parseQuestionsCsv(file)
    if (errors.length) setParseErrors(errors)
    else setPreview(questions)
  }

  async function handleUpload() {
    if (!preview?.length) return
    setUploading(true); setUploadError(null)
    try {
      // P2-B: atomic replace via RPC — DELETE + INSERT in one transaction
      const rows = preview.map(q => ({
        question_text:  q.question_text,
        option_a:       q.option_a,
        option_b:       q.option_b,
        option_c:       q.option_c,
        option_d:       q.option_d,
        correct_answer: q.correct_answer,
      }))
      const { error } = await supabase.rpc('replace_questions', {
        p_batch_id:  batch.id,
        p_questions: rows,
      })
      if (error) throw error
      setSuccess(true); setExistingCount(preview.length); setPreview(null)
    } catch (err) { setUploadError(err.message) }
    finally { setUploading(false) }
  }

  const warnBank = batch.questions_per_student && existingCount > 0 && batch.questions_per_student > existingCount
  const warnPreview = preview && batch.questions_per_student && batch.questions_per_student > preview.length

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Back */}
      <button onClick={onBack} style={backBtn}>← Back to batches</button>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>{batch.name}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            Question bank: <strong style={{ color: 'var(--text-1)' }}>{existingCount}</strong> questions uploaded
          </span>
          {batch.questions_per_student && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'var(--accent-lt)', color: 'var(--accent)', border: '1px solid var(--accent-md)' }}>
              {batch.questions_per_student} per student
            </span>
          )}
        </div>
      </div>

      {/* Validation warning */}
      {warnBank && <Alert type="warn" text={`Question bank has ${existingCount} questions but requires ${batch.questions_per_student} per student. Upload more questions or lower the per-student count before scheduling.`} />}

      {/* Success */}
      {success && <Alert type="success" text={`Upload complete — ${existingCount} questions are now in the bank.`} />}

      {/* Upload card */}
      <div className="card" style={{ padding: '24px', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600 }}>Upload CSV file</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
          Required columns: <code style={codeStyle}>question, option_a, option_b, option_c, option_d, correct</code>
          {' · '}Correct column: A / B / C / D (case-insensitive). UTF-8 with Devanagari support.
        </p>
        <input type="file" accept=".csv" onChange={handleFile}
          style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }} />
      </div>

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 8, padding: '16px', marginBottom: 20 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--error)', fontSize: 13 }}>CSV errors — fix these and re-upload:</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {parseErrors.map((e, i) => <li key={i} style={{ fontSize: 12, color: 'var(--error)', marginBottom: 2 }}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{preview.length} questions parsed</span>
            {warnPreview && (
              <span style={{ fontSize: 12, color: 'var(--warn)', background: 'var(--warn-lt)', padding: '3px 8px', borderRadius: 6, border: '1px solid #FDE68A' }}>
                Warning: per-student count ({batch.questions_per_student}) exceeds bank size ({preview.length})
              </span>
            )}
          </div>

          <div className="card" style={{ overflow: 'auto', maxHeight: 300, marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <caption className="sr-only">Question preview</caption>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>
                  {['#', 'Question', 'A', 'B', 'C', 'D', '✓'].map(h => (
                    <th key={h} scope="col" style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((q, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px', color: 'var(--text-3)' }}>{i + 1}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-1)', maxWidth: 220 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.question_text}</div>
                    </td>
                    {[q.option_a, q.option_b, q.option_c, q.option_d].map((opt, oi) => (
                      <td key={oi} style={{ padding: '7px 10px', color: 'var(--text-2)', maxWidth: 100 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt}</div>
                      </td>
                    ))}
                    <td style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--success)' }}>{q.correct_answer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {uploadError && <Alert type="error" text={uploadError} />}

          {existingCount > 0 && (
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--warn)' }}>
              This will replace all {existingCount} existing questions for this batch.
            </p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleUpload} disabled={uploading} style={{ ...btnPrimary, opacity: uploading ? .6 : 1 }}>
              {uploading ? 'Uploading…' : `Confirm Upload (${preview.length} questions)`}
            </button>
            <button onClick={() => setPreview(null)} style={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Alert({ type, text }) {
  const styles = {
    success: { bg: 'var(--success-lt)', border: '#A7F3D0', color: 'var(--success)' },
    warn:    { bg: 'var(--warn-lt)', border: '#FDE68A', color: 'var(--warn)' },
    error:   { bg: 'var(--error-lt)', border: '#FECACA', color: 'var(--error)' },
  }
  const s = styles[type]
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: '10px 14px', color: s.color, fontSize: 13, marginBottom: 16 }}>
      {text}
    </div>
  )
}

const backBtn = { all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }
const codeStyle = { fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }
const btnPrimary = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: '9px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600 }
const btnSecondary = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border-md)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500 }
