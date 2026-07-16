import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/shared/Spinner'
import { SiteShell, CARD_SHADOW, INK, CARBON, GOLD, GOLD_L, TEAL } from '../components/site/SiteChrome'

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
    <SiteShell>
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="aura absolute -top-24 -right-24 w-[440px] h-[440px] rounded-full opacity-[.18]"
            style={{ background: `radial-gradient(circle, ${TEAL}, transparent 62%)`, filter: 'blur(70px)' }} />
          <div className="aura aura-2 absolute -bottom-32 -left-24 w-[380px] h-[380px] rounded-full opacity-[.14]"
            style={{ background: `radial-gradient(circle, ${GOLD_L}, transparent 62%)`, filter: 'blur(70px)' }} />
        </div>
        <div className="relative mx-auto max-w-2xl px-5 md:px-8 pt-14 md:pt-20 pb-24">
          <p className="m-0 mb-3 text-[11px] font-bold tracking-[.22em] uppercase" style={{ color: TEAL }}>Verification</p>
          <h1 className="m-0 mb-3 font-[Fraunces,serif] font-semibold tracking-tight text-balance text-[clamp(30px,5vw,44px)]" style={{ color: INK }}>
            Verify a certificate.
          </h1>
          <p className="m-0 mb-9 text-[15.5px] leading-[1.75] text-pretty" style={{ color: '#4B4438' }}>
            Enter the code printed on the certificate. You will see who earned it,
            in which exam, with what result. Nothing to sign up for.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 mb-7">
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="BV-XXXX-XXXX-XXXX"
              autoComplete="off"
              aria-label="Certificate code"
              className="flex-1 min-w-[220px] rounded-xl px-4 py-3.5 text-[15px] tracking-[.06em] font-[ui-monospace,SF_Mono,monospace]"
              style={{ background: '#FFFFFF', border: 'none', boxShadow: CARD_SHADOW, color: INK }}
            />
            <button
              type="submit"
              disabled={state === 'checking' || !code.trim()}
              className="rounded-full px-8 py-3.5 text-[15px] font-bold transition-transform hover:scale-[1.03] active:scale-[0.96] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: `linear-gradient(135deg, ${GOLD_L}, ${GOLD})`, color: CARBON, boxShadow: '0 4px 20px rgba(201,162,39,.35)', border: 'none' }}
            >
              {state === 'checking' ? <Spinner size={14} color={CARBON} /> : 'Verify'}
            </button>
          </form>

          {state === 'done' && result && !result.revoked && (
            <div role="status" className="rounded-2xl p-6 md:p-7" style={{ background: '#FFFFFF', boxShadow: CARD_SHADOW }}>
              <div className="flex items-center gap-3 mb-4">
                <span aria-hidden="true" className="w-8 h-8 rounded-full flex items-center justify-center text-[15px] font-bold" style={{ background: 'var(--success-lt)', color: 'var(--success)' }}>✓</span>
                <span className="font-[Fraunces,serif] text-[19px] font-semibold" style={{ color: INK }}>Valid certificate</span>
              </div>
              <Row label="Awarded to" value={result.student_name} />
              <Row label="Examination" value={result.exam_name} />
              {result.percentage != null && <Row label="Score" value={`${result.percentage}%`} />}
              <Row label="Issued" value={new Date(result.issued_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} />
            </div>
          )}

          {state === 'done' && result?.revoked && (
            <div role="alert" className="rounded-2xl p-6 flex items-center gap-3" style={{ background: '#FFFFFF', boxShadow: CARD_SHADOW }}>
              <span aria-hidden="true" className="w-8 h-8 rounded-full flex items-center justify-center text-[15px] font-bold shrink-0" style={{ background: 'var(--error-lt)', color: 'var(--error)' }}>✕</span>
              <span className="text-[15px] font-semibold" style={{ color: 'var(--error)' }}>This certificate has been revoked.</span>
            </div>
          )}

          {state === 'done' && !result && (
            <div role="alert" className="rounded-2xl p-6 flex items-center gap-3" style={{ background: '#FFFFFF', boxShadow: CARD_SHADOW }}>
              <span aria-hidden="true" className="w-8 h-8 rounded-full flex items-center justify-center text-[15px] font-bold shrink-0" style={{ background: 'var(--error-lt)', color: 'var(--error)' }}>✕</span>
              <span className="text-[15px] font-semibold" style={{ color: 'var(--error)' }}>No certificate found for this code. Check the code and try again.</span>
            </div>
          )}

          <p className="mt-6 mb-0 text-[12.5px] leading-relaxed" style={{ color: '#8A8272' }}>
            Certificates are issued and verified by the institution via Matra.
            Questions? Contact the issuing institution.
          </p>
        </div>
      </section>
    </SiteShell>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-[14px]">
      <span className="shrink-0" style={{ color: '#8A8272' }}>{label}</span>
      <strong className="text-right" style={{ color: INK }}>{value}</strong>
    </div>
  )
}
