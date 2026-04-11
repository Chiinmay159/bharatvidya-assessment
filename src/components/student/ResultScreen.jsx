export function ResultScreen({ result, batch, rollNumber, studentName }) {
  const { score, total, percentage, alreadySubmitted } = result || {}

  if (alreadySubmitted) {
    return (
      <div style={pageStyle}>
        <div className="card" style={cardStyle}>
          <div style={{ ...iconWrap, background: 'var(--warn-lt)' }}>
            <span style={{ fontSize: 28 }}>⚠️</span>
          </div>
          <h1 style={headingStyle}>Already submitted</h1>
          <p style={bodyStyle}>
            This roll number has already completed this exam.
            Please contact your invigilator if you believe this is an error.
          </p>
        </div>
      </div>
    )
  }

  const pct = Number.isFinite(percentage) ? percentage : 0
  const passed = pct >= 60
  const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : 'F'

  return (
    <div style={pageStyle}>
      <div className="card" style={{ ...cardStyle, padding: '40px 36px' }}>

        {/* Status icon */}
        <div style={{ ...iconWrap, background: passed ? 'var(--success-lt)' : 'var(--error-lt)' }}>
          {passed
            ? <CheckIcon color="var(--success)" />
            : <XIcon color="var(--error)" />}
        </div>

        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)', marginBottom: 4 }}>
          {passed ? 'Congratulations!' : 'Better luck next time'}
        </div>
        <h1 style={{ ...headingStyle, marginBottom: 2 }}>Exam submitted</h1>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: 'var(--text-2)' }}>{batch?.name}</p>

        {/* Score ring */}
        <div style={{
          background: passed ? 'var(--success-lt)' : 'var(--error-lt)',
          border: `1px solid ${passed ? '#A7F3D0' : '#FECACA'}`,
          borderRadius: 'var(--radius-md)',
          padding: '24px 32px',
          marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
          flexWrap: 'wrap',
        }}>
          {/* Percentage */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, fontWeight: 800, color: passed ? 'var(--success)' : 'var(--error)', lineHeight: 1, letterSpacing: '-2px' }}>
              {pct}%
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, fontWeight: 500 }}>Score</div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 48, background: passed ? '#A7F3D0' : '#FECACA' }} />

          {/* Grade */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: passed ? 'var(--success)' : 'var(--error)', lineHeight: 1 }}>{grade}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, fontWeight: 500 }}>Grade</div>
          </div>
        </div>

        {/* Breakdown */}
        <div style={{ display: 'flex', gap: 0, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 24 }}>
          <StatCell label="Correct" value={score ?? 0} color="var(--success)" />
          <StatCell label="Incorrect" value={(total ?? 0) - (score ?? 0)} color="var(--error)" border />
          <StatCell label="Total" value={total ?? 0} color="var(--text-1)" border />
        </div>

        {/* Student info */}
        <div style={{
          borderTop: '1px solid var(--border)', paddingTop: 16,
          display: 'flex', justifyContent: 'center', gap: 20,
          fontSize: 13, color: 'var(--text-2)', flexWrap: 'wrap',
        }}>
          <span>Roll No <strong style={{ color: 'var(--text-1)' }}>{rollNumber}</strong></span>
          <span style={{ color: 'var(--border-md)' }}>|</span>
          <span><strong style={{ color: 'var(--text-1)' }}>{studentName}</strong></span>
        </div>

        <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
          You may close this window. Thank you for taking the exam.
        </p>
      </div>
    </div>
  )
}

function StatCell({ label, value, color, border }) {
  return (
    <div style={{
      flex: 1, padding: '14px 12px', textAlign: 'center',
      borderLeft: border ? '1px solid var(--border)' : 'none',
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
    </div>
  )
}

function CheckIcon({ color }) {
  return (
    <svg width="28" height="28" fill="none" stroke={color} strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function XIcon({ color }) {
  return (
    <svg width="28" height="28" fill="none" stroke={color} strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

const pageStyle = {
  minHeight: '100vh', background: 'var(--bg)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px',
}
const cardStyle = {
  width: '100%', maxWidth: 440,
  padding: '36px 32px', textAlign: 'center',
}
const iconWrap = {
  width: 60, height: 60, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  margin: '0 auto 16px',
}
const headingStyle = {
  margin: '0 0 8px', fontSize: 22, fontWeight: 700,
  color: 'var(--text-1)', letterSpacing: '-.3px',
}
const bodyStyle = {
  margin: 0, color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6,
}
