import { useState, useEffect, useRef } from 'react'
import { useTimer } from '../../hooks/useTimer'
import { useExamState } from '../../hooks/useExamState'

export function ExamScreen({ batch, rollNumber, studentName, onComplete }) {
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submittingAnswer, setSubmittingAnswer] = useState(false)
  const autoSubmitCalledRef = useRef(false)

  const {
    status,
    currentQuestion,
    currentIndex,
    totalQuestions,
    result,
    error,
    submitAnswer,
    autoSubmit,
  } = useExamState({ batch, rollNumber, studentName })

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

  const { remainingFormatted, isUrgent, isExpired } = useTimer({
    scheduledStart: batch.scheduled_start,
    durationMinutes: batch.duration_minutes,
    onTimeUp: handleTimeUp,
    onBatchEnded: handleBatchEnded,
    batchId: batch.id,
    enabled: status === 'ready',
  })

  // Reset selected answer when question changes
  useEffect(() => {
    setSelectedLabel(null)
    setShowConfirm(false)
  }, [currentIndex])

  // Transition to result screen when done
  useEffect(() => {
    if (status === 'submitted' && result) {
      onComplete(result)
    }
  }, [status, result])

  async function handleNext() {
    if (!selectedLabel || submittingAnswer) return
    setSubmittingAnswer(true)
    await submitAnswer(selectedLabel, isLastQuestion)
    setSubmittingAnswer(false)
  }

  function handleSubmitClick() {
    if (!selectedLabel) return
    setShowConfirm(true)
  }

  async function handleConfirmSubmit() {
    setShowConfirm(false)
    if (!selectedLabel || submittingAnswer) return
    setSubmittingAnswer(true)
    await submitAnswer(selectedLabel, true)
    setSubmittingAnswer(false)
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Preparing your exam...</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <p className="text-red-700 font-medium mb-2">Error</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'submitting') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600 text-sm">Submitting your answers...</p>
        </div>
      </div>
    )
  }

  if (!currentQuestion) return null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{batch.name}</p>
            <p className="text-xs text-gray-500">{rollNumber} · {studentName}</p>
          </div>
          <div className={`text-2xl font-mono font-bold tabular-nums ${isUrgent ? 'text-red-600' : 'text-gray-900'}`}>
            {remainingFormatted}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Question {currentIndex + 1} of {totalQuestions}</span>
            <span className="text-xs text-gray-400">{Math.round(((currentIndex) / totalQuestions) * 100)}% complete</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-indigo-600 h-1.5 rounded-full transition-all"
              style={{ width: `${(currentIndex / totalQuestions) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide">Question {currentIndex + 1}</p>
            <p className="text-lg text-gray-900 leading-relaxed">{currentQuestion.questionText}</p>
          </div>

          <div className="space-y-3 mb-8">
            {currentQuestion.options.map(option => (
              <label
                key={option.label}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedLabel === option.label
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="answer"
                  value={option.label}
                  checked={selectedLabel === option.label}
                  onChange={() => setSelectedLabel(option.label)}
                  className="mt-0.5 accent-indigo-600"
                />
                <div className="flex items-start gap-2">
                  <span className={`text-sm font-semibold w-5 flex-shrink-0 ${
                    selectedLabel === option.label ? 'text-indigo-700' : 'text-gray-500'
                  }`}>
                    {option.label}.
                  </span>
                  <span className={`text-sm leading-relaxed ${
                    selectedLabel === option.label ? 'text-indigo-900' : 'text-gray-700'
                  }`}>
                    {option.text}
                  </span>
                </div>
              </label>
            ))}
          </div>

          <div className="flex justify-end">
            {isLastQuestion ? (
              <button
                onClick={handleSubmitClick}
                disabled={!selectedLabel || submittingAnswer}
                className="bg-green-600 text-white px-8 py-3 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40 transition-colors"
              >
                Submit Exam
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!selectedLabel || submittingAnswer}
                className="bg-indigo-600 text-white px-8 py-3 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {submittingAnswer ? 'Saving...' : 'Next →'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirm submit dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Submit Exam?</h3>
            <p className="text-sm text-gray-600 mb-1">
              You are about to submit your exam. This cannot be undone.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Answered: {currentIndex + 1} of {totalQuestions} questions.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmSubmit}
                className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700"
              >
                Yes, Submit
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Time up overlay */}
      {isExpired && status !== 'submitting' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="text-4xl mb-3">⏰</div>
            <h3 className="font-bold text-gray-900 text-xl mb-2">Time's up!</h3>
            <p className="text-gray-600 text-sm">Submitting your answers...</p>
          </div>
        </div>
      )}
    </div>
  )
}
