export function ResultScreen({ result, batch, rollNumber, studentName }) {
  const { score, total, percentage, alreadySubmitted } = result || {}

  if (alreadySubmitted) {
    return (
      <div style={pageStyle}>
        <div className="card u-slide-up" style={cardStyle}>
          <div style={{ ...iconWrap, background: 'var(--warn-lt)', border: '2px solid #FDE68A' }}>
            <WarningIcon />
          </div>
          <h1 style={headingStyle}>Already submitted</h1>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14, lineHeight: 1.65 }}>
            This roll number has already completed this exam.
            Please contact your invigilator if you believe this is an error.
          </p>
        </div>
      </div>
    )
  }

  const pct    = Number.isFinite(percentage) ? percentage : 0
  const passed = pct >= 60
  const grade  = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : 'F'
  const resultColor = passed ? 'var(--success)' : 'var(--error)'
  const resultBg    = passed ? 'var(--success-lt)' : 'var(--error-lt)'
  const resultBorder = passed ? '#A7F3D0' : '#FECACA'

  return (
    <div style={pageStyle}>
      <div className="card u-slide-up" style={cardStyle}>

        {/* Status icon */}
        <div style={{ ...iconWrap, background: resultBg, border: `2px solid ${resultBorder}` }}>
          {passed ? <CheckIcon /> : <XIcon />}
        </div>

        {/* Status text */}
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: resultColor, marginBottom: 4 }}>
          {passed ? 'Congratulations!' : 'Better luck next time'}
        </div>
        <h1 style={{ ...headingStyle, marginBottom: 4 }}>Exam Submitted</h1>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: 'var(--text-3)' }}>{batch?.name}</p>

        {/* Score hero block */}
        <div
          className="u-score-reveal"
          style={{
            background: resultBg,
            border: `1px solid ${resultBorder}`,
            borderRadius: 'var(--radius-md)',
            padding: '28px 24px',
            marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, flexWrap: 'wrap',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 60, fontWeight: 800, color: resultColor, lineHeight: 1, letterSpacing: '-3px' }}>
              {pct}<span style={{ fontSize: 32, letterSpacing: '-1px' }}>%</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: resultColor, opacity: .7, marginTop: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Score
            </div>
          </div>

          <div style={{ width: 1, height: 56, background: resultBorder, flexShrink: 0 }} />

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, fontWeight: 800, color: resultColor, lineHeight: 1 }}>{grade}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: resultColor, opacity: .7, marginTop: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Grade
            </div>
          </div>
        </div>

        {/* Score breakdown */}
        <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 24 }}>
          <StatCell label="Correct"   value={score ?? 0}                         color="var(--success)" />
          <StatCell label="Incorrect" value={(total ?? 0) - (score ?? 0)}        color="var(--error)"   border />
          <StatCell label="Total"     value={total ?? 0}                          color="var(--text-1)"  border />
        </div>

        {/* Student identity */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', justifyContent: 'center', gap: 16, fontSize: 13, color: 'var(--text-2)', flexWrap: 'wrap' }}>
          <span>Roll No <strong style={{ color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{rollNumber}</strong></span>
          <span style={{ color: 'var(--border-md)' }}>|</span>
          <strong style={{ color: 'var(--text-1)' }}>{studentName}</strong>
        </div>

        <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
          You may close this window. Thank you for taking the exam.
        </p>
      </div>
    </div>
  )
}

function StatCell({ label, value, color, border }) {
  return (
    <div style={{ flex: 1, padding: '16px 12px', textAlign: 'center', borderLeft: border ? '1px solid var(--border)' : 'none' }}>
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, marginBottom: 5 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" fill="none" stroke="var(--success)" strokeWidth="2.5" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" fill="none" stroke="var(--error)" strokeWidth="2.5" viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" fill="none" stroke="var(--warn)" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
    </svg>
  )
}

const pageStyle = {
  minHeight: '100vh',
  background: 'linear-gradient(160deg, #F8FAFC 0%, #EEF2FF 60%, #F8FAFC 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px',
}
const cardStyle = {
  width: '100%', maxWidth: 420,
  padding: '40px 32px', textAlign: 'center',
}
const iconWrap = {
  width: 64, height: 64, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  margin: '0 auto 18px',
}
const headingStyle = {
  margin: '0 0 8px',
  fontSize: 22, fontWeight: 700,
  color: 'var(--text-1)', letterSpacing: '-.35px',
}
