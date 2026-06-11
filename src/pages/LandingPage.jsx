import { Link } from 'react-router-dom'

/**
 * LandingPage — Matra Assessment Platform (route: /).
 *
 * Heritage design language: ink-blue hero under a gold rule, serif
 * display, ivory cards. A router, not a brochure — each visitor finds
 * their door above the fold on a mid-range phone. Static and light:
 * nothing here touches the exam-day critical path.
 */
export function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Gold rule — the heritage signature */}
      <div aria-hidden="true" style={{ height: 3, background: 'linear-gradient(90deg, var(--accent-deep), var(--accent) 40%, var(--accent-md))' }} />

      {/* ── Hero (ink blue) ── */}
      <header style={{ background: 'var(--gradient-hero)', padding: '0 24px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>

          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-sm) 0' }}>
            <Wordmark />
            <Link to="/admin" style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.65)', textDecoration: 'none' }}>
              Administrator sign in →
            </Link>
          </div>

          {/* Headline */}
          <div style={{ padding: 'var(--space-xl) 0 var(--space-2xl)', textAlign: 'center' }}>
            <h1 style={{
              margin: '0 0 var(--space-sm)',
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(30px, 5.5vw, var(--text-xl))',
              fontWeight: 700, lineHeight: 1.18, letterSpacing: '-.5px',
              color: '#FDFBF5',
            }}>
              Secure examinations,<br />
              <span style={{ color: 'var(--accent-md)' }}>verifiable</span> results.
            </h1>
            <p style={{ margin: '0 auto', fontSize: 'var(--text-sm)', color: 'rgba(253,251,245,.62)', maxWidth: 460, lineHeight: 1.7 }}>
              Matra conducts timed, proctored online assessments for institutions —
              including <strong style={{ color: 'rgba(253,251,245,.9)', fontWeight: 600 }}>BharatVidya</strong>'s
              examinations in Indian Knowledge Systems.
            </p>
          </div>
        </div>
      </header>

      {/* ── The two doors — ivory cards overlapping the hero ── */}
      <main id="main-content" tabIndex={-1} style={{ flex: 1, padding: '0 20px var(--space-xl)', outline: 'none' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
            gap: 'var(--space-sm)', marginTop: -42, marginBottom: 'var(--space-xl)',
          }}>
            <DoorCard
              to="/exam"
              primary
              kicker="Students"
              title="I'm taking an exam"
              desc="Find your scheduled exam, register with your roll number, and begin. Your answers save continuously — even through connection drops."
              cta="Go to my exam"
            />
            <DoorCard
              to="/admin"
              kicker="Institutions"
              title="I run exams"
              desc="Compose papers from a reviewed question bank, monitor every student live on exam day, and publish results with verifiable certificates."
              cta="Open the admin portal"
            />
          </div>

          {/* ── Student path — three numbered steps ── */}
          <section style={{ marginBottom: 'var(--space-xl)' }}>
            <h2 style={{
              margin: '0 0 var(--space-sm)', textAlign: 'center',
              fontFamily: 'var(--font-display)', fontSize: 'var(--text-md)', fontWeight: 700,
              color: 'var(--text-1)', letterSpacing: '-.3px',
            }}>
              Taking an exam? Your path.
            </h2>
            <div aria-hidden="true" style={{ width: 48, height: 2, background: 'var(--accent)', margin: '0 auto var(--space-md)' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-xs)' }}>
              <StepCard n="1" to="/check" title="Check your device"
                desc="A 30-second test of your connection, browser, and fonts — run it a day before, on the device you'll use." />
              <StepCard n="2" to="/exam" title="Take your exam"
                desc="On the day, find your batch and register. The exam begins automatically at the scheduled time." />
              <StepCard n="3" to="/verify" title="Verify a certificate"
                desc="Every certificate carries a code and QR. Anyone — an employer, a university — can confirm it is genuine." />
            </div>
          </section>

          {/* ── Quiet trust strip ── */}
          <section style={{
            background: 'var(--gradient-deep)', borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md) var(--space-md)', textAlign: 'center',
          }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', color: '#FDFBF5', lineHeight: 1.7 }}>
              Built for real conditions —
              <span style={{ color: 'var(--accent-md)' }}> 2,000 students at once</span>, exams that
              survive network drops, and results an institution can stand behind.
            </p>
          </section>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: 'var(--space-sm) 24px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
            © {new Date().getFullYear()} Matra Media · Assessment Platform
          </span>
          <nav aria-label="Footer" style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <Link to="/check" style={footLink}>System check</Link>
            <Link to="/verify" style={footLink}>Verify certificate</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

function Wordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: '#FDFBF5', letterSpacing: '-.2px' }}>
        Matra
      </span>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-md)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
        Assessment Platform
      </span>
    </div>
  )
}

function DoorCard({ to, kicker, title, desc, cta, primary }) {
  return (
    <Link to={to} className="door-card" style={{
      display: 'flex', flexDirection: 'column', padding: 'var(--space-md)',
      textDecoration: 'none', background: 'var(--surface)',
      border: primary ? '1.5px solid var(--accent)' : '1px solid var(--border)',
      borderTop: primary ? '3px solid var(--accent)' : '3px solid var(--blue)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: primary ? 'var(--accent-deep)' : 'var(--blue-mid)', marginBottom: 6 }}>
        {kicker}
      </span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.3px', marginBottom: 8 }}>
        {title}
      </span>
      <p style={{ margin: '0 0 var(--space-sm)', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65, flex: 1 }}>
        {desc}
      </p>
      <span style={{ fontSize: 14, fontWeight: 700, color: primary ? 'var(--accent-deep)' : 'var(--blue-mid)' }}>
        {cta} <span aria-hidden="true">→</span>
      </span>
    </Link>
  )
}

function StepCard({ n, to, title, desc }) {
  return (
    <Link to={to} className="card door-card" style={{ display: 'flex', gap: 'var(--space-xs)', padding: 'var(--space-sm)', textDecoration: 'none', alignItems: 'flex-start' }}>
      <span aria-hidden="true" style={{
        flexShrink: 0, width: 30, height: 30, borderRadius: '50%',
        background: 'var(--blue)', color: 'var(--accent-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
      }}>{n}</span>
      <span>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>{desc}</span>
      </span>
    </Link>
  )
}

const footLink = { fontSize: 12, color: 'var(--text-2)', textDecoration: 'none', fontWeight: 600 }
