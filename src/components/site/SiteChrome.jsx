import { Link } from 'react-router-dom'

/**
 * SiteChrome — the public-site design system (extracted from LandingPage).
 * Carbon header/footer with the gold→teal→red signature rule, ivory ground,
 * Fraunces display. Every public page (/, /verify, /check, static guides)
 * composes these so the aesthetic stays one system, not per-page copies.
 */

export const INK    = '#1C1B18'
export const IVORY  = '#FBF7EE'
export const CARBON = '#14120E'
export const GOLD   = '#C9A227'
export const GOLD_L = '#E8C55B'
export const TEAL   = '#0F7B7C'
export const RED    = '#A62B25'

export const CARD_SHADOW =
  '0px 0px 0px 1px rgba(28,27,24,0.06), 0px 1px 2px -1px rgba(28,27,24,0.06), 0px 2px 4px 0px rgba(28,27,24,0.04)'

export function SiteHeader() {
  const navLink = { color: 'rgba(251,247,238,.65)' }
  const hoverIn = e => (e.currentTarget.style.color = GOLD_L)
  const hoverOut = e => (e.currentTarget.style.color = 'rgba(251,247,238,.65)')
  return (
    <header className="sticky top-0 z-50" style={{ background: 'rgba(20,18,14,.92)', backdropFilter: 'blur(12px)' }}>
      <div aria-hidden="true" className="h-[2.5px]" style={{ background: `linear-gradient(90deg, ${GOLD} 0%, ${GOLD_L} 30%, ${TEAL} 68%, ${RED} 100%)` }} />
      <nav className="mx-auto max-w-6xl px-5 md:px-8 h-16 flex items-center justify-between" aria-label="Primary">
        <a href="/" className="flex items-baseline gap-2.5 no-underline group">
          <span className="font-[Fraunces,serif] text-[22px] font-bold tracking-tight" style={{ color: IVORY }}>Matra</span>
          <span className="hidden sm:inline text-[10px] font-semibold tracking-[.18em] uppercase" style={{ color: 'rgba(251,247,238,.45)' }}>Assessment Platform</span>
        </a>
        <div className="flex items-center gap-5 md:gap-7">
          <a href="/#institutions" className="hidden md:inline text-[13px] font-semibold no-underline transition-colors" style={navLink} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>Institutions</a>
          <Link to="/verify" className="hidden sm:inline text-[13px] font-semibold no-underline transition-colors" style={navLink} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>Verify a certificate</Link>
          <Link to="/exam" className="no-underline rounded-full px-4 md:px-5 py-2 text-[13px] font-bold transition-transform hover:scale-[1.04] active:scale-[0.96]"
            style={{ background: `linear-gradient(135deg, ${GOLD_L}, ${GOLD})`, color: CARBON, boxShadow: '0 2px 14px rgba(201,162,39,.35)' }}>
            Enter your exam
          </Link>
        </div>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  const col = 'flex flex-col gap-2.5'
  const head = { color: 'rgba(251,247,238,.4)' }
  const link = { color: 'rgba(251,247,238,.78)' }
  return (
    <footer style={{ background: CARBON }}>
      <div aria-hidden="true" className="h-[2.5px]" style={{ background: `linear-gradient(90deg, ${RED} 0%, ${TEAL} 35%, ${GOLD} 100%)` }} />
      <div className="mx-auto max-w-6xl px-5 md:px-8 py-14 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-[Fraunces,serif] text-[24px] font-bold" style={{ color: IVORY }}>Matra</span>
            <span className="text-[10px] font-semibold tracking-[.18em] uppercase" style={head}>Assessment Platform</span>
          </div>
          <p className="text-[13.5px] leading-relaxed max-w-xs m-0" style={{ color: 'rgba(251,247,238,.55)' }}>
            Timed, invigilated online examinations for institutions,
            including BharatVidya's examinations in Indian Knowledge Systems.
          </p>
        </div>
        <nav className={col} aria-label="For students">
          <span className="text-[11px] font-bold tracking-[.14em] uppercase" style={head}>Students</span>
          <Link to="/exam" className="text-[13.5px] font-semibold no-underline py-1" style={link}>Take an exam</Link>
          <a href="/students.html" className="text-[13.5px] font-semibold no-underline py-1" style={link}>Student guide</a>
          <Link to="/check" className="text-[13.5px] font-semibold no-underline py-1" style={link}>Device check</Link>
        </nav>
        <nav className={col} aria-label="For institutions">
          <span className="text-[11px] font-bold tracking-[.14em] uppercase" style={head}>Institutions</span>
          <Link to="/admin" className="text-[13.5px] font-semibold no-underline py-1" style={link}>Admin portal</Link>
          <a href="/#institutions" className="text-[13.5px] font-semibold no-underline py-1" style={link}>Why Matra</a>
        </nav>
        <nav className={col} aria-label="Trust">
          <span className="text-[11px] font-bold tracking-[.14em] uppercase" style={head}>Trust</span>
          <Link to="/verify" className="text-[13.5px] font-semibold no-underline py-1" style={{ color: GOLD_L }}>Verify a certificate</Link>
          <a href="mailto:chinmay@matramedia.co.in" className="text-[13.5px] font-semibold no-underline py-1" style={link}>Write to us</a>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-5 md:px-8 pb-8">
        <p className="m-0 pt-6 text-[12px]" style={{ color: 'rgba(251,247,238,.35)', borderTop: '1px solid rgba(251,247,238,.08)' }}>
          © {new Date().getFullYear()} Matra Media
        </p>
      </div>
    </footer>
  )
}

export function Grain() {
  return (
    <div aria-hidden="true" className="absolute inset-0 opacity-[.05] mix-blend-multiply"
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E")` }} />
  )
}

export function SiteStyles() {
  return (
    <style>{`
      @keyframes auraDrift {
        0%, 100% { transform: translate(0, 0) scale(1); }
        50% { transform: translate(28px, -20px) scale(1.06); }
      }
      .aura { animation: auraDrift 14s ease-in-out infinite; }
      .aura-2 { animation-duration: 18s; animation-delay: -6s; }
      .aura-3 { animation-duration: 22s; animation-delay: -11s; }
      @media (prefers-reduced-motion: reduce) {
        .aura, .aura-2, .aura-3 { animation: none; }
      }
    `}</style>
  )
}

/** Full-page shell for utility pages: carbon chrome, ivory ground. */
export function SiteShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col font-[Instrument_Sans,system-ui,sans-serif]" style={{ background: IVORY, color: INK }}>
      <SiteStyles />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
