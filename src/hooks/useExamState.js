import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { selectAndShuffleQuestions } from '../lib/seed'
import { formatDbError } from '../lib/errors'

/**
 * useExamState — manages the full student exam session lifecycle.
 *
 * Security hardening:
 * - Questions fetched via get_exam_questions RPC (correct_answer stripped server-side)
 * - is_correct set by a BEFORE INSERT trigger on responses (not client-computed)
 * - Submission via submit_exam RPC (server-side scoring)
 * - Attempt creation via create_attempt RPC (server-side access-code enforcement)
 * - get_my_attempt requires student name for ownership verification
 * - get_my_responses requires roll_number + student_name for ownership
 * - UNIQUE(attempt_id, question_id) on responses prevents score tampering
 * - UNIQUE(batch_id, roll_number) on attempts prevents duplicate attempts
 */
export function useExamState({ batch, rollNumber, studentName, email, accessCode }) {
  const [status,       setStatus]       = useState('loading') // 'loading' | 'ready' | 'submitting' | 'submitted' | 'error'
  const [attemptId,    setAttemptId]    = useState(null)
  const [questions,    setQuestions]    = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answeredMap,  setAnsweredMap]  = useState({})
  const [result,       setResult]       = useState(null)
  const [error,        setError]        = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const failedQueueRef = useRef([]) // { questionId, originalLabel, attemptId }

  const batchId = batch?.id

  const initExam = useCallback(async () => {
    try {
      setStatus('loading')

      // Guard: block entry if exam window has already closed (using server time)
      const { data: serverTimeData } = await supabase.rpc('get_server_time')
      const serverNow = serverTimeData ? new Date(serverTimeData).getTime() : Date.now()
      const examEndMs = new Date(batch.scheduled_start).getTime() + batch.duration_minutes * 60 * 1000
      if (serverNow > examEndMs) {
        throw new Error('The exam time window has already closed. Please contact your invigilator.')
      }

      // 1. Check for existing attempt (refresh recovery)
      const { data: existing } = await supabase.rpc('get_my_attempt', {
        p_batch_id:     batchId,
        p_roll_number:  rollNumber,
        p_student_name: studentName,
      })

      let currentAttemptId

      if (existing && existing.length > 0) {
        const attempt = existing[0]
        if (attempt.submitted_at) {
          setResult({ alreadySubmitted: true })
          setStatus('submitted')
          return
        }
        currentAttemptId = attempt.id
      } else {
        // Create new attempt via server-side RPC (enforces access code + unique constraint)
        const { data: newAttemptId, error: insertError } = await supabase
          .rpc('create_attempt', {
            p_batch_id:     batchId,
            p_roll_number:  rollNumber,
            p_student_name: studentName,
            p_email:        email || null,
            p_access_code:  accessCode || null,
          })

        if (insertError) {
          // Handle unique constraint violation (race condition)
          if (insertError.code === '23505' || insertError.message?.includes('already been registered')) {
            throw new Error('This roll number has already been registered for this exam.')
          }
          throw insertError
        }
        currentAttemptId = newAttemptId
      }

      setAttemptId(currentAttemptId)

      // 2. Fetch questions via RPC — correct_answer stripped server-side
      const { data: rawQuestions, error: qError } = await supabase
        .rpc('get_exam_questions', { p_batch_id: batchId })
      if (qError) throw qError

      if (!rawQuestions || rawQuestions.length === 0) {
        throw new Error('No questions found for this exam. Please contact your invigilator.')
      }

      // 3. Deterministic shuffle
      const shuffled = selectAndShuffleQuestions(
        rawQuestions, rollNumber, batchId, batch.questions_per_student ?? null
      )
      setQuestions(shuffled)

      // 4. Recover previous answers on refresh (ownership-verified)
      if (existing && existing.length > 0) {
        const { data: prevResponses } = await supabase.rpc('get_my_responses', {
          p_attempt_id:   currentAttemptId,
          p_roll_number:  rollNumber,
          p_student_name: studentName,
        })
        if (prevResponses?.length > 0) {
          const map = {}
          prevResponses.forEach(r => { map[r.question_id] = r.selected_answer })
          setAnsweredMap(map)
          const answeredIds = new Set(prevResponses.map(r => r.question_id))
          const firstUnanswered = shuffled.findIndex(q => !answeredIds.has(q.questionId))
          setCurrentIndex(firstUnanswered === -1 ? shuffled.length - 1 : firstUnanswered)
        }
      }

      setStatus('ready')
    } catch (err) {
      setError(formatDbError(err, 'Failed to start exam. Please try again.'))
      setStatus('error')
    }
  }, [batch, batchId, rollNumber, studentName, email, accessCode])

  useEffect(() => {
    if (!batch || !rollNumber || !studentName) return
    initExam()
  }, [batch, rollNumber, studentName, email, accessCode, initExam])

  /** Drain the failed queue before final submission. */
  const drainFailedQueue = useCallback(async () => {
    const queue = [...failedQueueRef.current]
    if (queue.length === 0) return
    const remaining = []
    for (const item of queue) {
      try {
        const { error } = await supabase.from('responses').insert({
          attempt_id:      item.attemptId,
          question_id:     item.questionId,
          selected_answer: item.originalLabel,
          is_correct:      false, // overwritten server-side
        })
        // 23505 = unique violation → answer already saved (first attempt succeeded)
        if (error && error.code !== '23505') remaining.push(item)
      } catch {
        remaining.push(item)
      }
    }
    failedQueueRef.current = remaining
    setPendingCount(remaining.length)
  }, [])

  const finalizeSubmission = useCallback(async () => {
    if (!attemptId) return
    setStatus('submitting')
    try {
      // Drain any queued failed responses before scoring — try twice
      await drainFailedQueue()
      if (failedQueueRef.current.length > 0) {
        await sleep(1000)
        await drainFailedQueue()
      }

      const unsaved = failedQueueRef.current.length
      if (unsaved > 0) {
        console.warn(`Submitting with ${unsaved} unsaved answer(s)`)
      }

      const { data, error } = await supabase.rpc('submit_exam', { p_attempt_id: attemptId })
      if (error) throw error
      const { score, total_questions: total } = data[0]
      const pct = total > 0 ? Math.round((score / total) * 100) : 0
      setResult({ score, total, percentage: pct })
      setStatus('submitted')
    } catch (err) {
      console.error('Submission error:', err)
      setStatus('error')
      setError(formatDbError(err, 'Submission failed. Please contact the invigilator.'))
    }
  }, [attemptId, drainFailedQueue])

  /**
   * Submit a single response and advance.
   */
  const submitAnswer = useCallback(async (selectedLabel, isFinal = false) => {
    const question = questions[currentIndex]
    if (!question || !attemptId) return

    const selectedOption = question.options.find(o => o.label === selectedLabel)
    const originalLabel = selectedOption.originalLabel

    setAnsweredMap(prev => ({ ...prev, [question.questionId]: originalLabel }))

    async function insertWithRetry(payload, retries = 3) {
      for (let attempt = 0; attempt < retries; attempt++) {
        const { error } = await supabase.from('responses').insert(payload)
        if (!error) return
        // 23505 = unique violation → answer already saved (idempotent)
        if (error.code === '23505') return
        if (attempt < retries - 1) await sleep(500 * Math.pow(2, attempt))
        else throw error
      }
    }

    try {
      await insertWithRetry({
        attempt_id:      attemptId,
        question_id:     question.questionId,
        selected_answer: originalLabel,
        is_correct:      false,  // overwritten server-side by trigger
      })
    } catch (err) {
      console.error('Failed to save response after retries, queuing:', err)
      // Push to offline queue for retry before final submission
      failedQueueRef.current.push({ questionId: question.questionId, originalLabel, attemptId })
      setPendingCount(failedQueueRef.current.length)
    }

    if (isFinal) {
      await finalizeSubmission()
    } else {
      setCurrentIndex(i => i + 1)
    }
  }, [questions, currentIndex, attemptId, finalizeSubmission])

  /**
   * Auto-submit on timer expiry.
   */
  const autoSubmit = useCallback(async () => {
    if (status === 'submitting' || status === 'submitted') return
    await finalizeSubmission()
  }, [status, finalizeSubmission])

  const currentQuestion = questions[currentIndex] ?? null
  const totalQuestions  = questions.length

  return {
    status,
    attemptId,
    currentQuestion,
    currentIndex,
    totalQuestions,
    answeredMap,
    result,
    error,
    pendingCount,
    submitAnswer,
    autoSubmit,
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
