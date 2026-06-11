import { useState, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'
import { Spinner } from '../shared/Spinner'

/**
 * CertificatesPanel — issue and print certificates for a batch.
 * Printing: window.print() with print CSS — each certificate is an
 * A4-landscape page with a QR pointing to /verify?c=CODE.
 */
export function CertificatesPanel({ batch, canManage = true, onBack }) {
  const [certs, setCerts] = useState(null)
  const [qrs, setQrs] = useState({}) // code → dataURL
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('certificates').select('*')
      .eq('batch_id', batch.id)
      .order('roll_number')
    if (err) { setError(formatDbError(err, 'Failed to load certificates.')); return }
    setCerts(data ?? [])
    // Generate QR data-URLs (small, local, no network)
    const map = {}
    for (const c of data ?? []) {
      map[c.certificate_code] = await QRCode.toDataURL(
        `${window.location.origin}/verify?c=${c.certificate_code}`,
        { width: 120, margin: 1 }
      )
    }
    setQrs(map)
  }, [batch.id])

  useEffect(() => { load() }, [load])

  async function handleIssue() {
    setIssuing(true)
    setError(null)
    setNotice(null)
    try {
      const { data, error: err } = await supabase.rpc('issue_certificates', { p_batch_id: batch.id })
      if (err) throw err
      setNotice(data > 0
        ? `Issued ${data} new certificate${data !== 1 ? 's' : ''}.`
        : 'No new certificates to issue — all eligible students already have one.')
      load()
    } catch (err) {
      setError(formatDbError(err, 'Issuing failed.'))
    } finally {
      setIssuing(false)
    }
  }

  async function handleRevoke(c) {
    const reason = window.prompt(`Revoke certificate for ${c.student_name} (${c.certificate_code})?\nThis marks it invalid on the public verification page.\n\nReason (optional):`, '')
    if (reason === null) return // cancelled
    setError(null); setNotice(null)
    const { error: err } = await supabase.rpc('revoke_certificate', { p_certificate_id: c.id, p_reason: reason || null })
    if (err) setError(formatDbError(err, 'Revoke failed.'))
    else { setNotice(`Revoked ${c.certificate_code}.`); load() }
  }

  async function handleRestore(c) {
    setError(null); setNotice(null)
    const { error: err } = await supabase.rpc('restore_certificate', { p_certificate_id: c.id })
    if (err) setError(formatDbError(err, 'Restore failed.'))
    else { setNotice(`Restored ${c.certificate_code}.`); load() }
  }

  if (!certs && !error) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={26} color="var(--accent)" /></div>
  }

  return (
    <div>
      <div className="no-print">
        <button onClick={onBack} style={backBtn}>← Back to results</button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>{batch.name} — Certificates</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
              {certs?.length ?? 0} issued
              {batch.pass_percentage != null ? ` · pass mark ${batch.pass_percentage}% (only passing students are certified)` : ' · all submitted students eligible'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {canManage && (
              <button onClick={handleIssue} disabled={issuing} className="btn btn-primary" style={{ padding: '10px 18px' }}>
                {issuing ? <><Spinner size={14} /> Issuing…</> : 'Issue certificates'}
              </button>
            )}
            {certs?.length > 0 && (
              <button onClick={() => window.print()} className="btn btn-secondary" style={{ padding: '10px 18px' }}>
                Print all
              </button>
            )}
          </div>
        </div>

        {notice && <div role="status" style={{ ...banner, background: 'var(--success-lt)', color: 'var(--success)' }}>{notice}</div>}
        {error && <div role="alert" style={{ ...banner, background: 'var(--error-lt)', color: 'var(--error)' }}>{error}</div>}
      </div>

      {/* Certificates — on screen a list, on print one A4 page each */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {certs?.map(c => (
          <div key={c.id} className="card certificate-page" style={{
            padding: '36px 44px', border: '3px double var(--accent)',
            pageBreakAfter: 'always', position: 'relative',
            opacity: c.revoked ? 0.5 : 1,
          }}>
            {/* Revoke / restore (examiner+; never printed) */}
            {canManage && (
              <div className="no-print" style={{ position: 'absolute', top: 10, right: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                {c.revoked && <span style={{ color: 'var(--error)', fontWeight: 700, fontSize: 12 }}>REVOKED</span>}
                <button
                  onClick={() => c.revoked ? handleRestore(c) : handleRevoke(c)}
                  className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 11, color: c.revoked ? 'var(--success)' : 'var(--error)' }}
                >
                  {c.revoked ? 'Restore' : 'Revoke'}
                </button>
              </div>
            )}
            {c.revoked && !canManage && (
              <div className="no-print" style={{ position: 'absolute', top: 10, right: 14, color: 'var(--error)', fontWeight: 700, fontSize: 12 }}>REVOKED</div>
            )}
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <img src="/logo.png" alt="" style={{ width: 54, height: 54, borderRadius: '50%' }} />
              <h3 style={{ margin: '10px 0 2px', fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.3px' }}>
                Certificate of {c.passed && batch.pass_percentage != null ? 'Achievement' : 'Participation'}
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', letterSpacing: '.12em', textTransform: 'uppercase' }}>BharatVidya Examinations</p>
            </div>
            <p style={{ textAlign: 'center', margin: '0 0 6px', fontSize: 13, color: 'var(--text-2)' }}>This certifies that</p>
            <p style={{ textAlign: 'center', margin: '0 0 6px', fontSize: 26, fontWeight: 700, color: 'var(--accent-deep)' }}>{c.student_name}</p>
            <p style={{ textAlign: 'center', margin: '0 0 18px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
              (Roll No. {c.roll_number}) has {c.passed && batch.pass_percentage != null ? 'successfully passed' : 'completed'}<br />
              <strong style={{ color: 'var(--text-1)', fontSize: 15 }}>{c.exam_name}</strong>
              {c.percentage != null && <> with a score of <strong style={{ color: 'var(--text-1)' }}>{c.percentage}%</strong></>}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
                Issued {new Date(c.issued_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}<br />
                Code: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{c.certificate_code}</span><br />
                Verify at {window.location.origin}/verify
              </div>
              {qrs[c.certificate_code] && (
                <img src={qrs[c.certificate_code]} alt={`Verification QR for ${c.certificate_code}`} style={{ width: 88, height: 88 }} />
              )}
            </div>
          </div>
        ))}
      </div>

      {certs?.length === 0 && (
        <div className="card no-print" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
          No certificates issued yet. "Issue certificates" creates one per eligible student (latest submitted attempt).
        </div>
      )}
    </div>
  )
}

const backBtn = {
  all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16,
}
const banner = { padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14, border: '1px solid var(--border)' }
