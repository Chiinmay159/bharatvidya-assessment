import { Spinner } from '../shared/Spinner'
import { IconLock, IconSignal, IconAlert } from './examIcons'
import { centerFlex, iconWrap } from './examStyles'

/* ── Duplicate session ──────────────────────────────────── */
export function DuplicateSessionScreen() {
  return (
    <div style={centerFlex}>
      <div className="card" style={{ maxWidth: 400, padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ ...iconWrap, background: 'var(--error-lt)', border: '1px solid var(--border)', color: 'var(--error)' }}><IconLock /></div>
        <h2 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700 }}>Exam open in another window</h2>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14, lineHeight: 1.65 }}>
          Only one active session is allowed per student. Close all other tabs with this exam, then refresh.
        </p>
      </div>
    </div>
  )
}

/* ── Unsaved answers warning ──────────────────────────────── */
export function UnsavedWarningScreen({ isUrgent, remainingFormatted, unsavedCount, retrySubmit, forceSubmit }) {
  const warnTimerColor = isUrgent ? 'var(--error)' : 'var(--text-2)'
  return (
    <div style={centerFlex}>
      <div className="card" style={{ maxWidth: 420, padding: '36px 28px', textAlign: 'center' }}>
        {/* Live timer — countdown never pauses */}
        <div style={{ marginBottom: 16, fontSize: 20, fontWeight: 700, color: warnTimerColor, fontFamily: 'var(--font-mono)' }}>
          {remainingFormatted}
          {isUrgent && <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--error)', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 2 }}>Time running low</span>}
        </div>
        <div style={{ ...iconWrap, background: 'var(--warn-lt)', border: '1px solid var(--border)', color: 'var(--warn)' }}><IconSignal /></div>
        <h2 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>
          Some answers couldn't be saved
        </h2>
        <p style={{ margin: '0 0 24px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.65 }}>
          {unsavedCount} answer{unsavedCount !== 1 ? 's' : ''} failed to save due to connectivity issues.
          Check your connection and retry, or submit without {unsavedCount === 1 ? 'it' : 'them'}.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={retrySubmit} className="btn btn-primary" style={{ flex: 1, padding: '12px 16px' }}>
            Retry
          </button>
          <button onClick={forceSubmit} className="btn btn-secondary" style={{ flex: 1, padding: '12px 16px' }}>
            Submit anyway
          </button>
        </div>
        <p style={{ margin: '14px 0 0', color: 'var(--text-3)', fontSize: 12 }}>
          Submitting anyway may reduce your score by up to {unsavedCount} point{unsavedCount !== 1 ? 's' : ''}.
        </p>
      </div>
    </div>
  )
}

/* ── Loading ──────────────────────────────────────────────  */
export function LoadingScreen() {
  return (
    <div style={centerFlex}>
      <div style={{ textAlign: 'center', color: 'var(--text-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}><Spinner size={28} color="var(--accent)" /></div>
        <p style={{ marginTop: 14, fontSize: 14 }}>Preparing your exam…</p>
      </div>
    </div>
  )
}

export function SubmittingScreen() {
  return (
    <div style={centerFlex}>
      <div style={{ textAlign: 'center', color: 'var(--text-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}><Spinner size={28} color="var(--accent)" /></div>
        <p style={{ marginTop: 14, fontSize: 14 }}>Submitting your answers…</p>
      </div>
    </div>
  )
}

export function ErrorScreen({ error }) {
  return (
    <div style={{ ...centerFlex, padding: 20 }}>
      <div className="card" style={{ maxWidth: 380, padding: '32px 28px', textAlign: 'center' }}>
        <div style={{ ...iconWrap, background: 'var(--error-lt)', border: '1px solid var(--border)', color: 'var(--error)' }}><IconAlert /></div>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>Something went wrong</p>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6 }}>{error}</p>
      </div>
    </div>
  )
}

export function NoQuestionsScreen() {
  return (
    <div style={centerFlex}>
      <div className="card" style={{ maxWidth: 380, padding: '32px 28px', textAlign: 'center' }}>
        <div style={{ ...iconWrap, background: 'var(--error-lt)', border: '1px solid var(--border)', color: 'var(--error)' }}><IconAlert /></div>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>No questions available</p>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>Please contact your invigilator.</p>
      </div>
    </div>
  )
}
