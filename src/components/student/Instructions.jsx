import { useState } from 'react'

const RULES = [
  { icon: <OneWayIcon />,    text: 'Questions appear one at a time. You cannot go back to a previous question.' },
  { icon: <TimerIcon />,     text: 'The exam auto-submits when the timer expires.' },
  { icon: <EyeIcon />,       text: 'Do not switch tabs or windows — tab switches are logged and visible to the invigilator.' },
  { icon: <WifiIcon />,      text: 'Ensure a stable internet connection before you begin.' },
  { icon: <RefreshOffIcon />, text: 'Do not refresh or close this tab once the exam has started.' },
]

export function Instructions({ batch, rollNumber, onBegin }) {
  const [agreed, setAgreed] = useState(false)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src="/logo.png" alt="BharatVidya" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
        <span style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 15 }}>BharatVidya Exams</span>
      </header>

      {/* Body */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 20px 60px' }}>
        <div style={{ width: '100%', maxWidth: 560 }}>

          {/* Exam identity banner */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px 16px', background: 'var(--accent-lt)', border: '1px solid var(--accent-md)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 24 }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14, letterSpacing: '-.1px' }}>{batch.name}</span>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-2)', flexWrap: 'wrap' }}>
              <span>{batch.questions_per_student ?? 'All'} questions</span>
              <span style={{ color: 'var(--accent-md)' }}>·</span>
              <span>{batch.duration_minutes} min</span>
              <span style={{ color: 'var(--accent-md)' }}>·</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>{rollNumber}</span>
            </div>
          </div>

          <div className="card u-slide-up" style={{ padding: '32px 28px' }}>
            <h1 style={{ margin: '0 0 6px', fontSize: 21, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.3px' }}>
              Before you begin
            </h1>
            <p style={{ margin: '0 0 24px', color: 'var(--text-2)', fontSize: 14 }}>
              Read the following guidelines carefully.
            </p>

            {/* Rules */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 24, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              {RULES.map((rule, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', gap: 14, alignItems: 'flex-start',
                    padding: '14px 16px',
                    background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                    borderBottom: i < RULES.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{
                    flexShrink: 0, width: 32, height: 32, borderRadius: 8,
                    background: 'var(--accent-lt)', border: '1px solid var(--accent-md)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--accent)',
                  }}>
                    {rule.icon}
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, paddingTop: 6 }}>{rule.text}</p>
                </div>
              ))}
            </div>

            {/* Acknowledgement */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px',
              border: `2px solid ${agreed ? 'var(--accent)' : 'var(--border-md)'}`,
              borderRadius: 'var(--radius-sm)',
              background: agreed ? 'var(--accent-lt)' : 'var(--surface-2)',
              cursor: 'pointer', marginBottom: 20,
              transition: 'border-color .15s ease, background .15s ease',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                border: `2px solid ${agreed ? 'var(--accent)' : 'var(--border-md)'}`,
                background: agreed ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .15s ease',
              }}>
                {agreed && (
                  <svg width="11" height="11" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <input
                type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
              />
              <span style={{ fontSize: 14, color: agreed ? 'var(--accent-deep)' : 'var(--text-1)', fontWeight: 500, lineHeight: 1.45 }}>
                I have read and understood all the instructions above.
              </span>
            </label>

            <button
              onClick={() => agreed && onBegin()}
              disabled={!agreed}
              className={`btn btn-block ${agreed ? 'btn-primary' : ''}`}
              style={{
                padding: '13px 20px', fontSize: 15,
                background: agreed ? undefined : 'var(--border)',
                color: agreed ? undefined : 'var(--text-3)',
                boxShadow: agreed ? undefined : 'none',
                cursor: agreed ? 'pointer' : 'not-allowed',
              }}
            >
              Begin exam →
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

/* ── Rule icons ──────────────────────────────────────────── */
function OneWayIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
      <polyline points="12 5 19 12 12 19" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TimerIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function WifiIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" strokeLinecap="round" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" strokeLinecap="round" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" strokeLinecap="round" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  )
}

function RefreshOffIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
      <path d="M21 2v6h-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12a9 9 0 0 0 15 6.7" strokeLinecap="round" />
      <path d="M21 12a9 9 0 0 0-4.1-7.6" strokeLinecap="round" />
    </svg>
  )
}
