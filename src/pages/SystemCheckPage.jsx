import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * SystemCheckPage — self-serve pre-exam device check (route: /check).
 *
 * Students run this days before the exam, on the device they'll use.
 * At 2000 seats, every issue caught here is a support ticket that never
 * happens on exam day. No auth, no writes — read-only diagnostics.
 */

const CHECKS = [
  { id: 'connection', label: 'Server connection' },
  { id: 'speed',      label: 'Connection speed' },
  { id: 'crypto',     label: 'Secure question delivery (Web Crypto)' },
  { id: 'devanagari', label: 'Devanagari (देवनागरी) text rendering' },
  { id: 'fullscreen', label: 'Fullscreen support' },
  { id: 'screen',     label: 'Screen size' },
  { id: 'browser',    label: 'Browser version' },
]

export function SystemCheckPage() {
  const [results, setResults] = useState({}) // id → { status: 'pass'|'warn'|'fail', note }
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  async function runChecks() {
    setRunning(true)
    setDone(false)
    setResults({})
    const set = (id, status, note) =>
      setResults(prev => ({ ...prev, [id]: { status, note } }))

    // 1+2. Server connection + speed (3 pings, median RTT)
    try {
      const rtts = []
      for (let i = 0; i < 3; i++) {
        const t1 = performance.now()
        const { error } = await supabase.rpc('get_server_time')
        if (error) throw error
        rtts.push(performance.now() - t1)
      }
      rtts.sort((a, b) => a - b)
      const rtt = Math.round(rtts[1])
      set('connection', 'pass', 'Connected to exam server')
      if (rtt < 800) set('speed', 'pass', `Good (${rtt}ms response time)`)
      else if (rtt < 2500) set('speed', 'warn', `Slow (${rtt}ms) — find a better signal before exam day`)
      else set('speed', 'fail', `Very slow (${rtt}ms) — this connection may cause problems`)
    } catch {
      set('connection', 'fail', 'Could not reach the exam server — check your internet')
      set('speed', 'fail', 'Untestable without a connection')
    }

    // 3. Web Crypto (needed for fast paper delivery; has fallback, so warn only)
    if (globalThis.crypto?.subtle) {
      try {
        await crypto.subtle.digest('SHA-256', new Uint8Array([1]))
        set('crypto', 'pass', 'Supported')
      } catch { set('crypto', 'warn', 'Limited — exam will still work') }
    } else {
      set('crypto', 'warn', 'Not available — exam will still work, may load slower at start')
    }

    // 4. Devanagari rendering — compare rendered width of a conjunct-heavy
    // string against tofu boxes. Heuristic but catches missing-font devices.
    try {
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;font-size:32px;white-space:nowrap'
      probe.textContent = 'क्ष त्र ज्ञ श्री द्ध'
      document.body.appendChild(probe)
      const w1 = probe.getBoundingClientRect().width
      probe.textContent = '￿ ￿ ￿ ￿ ￿'
      const w2 = probe.getBoundingClientRect().width
      document.body.removeChild(probe)
      if (w1 > 0 && Math.abs(w1 - w2) > 2) set('devanagari', 'pass', 'Renders correctly')
      else set('devanagari', 'warn', 'May not render — check the sample text below looks right')
    } catch { set('devanagari', 'warn', 'Could not verify — check the sample text below') }

    // 5. Fullscreen
    if (document.documentElement.requestFullscreen) set('fullscreen', 'pass', 'Supported')
    else set('fullscreen', 'warn', 'Not supported on this device (common on iPhone) — exam still works')

    // 6. Screen
    const w = Math.max(window.screen.width, window.screen.height)
    if (w >= 360) set('screen', 'pass', `${window.screen.width}×${window.screen.height}`)
    else set('screen', 'warn', 'Very small screen — a larger device is recommended')

    // 7. Browser (rough floor: anything genuinely old fails earlier checks anyway)
    const ua = navigator.userAgent
    const modern = 'fetch' in window && 'Promise' in window && CSS?.supports?.('display', 'flex')
    set('browser', modern ? 'pass' : 'fail', modern ? browserName(ua) : 'Outdated browser — please update')

    setRunning(false)
    setDone(true)
  }

  useEffect(() => { runChecks() }, [])

  const counts = Object.values(results).reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})
  const verdict = counts.fail ? 'fail' : counts.warn ? 'warn' : done ? 'pass' : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', justifyContent: 'center', padding: '36px 20px' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div className="card" style={{ padding: '32px 28px' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 21, fontWeight: 700, color: 'var(--text-1)' }}>
            Exam system check
          </h1>
          <p style={{ margin: '0 0 24px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6 }}>
            Run this on the device and internet connection you will use on exam day.
          </p>

          <div role="list" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: 20 }}>
            {CHECKS.map((c, i) => {
              const r = results[c.id]
              return (
                <div role="listitem" key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                  borderBottom: i < CHECKS.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <StatusIcon status={r?.status} pending={running && !r} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{c.label}</div>
                    {r?.note && <div style={{ fontSize: 12, color: r.status === 'fail' ? 'var(--error)' : 'var(--text-3)', marginTop: 1 }}>{r.note}</div>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Devanagari visual sample for self-verification */}
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>
              Sample question text — confirm this is readable:
            </div>
            <p lang="hi" style={{ margin: 0, fontSize: 16, color: 'var(--text-1)', lineHeight: 1.7 }}>
              परीक्षा में आपका स्वागत है। क्षेत्रज्ञ, धर्मशास्त्र, ज्ञानमार्ग।
            </p>
          </div>

          {verdict && (
            <div role="status" style={{
              padding: '12px 16px', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, marginBottom: 20,
              background: verdict === 'pass' ? 'var(--success-lt)' : verdict === 'warn' ? 'var(--warn-lt)' : 'var(--error-lt)',
              color: verdict === 'pass' ? 'var(--success)' : verdict === 'warn' ? 'var(--warn)' : 'var(--error)',
              border: '1px solid var(--border)',
            }}>
              {verdict === 'pass' && '✓ Your device is ready for the exam.'}
              {verdict === 'warn' && 'Your device will work, but review the warnings above before exam day.'}
              {verdict === 'fail' && 'Problems detected — resolve the items above or use a different device.'}
            </div>
          )}

          <button onClick={runChecks} disabled={running} className="btn btn-primary" style={{ width: '100%', padding: '12px 16px' }}>
            {running ? 'Checking…' : 'Run check again'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusIcon({ status, pending }) {
  const common = { width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }
  if (pending) return <div style={{ ...common, background: 'var(--surface-2)', border: '1px solid var(--border-md)', color: 'var(--text-3)' }} aria-label="checking">…</div>
  if (!status) return <div style={{ ...common, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }} aria-label="pending">·</div>
  if (status === 'pass') return <div style={{ ...common, background: 'var(--success-lt)', color: 'var(--success)' }} aria-label="passed">✓</div>
  if (status === 'warn') return <div style={{ ...common, background: 'var(--warn-lt)', color: 'var(--warn)' }} aria-label="warning">!</div>
  return <div style={{ ...common, background: 'var(--error-lt)', color: 'var(--error)' }} aria-label="failed">✕</div>
}

function browserName(ua) {
  if (/edg\//i.test(ua)) return 'Edge — supported'
  if (/chrome|crios/i.test(ua)) return 'Chrome — supported'
  if (/firefox|fxios/i.test(ua)) return 'Firefox — supported'
  if (/safari/i.test(ua)) return 'Safari — supported'
  return 'Supported'
}
