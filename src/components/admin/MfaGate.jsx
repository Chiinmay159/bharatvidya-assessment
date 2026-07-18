import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { enrollmentName } from '../../lib/mfa'

/* MFA gate for the admin portal (migration 027: is_admin() requires aal2).
   mode 'enroll' — admin with no verified TOTP factor yet: show QR, verify first code.
   mode 'verify' — factor already enrolled: verify a code to reach aal2.

   A pending enrollment survives reloads: the enroll() response (the only time
   Supabase reveals the QR/secret) is cached in sessionStorage and reused while
   the factor it belongs to still exists server-side. A QR the user scanned
   stays valid across remounts — a new secret is minted only on explicit
   "Start over". The secret was already displayed to this browser tab, so the
   per-tab cache adds no exposure beyond the screen itself. */

const PENDING_KEY = 'bv-mfa-pending-enrollment'

function readPending(userId) {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING_KEY))
    return p?.userId === userId && p?.factorId && p?.qr ? p : null
  } catch { return null }
}
function writePending(p) { try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(p)) } catch { /* private mode */ } }
function clearPending() { try { sessionStorage.removeItem(PENDING_KEY) } catch { /* ignore */ } }

export function MfaGate({ mode, userEmail, onVerified, onSignOut }) {
  const [qr, setQr]             = useState(null)
  const [otpUri, setOtpUri]     = useState(null)
  const [secret, setSecret]     = useState(null)
  const [factorId, setFactorId] = useState(null)
  const [code, setCode]         = useState('')
  const [error, setError]       = useState(null)
  const [busy, setBusy]         = useState(false)
  const [loading, setLoading]   = useState(true)
  const started = useRef(false)

  const startEnroll = useCallback(async ({ reuse }) => {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors()
    if (listErr) throw listErr
    const unverified = (factors?.all ?? []).filter(f => f.factor_type === 'totp' && f.status === 'unverified')

    if (reuse) {
      const cached = readPending(userId)
      if (cached && unverified.some(f => f.id === cached.factorId)) {
        // Same QR the user may have already scanned — keep it alive.
        setQr(cached.qr); setOtpUri(cached.uri); setSecret(cached.secret); setFactorId(cached.factorId)
        return
      }
    }

    // Abandoned factors from other sessions can't be re-shown (Supabase never
    // reveals a secret twice) — clear them and mint a fresh one.
    for (const f of unverified) await supabase.auth.mfa.unenroll({ factorId: f.id })
    clearPending()
    const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: enrollmentName(),
    })
    if (enrollErr) throw enrollErr
    writePending({ userId, factorId: data.id, qr: data.totp.qr_code, uri: data.totp.uri, secret: data.totp.secret })
    setQr(data.totp.qr_code); setOtpUri(data.totp.uri); setSecret(data.totp.secret); setFactorId(data.id)
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true
    async function start() {
      try {
        if (mode === 'enroll') {
          await startEnroll({ reuse: true })
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
  }, [mode, startEnroll])

  async function handleStartOver() {
    setBusy(true); setError(null); setCode('')
    try {
      if (factorId) await supabase.auth.mfa.unenroll({ factorId })
      await startEnroll({ reuse: false })
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

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
      setError(mode === 'enroll'
        ? 'That code didn’t match. Make sure you’re reading the newest BharatVidya entry in your app — codes from older entries or other QR codes won’t work. If it keeps failing, check that your phone’s clock is set automatically.'
        : 'That code didn’t match. Enter the current code from your authenticator app.')
      setBusy(false)
      return
    }
    clearPending()
    onVerified()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gradient-hero)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card card-heritage u-slide-up" style={{ width: '100%', maxWidth: 400, padding: '36px 32px', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.35px' }}>
          {mode === 'enroll' ? 'Set up two-factor authentication' : 'Two-factor authentication'}
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
          {mode === 'enroll'
            ? 'Admin accounts require an authenticator app — it shows a 6-digit code that changes every 30 seconds.'
            : 'Enter the 6-digit code from the authenticator app you set up for this account.'}
        </p>

        {error && (
          <div style={{ background: 'var(--error-lt)', border: '1px solid var(--error-md)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16, textAlign: 'left', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '20px 0' }}>Loading…</div>
        ) : (
          <>
            {mode === 'enroll' && qr && (
              <div style={{ marginBottom: 18 }}>
                <ol style={{ margin: '0 0 14px', padding: '0 0 0 20px', textAlign: 'left', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
                  <li>Open your authenticator app — <strong>Google Authenticator</strong>, 1Password, or Apple Passwords.</li>
                  <li>In the app, tap <strong>+</strong> (Add) → <strong>Scan a QR code</strong>.</li>
                  <li>Scan this code, then type the 6-digit code the app shows.</li>
                </ol>
                <img src={qr} alt="TOTP enrollment QR code" style={{ width: 168, height: 168, margin: '0 auto 10px', display: 'block', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#fff', padding: 8 }} />
                {otpUri && (
                  <div style={{ margin: '0 0 10px' }}>
                    <a
                      href={otpUri}
                      style={{
                        display: 'inline-block', padding: '9px 16px',
                        border: '1.5px solid var(--accent-md)', borderRadius: 'var(--radius-sm)',
                        fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none',
                      }}
                    >
                      Reading this on your phone? Add it with one tap →
                    </a>
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
                      Your phone will ask which app should add it — choose your <strong>authenticator app</strong> (e.g. Google Authenticator), not a banking app.
                    </p>
                  </div>
                )}
                {secret && (
                  <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
                    Can’t scan? In your authenticator choose <em>Enter a setup key</em> and paste:{' '}
                    <code style={{ fontSize: 11, userSelect: 'all', wordBreak: 'break-all' }}>{secret}</code>
                  </p>
                )}
                <p style={{ margin: 0, fontSize: 11, color: 'var(--warn)', background: 'var(--warn-lt, var(--warn-lt))', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', lineHeight: 1.6, textAlign: 'left' }}>
                  Already have a BharatVidya entry in your app from an earlier attempt? Delete it — only codes from <strong>this</strong> QR will work.
                </p>
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

            {mode === 'enroll' && !loading && (
              <button
                onClick={handleStartOver} disabled={busy}
                style={{ all: 'unset', cursor: 'pointer', marginTop: 14, fontSize: 12, color: 'var(--text-3)', textDecoration: 'underline' }}
              >
                QR not working, or scanned a while ago? Start over with a fresh code
              </button>
            )}
            {mode === 'verify' && (
              <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
                Lost access to your authenticator? Ask the platform owner to reset MFA for your account.
              </p>
            )}
          </>
        )}

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
          {userEmail && <span>Signed in as <strong style={{ color: 'var(--text-2)' }}>{userEmail}</strong> · </span>}
          <button
            onClick={onSignOut}
            style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline', color: 'var(--text-3)' }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
