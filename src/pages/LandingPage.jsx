import { Link } from 'react-router-dom'

/**
 * LandingPage — Matra Assessment Platform (route: /).
 *
 * A router, not a brochure: tells each visitor where they are and what
 * to do next, above the fold, on a mid-range phone. Students arriving
 * minutes before an exam must reach their door instantly — keep this
 * page static, light, and dependency-free (no data fetching).
 */
export function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <header style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <Wordmark />
        <Link to="/admin" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', textDecoration: 'none' }}>
          Administrator sign in →
        </Link>
      </header>

      {/* ── Hero + doors ── */}
      <main id="main-content" tabIndex={-1} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px 56px', outline: 'none' }}>
        <div style={{ width: '100%', maxWidth: 720, textAlign: 'center' }}>

          <h1 style={{ margin: '16px 0 10px', fontSize: 'clamp(26px, 5vw, 38px)', fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.5px', lineHeight: 1.15 }}>
            Secure online examinations,<br />verifiable results.
          </h1>
          <p style={{ margin: '0 auto 36px', fontSize: 15, color: 'var(--text-2)', maxWidth: 480, lineHeight: 1.65 }}>
            Matra runs timed, proctored assessments for institutions —
            including <strong style={{ color: 'var(--accent-deep)' }}>BharatVidya</strong>'s
            examinations in Indian Knowledge Systems.
          </p>

          {/* The two doors */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 40, textAlign: 'left' }}>
            <DoorCard
              to="/exam"
              primary
              title="I'm taking an exam"
              desc="Find your scheduled exam, register with your roll number, and begin."
              cta="Go to my exam →"
            />
            <DoorCard
              to="/admin"
              title="I run exams"
              desc="Create papers from your question bank, monitor exams live, publish results."
              cta="Open the admin portal →"
            />
          </div>

          {/* Student path: the three steps */}
          <div style={{ textAlign: 'left', marginBottom: 36 }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 12px' }}>
              Taking an exam? Your path:
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <StepCard n="1" to="/check" title="Check your device" desc="Run a 30-second test of your connection, browser, and fonts — ideally a day before." />
              <StepCard n="2" to="/exam" title="Take your exam" desc="On exam day, find your batch, register, and wait — it starts automatically on time." />
              <StepCard n="3" to="/verify" title="Verify a certificate" desc="Anyone can confirm a certificate is genuine using the code or QR printed on it." />
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto' }}>
            Built for real conditions: exams resume after connection drops, answers save
            continuously, and every certificate is independently verifiable.
          </p>
        </div>
      </main>

      <footer style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, background: 'var(--surface)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>© {new Date().getFullYear()} Matra Media · Assessment Platform</span>
        <nav aria-label="Footer" style={{ display: 'flex', gap: 16 }}>
          <Link to="/check" style={footLink}>System check</Link>
          <Link to="/verify" style={footLink}>Verify certificate</Link>
        </nav>
      </footer>
    </div>
  )
}

function Wordmark() {
  return (
    <div style={{ lineHeight: 1.15 }}>
      <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-1)', letterSpacing: '-.2px' }}>Matra</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-deep)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Assessment Platform</div>
    </div>
  )
}

function DoorCard({ to, title, desc, cta, primary }) {
  return (
    <Link to={to} className="card" style={{
      display: 'block', padding: '22px 22px 18px', textDecoration: 'none',
      border: primary ? '2px solid var(--accent)' : '1px solid var(--border)',
      background: primary ? 'var(--accent-lt)' : 'var(--surface)',
    }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>{title}</div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{desc}</p>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-deep)' }}>{cta}</span>
    </Link>
  )
}

function StepCard({ n, to, title, desc }) {
  return (
    <Link to={to} className="card" style={{ display: 'flex', gap: 12, padding: '14px 16px', textDecoration: 'none', alignItems: 'flex-start' }}>
      <span aria-hidden="true" style={{
        flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
        background: 'var(--accent-lt)', border: '1px solid var(--accent-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, color: 'var(--accent-deep)',
      }}>{n}</span>
      <span>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55 }}>{desc}</span>
      </span>
    </Link>
  )
}

const footLink = { fontSize: 12, color: 'var(--text-2)', textDecoration: 'none', fontWeight: 600 }
