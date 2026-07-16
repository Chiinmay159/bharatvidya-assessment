import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { SiteShell, CARD_SHADOW, INK, CARBON, GOLD, GOLD_L, TEAL } from '../components/site/SiteChrome'

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
    <SiteShell>
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="aura absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full opacity-[.16]"
            style={{ background: `radial-gradient(circle, ${GOLD_L}, transparent 62%)`, filter: 'blur(70px)' }} />
          <div className="aura aura-2 absolute -bottom-32 -right-24 w-[380px] h-[380px] rounded-full opacity-[.13]"
            style={{ background: `radial-gradient(circle, ${TEAL}, transparent 62%)`, filter: 'blur(70px)' }} />
        </div>
        <div className="relative mx-auto max-w-2xl px-5 md:px-8 pt-14 md:pt-20 pb-24">
          <p className="m-0 mb-3 text-[11px] font-bold tracking-[.22em] uppercase" style={{ color: TEAL }}>For students</p>
          <h1 className="m-0 mb-3 font-[Fraunces,serif] font-semibold tracking-tight text-balance text-[clamp(30px,5vw,44px)]" style={{ color: INK }}>
            Is your device exam-ready?
          </h1>
          <p className="m-0 mb-9 text-[15.5px] leading-[1.75] text-pretty" style={{ color: '#4B4438' }}>
            Run this on the device and internet connection you will use on exam day.
            It takes half a minute and catches problems while there is still time to fix them.
          </p>

          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: '#FFFFFF', boxShadow: CARD_SHADOW }}>
            <div role="list">
              {CHECKS.map((c, i) => {
                const r = results[c.id]
                return (
                  <div role="listitem" key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px',
                    borderBottom: i < CHECKS.length - 1 ? '1px solid #F1EBDD' : 'none',
                  }}>
                    <StatusIcon status={r?.status} pending={running && !r} />
                    <div style={{ minWidth: 0 }}>
                      <div className="text-[14.5px] font-semibold" style={{ color: INK }}>{c.label}</div>
                      {r?.note && <div className="text-[12.5px] mt-0.5" style={{ color: r.status === 'fail' ? 'var(--error)' : '#8A8272' }}>{r.note}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Devanagari visual sample for self-verification */}
          <div className="rounded-2xl px-5 py-4 mb-6" style={{ background: '#F4EEDF' }}>
            <div className="text-[11px] font-bold tracking-[.14em] uppercase mb-1.5" style={{ color: '#8A8272' }}>
              Sample question text — confirm this is readable:
            </div>
            <p lang="hi" className="m-0 text-[16px] leading-[1.7]" style={{ color: INK }}>
              परीक्षा में आपका स्वागत है। क्षेत्रज्ञ, धर्मशास्त्र, ज्ञानमार्ग।
            </p>
          </div>

          {verdict && (
            <div role="status" className="rounded-2xl px-5 py-4 mb-6 text-[14.5px] font-semibold" style={{
              background: verdict === 'pass' ? 'var(--success-lt)' : verdict === 'warn' ? 'var(--warn-lt)' : 'var(--error-lt)',
              color: verdict === 'pass' ? 'var(--success)' : verdict === 'warn' ? 'var(--warn)' : 'var(--error)',
            }}>
              {verdict === 'pass' && '✓ Your device is ready for the exam.'}
              {verdict === 'warn' && 'Your device will work, but review the warnings above before exam day.'}
              {verdict === 'fail' && 'Problems detected — resolve the items above or use a different device.'}
            </div>
          )}

          <button
            onClick={runChecks}
            disabled={running}
            className="w-full rounded-full px-7 py-3.5 text-[15px] font-bold transition-transform hover:scale-[1.02] active:scale-[0.96] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            style={{ background: `linear-gradient(135deg, ${GOLD_L}, ${GOLD})`, color: CARBON, boxShadow: '0 4px 20px rgba(201,162,39,.3)', border: 'none' }}
          >
            {running ? 'Checking…' : 'Run check again'}
          </button>
        </div>
      </section>
    </SiteShell>
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
