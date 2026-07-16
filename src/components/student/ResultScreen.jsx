import { CheckIcon, XIcon, WarningIcon, RetryIcon, ClipboardIcon } from './resultIcons'
import { SeriesStanding } from './SeriesStanding'

export function ResultScreen({ result, batch, rollNumber, studentName, email, onRetry }) {
  const {
    score, total, percentage, alreadySubmitted,
    showResults = true, passPercentage, canRetry,
    attemptNumber, maxAttempts, lateDeliveredCount = 0,
  } = result || {}

  /* ── Already submitted (page refresh / re-entry) ────────── */
  if (alreadySubmitted && !showResults && !canRetry) {
    return (
      <div style={pageStyle}>
        <div className="card card-heritage u-slide-up" style={cardStyle}>
          <div style={{ ...iconWrap, background: 'var(--accent-lt)', border: '2px solid var(--accent-md)' }}>
            <ClipboardIcon />
          </div>
          <h1 style={headingStyle}>Exam Submitted</h1>
          <p style={{ margin: '0 0 6px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.65 }}>
            Your answers have been recorded successfully.
          </p>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13, lineHeight: 1.65 }}>
            Results will be shared by your instructor.
          </p>
          <StudentFooter rollNumber={rollNumber} studentName={studentName} email={email} batch={batch} />
        </div>
      </div>
    )
  }

  if (alreadySubmitted && !showResults && canRetry) {
    return (
      <div style={pageStyle}>
        <div className="card card-heritage u-slide-up" style={cardStyle}>
          <div style={{ ...iconWrap, background: 'var(--accent-lt)', border: '2px solid var(--accent-md)' }}>
            <RetryIcon />
          </div>
          <h1 style={headingStyle}>Exam Submitted</h1>
          <p style={{ margin: '0 0 6px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.65 }}>
            Your answers have been recorded. You are eligible for another attempt.
          </p>
          <RetryInfo attemptNumber={attemptNumber} maxAttempts={maxAttempts} />
          <RetryButton onRetry={onRetry} />
          <StudentFooter rollNumber={rollNumber} studentName={studentName} email={email} batch={batch} />
        </div>
      </div>
    )
  }

  if (alreadySubmitted && showResults && percentage == null) {
    return (
      <div style={pageStyle}>
        <div className="card card-heritage u-slide-up" style={cardStyle}>
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

  /* ── Results hidden (fresh submission) ──────────────────── */
  if (!showResults && !canRetry) {
    return (
      <div style={pageStyle}>
        <div className="card card-heritage u-slide-up" style={cardStyle}>
          <div style={{ ...iconWrap, background: 'var(--accent-lt)', border: '2px solid var(--accent-md)' }}>
            <ClipboardIcon />
          </div>
          <h1 style={headingStyle}>Exam Submitted</h1>
          <p style={{ margin: '0 0 6px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.65 }}>
            Your answers have been recorded successfully.
          </p>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13, lineHeight: 1.65 }}>
            Results will be shared by your instructor.
          </p>
          <LateNote count={lateDeliveredCount} />
          {attemptNumber > 1 && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              Attempt {attemptNumber} of {maxAttempts}
            </p>
          )}
          <StudentFooter rollNumber={rollNumber} studentName={studentName} email={email} batch={batch} />
          <CloseMessage />
        </div>
      </div>
    )
  }

  if (!showResults && canRetry) {
    return (
      <div style={pageStyle}>
        <div className="card card-heritage u-slide-up" style={cardStyle}>
          <div style={{ ...iconWrap, background: 'var(--accent-lt)', border: '2px solid var(--accent-md)' }}>
            <RetryIcon />
          </div>
          <h1 style={headingStyle}>Exam Submitted</h1>
          <p style={{ margin: '0 0 6px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.65 }}>
            Your answers have been recorded. You are eligible for another attempt.
          </p>
          <RetryInfo attemptNumber={attemptNumber} maxAttempts={maxAttempts} />
          <RetryButton onRetry={onRetry} />
          <StudentFooter rollNumber={rollNumber} studentName={studentName} email={email} batch={batch} />
        </div>
      </div>
    )
  }

  /* ── Full results visible ───────────────────────────────── */
  const pct    = Number.isFinite(percentage) ? percentage : 0
  const passed = passPercentage != null ? pct >= passPercentage : pct >= 60
  const grade  = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : 'F'
  const resultColor  = passed ? 'var(--success)' : 'var(--error)'
  const resultBg     = passed ? 'var(--success-lt)' : 'var(--error-lt)'
  const resultBorder = passed ? '#A7F3D0' : '#FECACA'

  return (
    <div style={pageStyle}>
      <div className="card card-heritage u-slide-up" style={cardStyle}>

        {/* Status icon */}
        <div style={{ ...iconWrap, background: resultBg, border: `2px solid ${resultBorder}` }}>
          {passed ? <CheckIcon /> : <XIcon />}
        </div>

        {/* Status text */}
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: resultColor, marginBottom: 4 }}>
          {passed ? 'Congratulations!' : 'Better luck next time'}
        </div>
        <h1 style={{ ...headingStyle, marginBottom: 4 }}>Exam Submitted</h1>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: 'var(--text-3)' }}>
          {batch?.name}
          {attemptNumber > 1 && <span> — Attempt {attemptNumber}</span>}
        </p>

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

        {/* Pass threshold */}
        {passPercentage != null && (
          <div style={{
            fontSize: 12, fontWeight: 600, textAlign: 'center', marginBottom: 14,
            color: passed ? 'var(--success)' : 'var(--error)',
          }}>
            {passed
              ? `Passing score: ${passPercentage}% — You passed!`
              : `Passing score: ${passPercentage}% — You needed ${passPercentage - pct}% more`}
          </div>
        )}

        {/* Score breakdown */}
        <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 24 }}>
          <StatCell label="Correct"   value={score ?? 0}                         color="var(--success)" />
          <StatCell label="Incorrect" value={(total ?? 0) - (score ?? 0)}        color="var(--error)"   border />
          <StatCell label="Total"     value={total ?? 0}                          color="var(--text-1)"  border />
        </div>

        <LateNote count={lateDeliveredCount} />

        {/* Retry section */}
        {canRetry && (
          <div style={{ marginBottom: 20 }}>
            <RetryInfo attemptNumber={attemptNumber} maxAttempts={maxAttempts} />
            <RetryButton onRetry={onRetry} />
          </div>
        )}

        {/* Student identity */}
        <StudentFooter rollNumber={rollNumber} studentName={studentName} email={email} batch={batch} />

        {!canRetry && <CloseMessage />}
      </div>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────── */

function StatCell({ label, value, color, border }) {
  return (
    <div style={{ flex: 1, padding: '16px 12px', textAlign: 'center', borderLeft: border ? '1px solid var(--border)' : 'none' }}>
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, marginBottom: 5 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</div>
    </div>
  )
}

/** Shown when buffered answers arrived after the deadline and went to the
    instructor's review queue instead of being scored automatically. */
function LateNote({ count }) {
  if (!count) return null
  return (
    <div style={{ background: 'var(--warn-lt)', border: '1px solid #FDE68A', borderRadius: 'var(--radius-sm)', padding: '10px 14px', margin: '0 0 16px', fontSize: 13, color: 'var(--warn)', lineHeight: 1.6, textAlign: 'left' }}>
      Your connection returned after the exam deadline. <strong>{count} answer{count !== 1 ? 's' : ''}</strong> saved
      on this device {count !== 1 ? 'were' : 'was'} delivered to your instructor for review — they are not part of
      the score shown and your instructor will decide whether to count them.
    </div>
  )
}

function RetryInfo({ attemptNumber, maxAttempts }) {
  const remaining = (maxAttempts ?? 1) - (attemptNumber ?? 1)
  if (remaining <= 0) return null
  return (
    <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-2)', textAlign: 'center' }}>
      You have <strong style={{ color: 'var(--accent-deep)' }}>{remaining}</strong> retry{remaining !== 1 ? 's' : ''} remaining.
      You will receive different questions.
    </p>
  )
}

function RetryButton({ onRetry }) {
  if (!onRetry) return null
  return (
    <button
      onClick={onRetry}
      className="btn btn-primary btn-block"
      style={{ padding: '13px 20px', fontSize: 15 }}
    >
      Retry Exam
    </button>
  )
}

function StudentFooter({ rollNumber, studentName, email, batch }) {
  return (
    <>
      {/* Series running total — renders only when this exam is part of a series */}
      {batch?.series_module_id && (
        <SeriesStanding batch={batch} rollNumber={rollNumber} email={email} />
      )}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16, display: 'flex', justifyContent: 'center', gap: 16, fontSize: 13, color: 'var(--text-2)', flexWrap: 'wrap' }}>
        <span>Roll No <strong style={{ color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{rollNumber}</strong></span>
        <span style={{ color: 'var(--border-md)' }}>|</span>
        <strong style={{ color: 'var(--text-1)' }}>{studentName}</strong>
      </div>
    </>
  )
}

function CloseMessage() {
  return (
    <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
      You may close this window. Thank you for taking the exam.
    </p>
  )
}

/* ── Style constants ────────────────────────────────────────── */

const pageStyle = {
  minHeight: '100vh',
  background: 'var(--bg)',
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
