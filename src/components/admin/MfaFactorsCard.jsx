import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { enrollmentName } from '../../lib/mfa'

/* Self-service card: your own authenticators. Lets any admin see their
   enrolled factors, add a backup (e.g. 1Password / Apple Passwords on a
   desktop — clock-safe and survives phone loss), and remove a factor.
   Owner-driven resets for OTHER admins live in TeamView via manage-admin. */
export function MfaFactorsCard() {
  const [factors, setFactors] = useState(null)
  const [error, setError]     = useState(null)
  const [notice, setNotice]   = useState(null)
  // Backup enrollment in progress
  const [pending, setPending] = useState(null) // { factorId, qr, secret }
  const [code, setCode]       = useState('')
  const [busy, setBusy]       = useState(false)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.auth.mfa.listFactors()
    if (err) { setError(err.message); return }
    setFactors(data?.totp ?? []) // verified TOTP factors only
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  async function startBackup() {
    setError(null); setNotice(null); setBusy(true)
    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: enrollmentName('Backup'),
    })
    setBusy(false)
    if (err) { setError(err.message); return }
    setPending({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    setCode('')
  }

  async function cancelBackup() {
    if (pending) await supabase.auth.mfa.unenroll({ factorId: pending.factorId })
    setPending(null); setCode(''); setError(null)
  }

  async function confirmBackup(e) {
    e.preventDefault()
    if (!pending) return
    setBusy(true); setError(null)
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: pending.factorId })
    if (chErr) { setError(chErr.message); setBusy(false); return }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: pending.factorId, challengeId: challenge.id, code: code.trim(),
    })
    setBusy(false)
    if (vErr) { setError('That code didn’t match — enter the current code shown for the entry you just added.'); return }
    setPending(null); setCode('')
    setNotice('Backup authenticator added. Either device can now sign you in.')
    load()
  }

  async function removeFactor(f) {
    const last = factors.length === 1
    const warning = last
      ? `Remove "${f.friendly_name}"? This is your ONLY authenticator — you'll have to set up two-factor again at your next sign-in. Only do this if you're replacing a lost device.`
      : `Remove "${f.friendly_name}"? Codes from that entry will stop working.`
    if (!window.confirm(warning)) return
    setError(null); setNotice(null)
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId: f.id })
    if (err) { setError(err.message); return }
    setNotice(`Removed "${f.friendly_name}".`)
    load()
  }

  if (!factors && !error) return null

  return (
    <section style={{ marginBottom: 28 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Your sign-in security</h3>
      <div className="card" style={{ padding: '16px 20px', maxWidth: 640 }}>
        {notice && <p role="status" style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--success)' }}>{notice}</p>}
        {error && <p role="alert" style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--error)' }}>{error}</p>}

        {factors?.length === 0 && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>No authenticator enrolled on this account.</p>
        )}
        {factors?.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{f.friendly_name || 'Authenticator'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Added {new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
            <button onClick={() => removeFactor(f)} className="btn btn-secondary" style={{ padding: '5px 11px', fontSize: 12, color: 'var(--error)', flexShrink: 0 }}>
              Remove
            </button>
          </div>
        ))}

        {!pending ? (
          <div style={{ marginTop: 12 }}>
            <button onClick={startBackup} disabled={busy} className="btn btn-secondary" style={{ padding: '7px 14px', fontSize: 13 }}>
              Add backup authenticator
            </button>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
              Strongly recommended: add a second authenticator on a different device — e.g. 1Password or
              Apple Passwords on this computer — so losing your phone doesn’t lock you out.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
              On this computer: open 1Password or Apple Passwords, add a one-time password, and paste this setup key.
              On another phone: scan the QR from inside its authenticator app.
            </p>
            <code style={{ display: 'block', fontSize: 12, userSelect: 'all', wordBreak: 'break-all', marginBottom: 10, padding: '8px 10px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              {pending.secret}
            </code>
            <img src={pending.qr} alt="Backup TOTP enrollment QR code" style={{ width: 132, height: 132, display: 'block', margin: '0 0 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#fff', padding: 6 }} />
            <form onSubmit={confirmBackup} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code" aria-label="Backup authenticator code" required
                style={{ padding: '8px 12px', fontSize: 14, width: 130, textAlign: 'center', letterSpacing: '.25em', border: '1.5px solid var(--border-md)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit' }}
              />
              <button type="submit" disabled={busy || code.length !== 6} className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 13 }}>
                {busy ? 'Verifying…' : 'Confirm'}
              </button>
              <button type="button" onClick={cancelBackup} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: 13 }}>
                Cancel
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  )
}
