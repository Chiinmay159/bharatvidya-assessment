import { useState, useEffect, useRef } from 'react'
import { useTimer } from '../../hooks/useTimer'
import { useExamState } from '../../hooks/useExamState'

export function ExamScreen({ batch, rollNumber, studentName, onComplete }) {
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submittingAnswer, setSubmittingAnswer] = useState(false)
  const autoSubmitCalledRef = useRef(false)

  const { status, currentQuestion, currentIndex, totalQuestions,
    result, error, submitAnswer, autoSubmit } = useExamState({ batch, rollNumber, studentName })

  const isLastQuestion = currentIndex === totalQuestions - 1

  const handleTimeUp = () => {
    if (autoSubmitCalledRef.current) return
    autoSubmitCalledRef.current = true
    autoSubmit()
  }
  const handleBatchEnded = () => {
    if (autoSubmitCalledRef.current) return
    autoSubmitCalledRef.current = true
    autoSubmit()
  }

  const { remainingFormatted, isUrgent, isExpired, syncStatus } = useTimer({
    scheduledStart: batch.scheduled_start,
    durationMinutes: batch.duration_minutes,
    onTimeUp: handleTimeUp,
    onBatchEnded: handleBatchEnded,
    batchId: batch.id,
    enabled: status === 'ready',
  })

  useEffect(() => { setSelectedLabel(null); setShowConfirm(false) }, [currentIndex])
  useEffect(() => { if (status === 'submitted' && result) onComplete(result) }, [status, result])

  async function handleNext() {
    if (!selectedLabel || submittingAnswer) return
    setSubmittingAnswer(true)
    await submitAnswer(selectedLabel, isLastQuestion)
    setSubmittingAnswer(false)
  }

  // ── Loading ──────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div style={centerFlex}>
        <div style={{ textAlign: 'center' }}>
          <Spinner />
          <p style={{ marginTop: 12, color: 'var(--text-2)', fontSize: 14 }}>Preparing your exam…</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={{ ...centerFlex, padding: 20 }}>
        <div className="card" style={{ maxWidth: 400, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Something went wrong</p>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>{error}</p>
        </div>
      </div>
    )
  }

  if (status === 'submitting') {
    return (
      <div style={centerFlex}>
        <div style={{ textAlign: 'center' }}>
          <Spinner />
          <p style={{ marginTop: 12, color: 'var(--text-2)', fontSize: 14 }}>Submitting your answers…</p>
        </div>
      </div>
    )
  }

  // Should never reach here if useExamState guards are working,
  // but prevents a blank screen if questions are unexpectedly empty.
  if (!currentQuestion) {
    return (
      <div style={centerFlex}>
        <div className="card" style={{ maxWidth: 400, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>No questions available</p>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>
            This exam has no questions yet. Please contact your invigilator.
          </p>
        </div>
      </div>
    )
  }

  const progress = totalQuestions > 0 ? ((currentIndex) / totalQuestions) * 100 : 0

  // ── Exam UI ──────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Sticky header ─────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Progress bar */}
        <div style={{ height: 3, background: 'var(--border)' }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'var(--accent)',
            transition: 'width .3s ease',
          }} />
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', maxWidth: 800, margin: '0 auto', width: '100%',
        }}>
          {/* Left: batch + progress label */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{batch.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
              Question {currentIndex + 1} of {totalQuestions}
            </div>
          </div>

          {/* Right: timer */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <div
              className="font-timer"
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: isUrgent ? 'var(--error)' : 'var(--text-1)',
                letterSpacing: '-.02em',
                lineHeight: 1,
                transition: 'color .3s',
              }}
            >
              {remainingFormatted}
            </div>
            {isUrgent && (
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--error)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                Time running out
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Question area ──────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px 48px' }}>
        <div style={{ width: '100%', maxWidth: 720 }}>

          {/* Question card */}
          <div className="card" style={{ padding: '28px 28px 24px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 12 }}>
              Question {currentIndex + 1}
            </div>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65, color: 'var(--text-1)', fontWeight: 500 }}>
              {currentQuestion.questionText}
            </p>
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {currentQuestion.options.map(option => {
              const isSelected = selectedLabel === option.label
              return (
                <label
                  key={option.label}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    padding: '14px 18px',
                    background: isSelected ? 'var(--accent-lt)' : 'var(--surface)',
                    border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    transition: 'border-color .12s, background .12s',
                    boxShadow: isSelected ? `0 0 0 3px var(--accent-md)` : 'var(--shadow-sm)',
                  }}
                >
                  {/* Custom radio */}
                  <div style={{
                    flexShrink: 0, width: 20, height: 20, borderRadius: '50%', marginTop: 1,
                    border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border-md)'}`,
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'border-color .12s, background .12s',
                  }}>
                    {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <input
                    type="radio" name="answer" value={option.label}
                    checked={isSelected}
                    onChange={() => setSelectedLabel(option.label)}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: isSelected ? 'var(--accent)' : 'var(--text-3)', minWidth: 16 }}>
                      {option.label}.
                    </span>
                    <span style={{ fontSize: 15, color: isSelected ? 'var(--accent)' : 'var(--text-1)', lineHeight: 1.55 }}>
                      {option.text}
                    </span>
                  </div>
                </label>
              )
            })}
          </div>

          {/* Action button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {isLastQuestion ? (
              <button
                onClick={() => selectedLabel && setShowConfirm(true)}
                disabled={!selectedLabel || submittingAnswer}
                style={{ ...actionBtn, background: selectedLabel ? 'var(--success)' : '#ccc', cursor: selectedLabel ? 'pointer' : 'not-allowed' }}
              >
                Submit Exam
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!selectedLabel || submittingAnswer}
                style={{ ...actionBtn, background: selectedLabel && !submittingAnswer ? 'var(--accent)' : '#ccc', cursor: selectedLabel && !submittingAnswer ? 'pointer' : 'not-allowed' }}
              >
                {submittingAnswer ? 'Saving…' : <>Next <span style={{ marginLeft: 2 }}>→</span></>}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* ── Confirm submit modal ───────────────────────── */}
      {showConfirm && (
        <Modal>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Submit your exam?</h2>
          <p style={{ margin: '0 0 6px', color: 'var(--text-2)', fontSize: 14 }}>
            You are about to submit. This cannot be undone.
          </p>
          <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>
            {currentIndex + 1} of {totalQuestions} questions answered.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={async () => { setShowConfirm(false); setSubmittingAnswer(true); await submitAnswer(selectedLabel, true); setSubmittingAnswer(false) }}
              style={{ ...actionBtn, flex: 1, background: 'var(--success)' }}
            >
              Yes, submit
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              style={{ ...actionBtnSecondary, flex: 1 }}
            >
              Go back
            </button>
          </div>
        </Modal>
      )}

      {/* ── Time-up overlay ────────────────────────────── */}
      {isExpired && status !== 'submitting' && (
        <Modal>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏰</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>Time's up!</h2>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>Submitting your answers…</p>
          <div style={{ marginTop: 20 }}><Spinner /></div>
        </Modal>
      )}
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────── */
function Modal({ children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(15,23,42,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div className="card" style={{
        maxWidth: 380, width: '100%', padding: '32px 28px',
        textAlign: 'center', boxShadow: 'var(--shadow-xl)',
      }}>
        {children}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
    </svg>
  )
}

const centerFlex = {
  minHeight: '100vh', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
}
const actionBtn = {
  all: 'unset', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '11px 26px', borderRadius: 'var(--radius-sm)',
  color: '#fff', fontSize: 15, fontWeight: 600,
  letterSpacing: '-.1px',
}
const actionBtnSecondary = {
  all: 'unset', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '11px 20px', borderRadius: 'var(--radius-sm)',
  border: '1.5px solid var(--border-md)',
  color: 'var(--text-2)', fontSize: 15, fontWeight: 500,
}
