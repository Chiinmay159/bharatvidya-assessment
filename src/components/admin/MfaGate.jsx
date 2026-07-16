import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

/* MFA gate for the admin portal (migration 027: is_admin() requires aal2).
   mode 'enroll' — admin with no TOTP factor yet: show QR, verify first code.
   mode 'verify' — factor already enrolled: verify a code to reach aal2. */
export function MfaGate({ mode, onVerified, onSignOut }) {
  const [qr, setQr]             = useState(null)
  const [secret, setSecret]     = useState(null)
  const [factorId, setFactorId] = useState(null)
  const [code, setCode]         = useState('')
  const [error, setError]       = useState(null)
  const [busy, setBusy]         = useState(false)
  const [loading, setLoading]   = useState(true)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    async function start() {
      try {
        if (mode === 'enroll') {
          // Clear any abandoned unverified factor from a previous attempt —
          // enroll() rejects duplicates otherwise.
          const { data: factors } = await supabase.auth.mfa.listFactors()
          for (const f of factors?.all ?? []) {
            if (f.factor_type === 'totp' && f.status === 'unverified') {
              await supabase.auth.mfa.unenroll({ factorId: f.id })
            }
          }
          const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: 'Authenticator app',
          })
          if (enrollErr) throw enrollErr
          setQr(data.totp.qr_code)
          setSecret(data.totp.secret)
          setFactorId(data.id)
        } else {
          const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors()
          if (listErr) throw listErr
          const totp = factors?.totp?.[0]
          if (!totp) throw new Error('No authenticator is registered for this account. Contact your administrator.')
          setFactorId(totp.id)
        }
      } catch (e) {
        setError(e.message)
      }
      setLoading(false)
    }
    start()
  }, [mode])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!factorId) return
    setBusy(true)
    setError(null)
    // A challenge is single-use, so issue a fresh one per attempt.
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
    if (chErr) {
      setError(chErr.message)
      setBusy(false)
      return
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    })
    if (vErr) {
      setError('That code didn’t match. Enter the current code from your authenticator app.')
      setBusy(false)
      return
    }
    onVerified()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gradient-hero)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card u-slide-up" style={{ width: '100%', maxWidth: 380, padding: '40px 36px', textAlign: 'center', boxShadow: 'var(--shadow-xl)', borderTop: '3px solid var(--accent)' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.35px' }}>
          {mode === 'enroll' ? 'Set up two-factor authentication' : 'Two-factor authentication'}
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
          {mode === 'enroll'
            ? 'Admin accounts require an authenticator app. Scan the code below with Google Authenticator, 1Password, or any TOTP app, then enter the 6-digit code it shows.'
            : 'Enter the 6-digit code from your authenticator app to continue.'}
        </p>

        {error && (
          <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16, textAlign: 'left', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '20px 0' }}>Loading…</div>
        ) : (
          <>
            {mode === 'enroll' && qr && (
              <div style={{ marginBottom: 20 }}>
                <img src={qr} alt="TOTP enrollment QR code" style={{ width: 168, height: 168, margin: '0 auto 10px', display: 'block', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#fff', padding: 8 }} />
                {secret && (
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
                    Can’t scan? Enter this key manually:<br />
                    <code style={{ fontSize: 11, userSelect: 'all', wordBreak: 'break-all' }}>{secret}</code>
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*"
                maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code" required autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '11px 14px', fontSize: 18,
                  textAlign: 'center', letterSpacing: '.35em',
                  border: '1.5px solid var(--border-md)', borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit',
                }}
              />
              <button type="submit" disabled={busy || code.length !== 6 || !factorId} className="btn btn-primary btn-block" style={{ padding: '11px 16px' }}>
                {busy ? 'Verifying…' : mode === 'enroll' ? 'Activate & sign in' : 'Verify'}
              </button>
            </form>
          </>
        )}

        <button
          onClick={onSignOut}
          style={{ all: 'unset', cursor: 'pointer', marginTop: 20, fontSize: 12, color: 'var(--text-3)', textDecoration: 'underline' }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
