import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useTimer } from '../../hooks/useTimer'
import { useExamState } from '../../hooks/useExamState'

export function ExamScreen({ batch, rollNumber, studentName, email, onComplete }) {
  const [selectedLabel,    setSelectedLabel]    = useState(null)
  const [showConfirm,      setShowConfirm]      = useState(false)
  const [submittingAnswer, setSubmittingAnswer] = useState(false)
  const [duplicateSession, setDuplicateSession] = useState(false)
  const autoSubmitCalledRef = useRef(false)

  const {
    status, currentQuestion, currentIndex, totalQuestions,
    attemptId, result, error, submitAnswer, autoSubmit,
  } = useExamState({ batch, rollNumber, studentName, email })

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
  useEffect(() => { if (status === 'submitted' && result) onComplete(result) }, [status, result, onComplete])

  // 3.1 Tab switch detection
  useEffect(() => {
    if (!attemptId || status !== 'ready') return
    let currentSwitchId = null
    let mounted = true

    async function handleVisibilityChange() {
      if (!mounted) return
      if (document.hidden) {
        const { data } = await supabase
          .from('tab_switches').insert({ attempt_id: attemptId }).select('id').single()
        if (data && mounted) currentSwitchId = data.id
      } else {
        if (currentSwitchId) {
          await supabase.from('tab_switches')
            .update({ returned_at: new Date().toISOString() }).eq('id', currentSwitchId)
          currentSwitchId = null
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => { mounted = false; document.removeEventListener('visibilitychange', handleVisibilityChange) }
  }, [attemptId, status])

  // 3.2 Duplicate session detection
  useEffect(() => {
    if (status === 'error' && error?.includes('already open in another window')) {
      setDuplicateSession(true)
    }
  }, [status, error])

  async function handleNext() {
    if (!selectedLabel || submittingAnswer) return
    setSubmittingAnswer(true)
    await submitAnswer(selectedLabel, isLastQuestion)
    setSubmittingAnswer(false)
  }

  /* ── Duplicate session ──────────────────────────────────── */
  if (duplicateSession) {
    return (
      <div style={centerFlex}>
        <div className="card" style={{ maxWidth: 400, padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}>🔒</div>
          <h2 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700 }}>Exam open in another window</h2>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14, lineHeight: 1.65 }}>
            Only one active session is allowed per student. Close all other tabs with this exam, then refresh.
          </p>
        </div>
      </div>
    )
  }

  /* ── Loading ──────────────────────────────────────────────  */
  if (status === 'loading') {
    return (
      <div style={centerFlex}>
        <div style={{ textAlign: 'center', color: 'var(--text-2)' }}>
          <Spinner size={28} />
          <p style={{ marginTop: 14, fontSize: 14 }}>Preparing your exam…</p>
        </div>
      </div>
    )
  }

  if (status === 'submitting') {
    return (
      <div style={centerFlex}>
        <div style={{ textAlign: 'center', color: 'var(--text-2)' }}>
          <Spinner size={28} />
          <p style={{ marginTop: 14, fontSize: 14 }}>Submitting your answers…</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={{ ...centerFlex, padding: 20 }}>
        <div className="card" style={{ maxWidth: 380, padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>Something went wrong</p>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6 }}>{error}</p>
        </div>
      </div>
    )
  }

  if (!currentQuestion) {
    return (
      <div style={centerFlex}>
        <div className="card" style={{ maxWidth: 380, padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>No questions available</p>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>Please contact your invigilator.</p>
        </div>
      </div>
    )
  }

  const progress = totalQuestions > 0 ? (currentIndex / totalQuestions) * 100 : 0
  const timerColor = isUrgent ? 'var(--error)' : 'var(--text-1)'

  /* ── Exam UI ─────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Sticky header ──────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--surface)', borderBottom: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        {/* Progress bar */}
        <div style={{ height: 4, background: 'var(--surface-2)' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', transition: 'width .4s var(--ease-smooth)', borderRadius: '0 2px 2px 0' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', maxWidth: 760, margin: '0 auto', width: '100%', gap: 12 }}>
          {/* Batch + question counter */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {batch.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
              Question {currentIndex + 1} of {totalQuestions}
            </div>
          </div>

          {/* Timer */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
            <div
              className={`font-timer ${isUrgent ? 'u-timer-urgent' : ''}`}
              style={{ fontSize: 24, fontWeight: 700, color: timerColor, lineHeight: 1, transition: 'color .4s ease' }}
            >
              {remainingFormatted}
            </div>
            {isUrgent && (
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--error)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Time running low
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Question area ───────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 20px 48px' }}>
        <div style={{ width: '100%', maxWidth: 680 }}>

          {/* Question card */}
          <div className="card" style={{ padding: '24px 26px', marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 10 }}>
              Question {currentIndex + 1}
            </div>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.7, color: 'var(--text-1)', fontWeight: 500 }}>
              {currentQuestion.questionText}
            </p>
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 28 }}>
            {currentQuestion.options.map(option => {
              const isSelected = selectedLabel === option.label
              return (
                <label
                  key={option.label}
                  className={`option-card${isSelected ? ' is-selected' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name="answer"
                    value={option.label}
                    checked={isSelected}
                    onChange={() => setSelectedLabel(option.label)}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                  />

                  {/* Letter badge */}
                  <div style={{
                    flexShrink: 0,
                    width: 32, height: 32, borderRadius: 8,
                    background: isSelected ? 'var(--accent)' : 'var(--surface-2)',
                    border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border-md)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    color: isSelected ? '#fff' : 'var(--text-2)',
                    transition: 'all var(--t-fast) var(--ease-smooth)',
                  }}>
                    {option.label}
                  </div>

                  {/* Option text */}
                  <span style={{
                    flex: 1, fontSize: 15, lineHeight: 1.55,
                    color: isSelected ? 'var(--accent-deep)' : 'var(--text-1)',
                    fontWeight: isSelected ? 500 : 400,
                    transition: 'color var(--t-fast) var(--ease-smooth)',
                  }}>
                    {option.text}
                  </span>

                  {/* Checkmark */}
                  {isSelected && (
                    <div style={{ flexShrink: 0, color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
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
                className={`btn ${selectedLabel ? 'btn-success' : ''}`}
                style={{ padding: '12px 28px', minWidth: 160, background: !selectedLabel ? 'var(--border)' : undefined, color: !selectedLabel ? 'var(--text-3)' : undefined, boxShadow: !selectedLabel ? 'none' : undefined }}
              >
                Submit Exam
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!selectedLabel || submittingAnswer}
                className={`btn ${selectedLabel && !submittingAnswer ? 'btn-primary' : ''}`}
                style={{ padding: '12px 28px', minWidth: 140, background: !selectedLabel || submittingAnswer ? 'var(--border)' : undefined, color: !selectedLabel || submittingAnswer ? 'var(--text-3)' : undefined, boxShadow: !selectedLabel || submittingAnswer ? 'none' : undefined }}
              >
                {submittingAnswer
                  ? <><Spinner size={15} /> Saving…</>
                  : <>Next <span style={{ marginLeft: 2 }}>→</span></>
                }
              </button>
            )}
          </div>
        </div>
      </main>

      {/* ── Confirm submit modal ─────────────────────────────── */}
      {showConfirm && (
        <Overlay>
          <div style={{ fontSize: 36, marginBottom: 14 }}>📋</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, letterSpacing: '-.2px' }}>Submit your exam?</h2>
          <p style={{ margin: '0 0 6px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6 }}>
            You are about to submit. This action cannot be undone.
          </p>
          <p style={{ margin: '0 0 26px', color: 'var(--text-3)', fontSize: 13 }}>
            {currentIndex + 1} of {totalQuestions} questions answered.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={async () => {
                setShowConfirm(false)
                setSubmittingAnswer(true)
                await submitAnswer(selectedLabel, true)
                setSubmittingAnswer(false)
              }}
              className="btn btn-success"
              style={{ flex: 1, padding: '12px 16px' }}
            >
              Yes, submit
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="btn btn-secondary"
              style={{ flex: 1, padding: '12px 16px' }}
            >
              Go back
            </button>
          </div>
        </Overlay>
      )}

      {/* ── Time-up overlay ─────────────────────────────────── */}
      {isExpired && status !== 'submitting' && (
        <Overlay>
          <div style={{ fontSize: 44, marginBottom: 14 }}>⏰</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>Time's up!</h2>
          <p style={{ margin: '0 0 20px', color: 'var(--text-2)', fontSize: 14 }}>Submitting your answers…</p>
          <Spinner size={28} />
        </Overlay>
      )}
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────── */
function Overlay({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(2px)' }}>
      <div className="card u-slide-up" style={{ maxWidth: 360, width: '100%', padding: '36px 28px', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}>
        {children}
      </div>
    </div>
  )
}

function Spinner({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="u-spin" style={{ display: 'block', margin: '0 auto' }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray="31" strokeDashoffset="10" />
    </svg>
  )
}

const centerFlex = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }
