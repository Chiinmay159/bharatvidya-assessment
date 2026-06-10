import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/shared/Spinner'

/**
 * VerifyPage — public certificate verification (route: /verify?c=CODE).
 * The QR on every issued certificate points here. No auth required;
 * shows only certificate-face fields (server-controlled).
 */
export function VerifyPage() {
  const [params, setParams] = useSearchParams()
  const [code, setCode] = useState(params.get('c') ?? '')
  const [state, setState] = useState('idle') // idle | checking | done
  const [result, setResult] = useState(null) // null = not found

  const check = useCallback(async (c) => {
    if (!c.trim()) return
    setState('checking')
    const { data } = await supabase.rpc('verify_certificate', { p_code: c })
    setResult(Array.isArray(data) && data.length > 0 ? data[0] : null)
    setState('done')
  }, [])

  // Auto-verify when arriving via QR link (deferred a tick so the
  // initial render commits before any state updates)
  useEffect(() => {
    const c = params.get('c')
    if (!c) return
    const t = setTimeout(() => check(c), 0)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e) {
    e.preventDefault()
    setParams(code.trim() ? { c: code.trim().toUpperCase() } : {})
    check(code)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', justifyContent: 'center', padding: '48px 20px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div className="card" style={{ padding: '32px 28px', textAlign: 'center' }}>
          <img src="/logo.png" alt="BharatVidya" style={{ width: 48, height: 48, borderRadius: '50%', margin: '0 auto 14px' }} />
          <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>
            Certificate Verification
          </h1>
          <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--text-3)' }}>
            BharatVidya Exams · Enter the code printed on the certificate
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="BV-XXXX-XXXX-XXXX"
              aria-label="Certificate code"
              style={{
                flex: 1, padding: '11px 14px', fontSize: 14, fontFamily: 'var(--font-mono)',
                border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)', color: 'var(--text-1)', letterSpacing: '.05em',
              }}
            />
            <button type="submit" disabled={state === 'checking' || !code.trim()} className="btn btn-primary" style={{ padding: '11px 20px' }}>
              {state === 'checking' ? <Spinner size={14} /> : 'Verify'}
            </button>
          </form>

          {state === 'done' && result && !result.revoked && (
            <div role="status" style={{ background: 'var(--success-lt)', border: '2px solid var(--success)', borderRadius: 'var(--radius-md)', padding: '22px 20px', textAlign: 'left' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--success)', marginBottom: 12 }}>✓ Valid certificate</div>
              <Row label="Awarded to" value={result.student_name} />
              <Row label="Examination" value={result.exam_name} />
              {result.percentage != null && <Row label="Score" value={`${result.percentage}%`} />}
              <Row label="Issued" value={new Date(result.issued_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} />
            </div>
          )}

          {state === 'done' && result?.revoked && (
            <div role="alert" style={{ background: 'var(--error-lt)', border: '2px solid var(--error)', borderRadius: 'var(--radius-md)', padding: '20px', color: 'var(--error)', fontSize: 14, fontWeight: 600 }}>
              ✕ This certificate has been revoked.
            </div>
          )}

          {state === 'done' && !result && (
            <div role="alert" style={{ background: 'var(--error-lt)', border: '2px solid var(--error)', borderRadius: 'var(--radius-md)', padding: '20px', color: 'var(--error)', fontSize: 14, fontWeight: 600 }}>
              ✕ No certificate found for this code. Check the code and try again.
            </div>
          )}
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)', marginTop: 14 }}>
          Certificates are issued and verified by BharatVidya. Questions? Contact the issuing institution.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{label}</span>
      <strong style={{ color: 'var(--text-1)', textAlign: 'right' }}>{value}</strong>
    </div>
  )
}
