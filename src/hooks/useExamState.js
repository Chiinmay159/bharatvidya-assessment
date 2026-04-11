import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { selectAndShuffleQuestions } from '../lib/seed'

/**
 * useExamState — manages the full student exam session lifecycle.
 *
 * Responsibilities:
 * - Creates or recovers an attempt (refresh-safe via get_my_attempt RPC)
 * - Fetches and randomizes questions
 * - Tracks current question index and already-answered questions
 * - Submits individual responses (per-click, not batched)
 * - Handles final submission (score computation + attempt update)
 */
export function useExamState({ batch, rollNumber, studentName }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'submitting' | 'submitted' | 'error'
  const [attemptId, setAttemptId] = useState(null)
  const [questions, setQuestions] = useState([]) // shuffled ShuffledQuestion[]
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answeredMap, setAnsweredMap] = useState({}) // { [questionId]: originalLabel }
  const [result, setResult] = useState(null) // { score, total }
  const [error, setError] = useState(null)

  const batchId = batch?.id

  useEffect(() => {
    if (!batch || !rollNumber || !studentName) return
    initExam()
  }, [batch?.id, rollNumber, studentName])

  async function initExam() {
    try {
      setStatus('loading')

      // 1. Check for existing attempt (refresh recovery)
      const { data: existing } = await supabase.rpc('get_my_attempt', {
        p_batch_id: batchId,
        p_roll_number: rollNumber,
      })

      let currentAttemptId

      if (existing && existing.length > 0) {
        const attempt = existing[0]
        if (attempt.submitted_at) {
          // Already submitted — go to result
          setResult({ alreadySubmitted: true })
          setStatus('submitted')
          return
        }
        currentAttemptId = attempt.id
      } else {
        // Create new attempt
        const { data: newAttempt, error: insertError } = await supabase
          .from('attempts')
          .insert({ batch_id: batchId, roll_number: rollNumber, student_name: studentName })
          .select('id')
          .single()
        if (insertError) {
          if (insertError.code === '23505') {
            throw new Error('This roll number has already been registered for this exam.')
          }
          throw insertError
        }
        currentAttemptId = newAttempt.id
      }

      setAttemptId(currentAttemptId)

      // 2. Fetch all questions for this batch (sorted by sort_order)
      const { data: rawQuestions, error: qError } = await supabase
        .from('questions')
        .select('*')
        .eq('batch_id', batchId)
        .order('sort_order', { ascending: true })
      if (qError) throw qError

      // 3. Randomize question selection and option order
      const shuffled = selectAndShuffleQuestions(
        rawQuestions,
        rollNumber,
        batchId,
        batch.questions_per_student ?? null
      )
      setQuestions(shuffled)

      // 4. Recover previously answered questions
      if (existing && existing.length > 0) {
        const { data: prevResponses } = await supabase.rpc('get_my_responses', {
          p_attempt_id: currentAttemptId,
        })
        if (prevResponses?.length > 0) {
          const map = {}
          prevResponses.forEach(r => { map[r.question_id] = r.selected_answer })
          setAnsweredMap(map)

          // Advance to first unanswered question
          const answeredIds = new Set(prevResponses.map(r => r.question_id))
          const firstUnanswered = shuffled.findIndex(q => !answeredIds.has(q.questionId))
          setCurrentIndex(firstUnanswered === -1 ? shuffled.length - 1 : firstUnanswered)
        }
      }

      setStatus('ready')
    } catch (err) {
      setError(err.message || 'Failed to start exam')
      setStatus('error')
    }
  }

  /**
   * Submit a single response and advance to next question.
   * @param {string} selectedLabel — the DISPLAY label (A/B/C/D as shown)
   * @param {boolean} isFinal — true on the last question
   */
  const submitAnswer = useCallback(async (selectedLabel, isFinal = false) => {
    const question = questions[currentIndex]
    if (!question || !attemptId) return

    // Map display label back to original label for storage
    const selectedOption = question.options.find(o => o.label === selectedLabel)
    const originalLabel = selectedOption.originalLabel
    const isCorrect = originalLabel === question.options.find(o => o.label === question.correctLabel).originalLabel

    // Optimistically advance UI
    setAnsweredMap(prev => ({ ...prev, [question.questionId]: originalLabel }))

    // Retry helper
    async function insertWithRetry(payload, retries = 3) {
      for (let attempt = 0; attempt < retries; attempt++) {
        const { error } = await supabase.from('responses').insert(payload)
        if (!error) return
        if (attempt < retries - 1) await sleep(500 * Math.pow(2, attempt))
        else throw error
      }
    }

    try {
      await insertWithRetry({
        attempt_id: attemptId,
        question_id: question.questionId,
        selected_answer: originalLabel,
        is_correct: isCorrect,
      })
    } catch (err) {
      console.error('Failed to save response:', err)
      // Continue anyway — auto-submit will handle final score
    }

    if (isFinal) {
      await finalizeSubmission()
    } else {
      setCurrentIndex(i => i + 1)
    }
  }, [questions, currentIndex, attemptId])

  /**
   * Auto-submit on timer expiry — submits whatever has been answered.
   */
  const autoSubmit = useCallback(async () => {
    if (status === 'submitting' || status === 'submitted') return
    await finalizeSubmission()
  }, [status, attemptId, answeredMap, questions])

  async function finalizeSubmission() {
    if (!attemptId) return
    setStatus('submitting')
    try {
      // Compute score from answered map
      let score = 0
      let total = questions.length
      questions.forEach(q => {
        const answered = answeredMap[q.questionId]
        if (answered) {
          const opt = q.options.find(o => o.originalLabel === answered)
          if (opt && opt.label === q.correctLabel) score++
        }
      })

      const { error } = await supabase
        .from('attempts')
        .update({ submitted_at: new Date().toISOString(), score, total_questions: total })
        .eq('id', attemptId)
      if (error) throw error

      setResult({ score, total, percentage: Math.round((score / total) * 100) })
      setStatus('submitted')
    } catch (err) {
      console.error('Submission error:', err)
      setStatus('error')
      setError('Submission failed. Please contact the invigilator.')
    }
  }

  const currentQuestion = questions[currentIndex] ?? null
  const totalQuestions = questions.length

  return {
    status,
    currentQuestion,
    currentIndex,
    totalQuestions,
    answeredMap,
    result,
    error,
    submitAnswer,
    autoSubmit,
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
