import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { selectAndShuffleQuestions } from '../lib/seed'

/**
 * useExamState — manages the full student exam session lifecycle.
 *
 * Security hardening:
 * - Questions are fetched via get_exam_questions RPC (correct_answer stripped server-side)
 * - is_correct is set by a BEFORE INSERT trigger on responses (not client-computed)
 * - Submission calls submit_exam RPC (server-side scoring, not client-computed)
 * - get_my_attempt passes student name for ownership verification (P1-B)
 * - No stale-closure risk: finalizeSubmission no longer reads answeredMap
 */
export function useExamState({ batch, rollNumber, studentName }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'submitting' | 'submitted' | 'error'
  const [attemptId, setAttemptId] = useState(null)
  const [questions, setQuestions] = useState([]) // shuffled ShuffledQuestion[]
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answeredMap, setAnsweredMap] = useState({}) // { [questionId]: originalLabel }
  const [result, setResult] = useState(null) // { score, total, percentage }
  const [error, setError] = useState(null)

  const batchId = batch?.id

  useEffect(() => {
    if (!batch || !rollNumber || !studentName) return
    initExam()
  }, [batch?.id, rollNumber, studentName])

  async function initExam() {
    try {
      setStatus('loading')

      // Guard: block entry if the exam window has already closed
      const examEndMs = new Date(batch.scheduled_start).getTime()
        + batch.duration_minutes * 60 * 1000
      if (Date.now() > examEndMs) {
        throw new Error(
          'The exam time window has already closed. Please contact your invigilator.'
        )
      }

      // 1. Check for existing attempt (refresh recovery)
      // P1-B: pass student name so the RPC verifies ownership
      const { data: existing } = await supabase.rpc('get_my_attempt', {
        p_batch_id:     batchId,
        p_roll_number:  rollNumber,
        p_student_name: studentName,
      })

      let currentAttemptId

      if (existing && existing.length > 0) {
        const attempt = existing[0]
        if (attempt.submitted_at) {
          // Already submitted — go to result screen
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

      // 2. Fetch questions via RPC — correct_answer is stripped server-side (P0-A)
      const { data: rawQuestions, error: qError } = await supabase
        .rpc('get_exam_questions', { p_batch_id: batchId })
      if (qError) throw qError

      // 3. Guard: questions must exist before proceeding
      if (!rawQuestions || rawQuestions.length === 0) {
        throw new Error(
          'No questions found for this exam. Please contact your invigilator.'
        )
      }

      // 4. Randomize question selection and option order (deterministic per student)
      const shuffled = selectAndShuffleQuestions(
        rawQuestions,
        rollNumber,
        batchId,
        batch.questions_per_student ?? null
      )
      setQuestions(shuffled)

      // 5. Recover previously answered questions on refresh
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
   * @param {string} selectedLabel — the DISPLAY label (A/B/C/D as shown on screen)
   * @param {boolean} isFinal — true on the last question
   */
  const submitAnswer = useCallback(async (selectedLabel, isFinal = false) => {
    const question = questions[currentIndex]
    if (!question || !attemptId) return

    // Map display label back to original label for storage
    const selectedOption = question.options.find(o => o.label === selectedLabel)
    const originalLabel = selectedOption.originalLabel

    // Optimistically update UI
    setAnsweredMap(prev => ({ ...prev, [question.questionId]: originalLabel }))

    // Retry helper for network resilience
    async function insertWithRetry(payload, retries = 3) {
      for (let attempt = 0; attempt < retries; attempt++) {
        const { error } = await supabase.from('responses').insert(payload)
        if (!error) return
        if (attempt < retries - 1) await sleep(500 * Math.pow(2, attempt))
        else throw error
      }
    }

    try {
      // P0-B: is_correct is computed by the set_is_correct BEFORE INSERT trigger.
      // We send false as a placeholder — the trigger overwrites it.
      await insertWithRetry({
        attempt_id:      attemptId,
        question_id:     question.questionId,
        selected_answer: originalLabel,
        is_correct:      false,   // overwritten server-side by trigger
      })
    } catch (err) {
      console.error('Failed to save response:', err)
      // Non-fatal: continue exam. submit_exam will count what's in DB.
    }

    if (isFinal) {
      await finalizeSubmission()
    } else {
      setCurrentIndex(i => i + 1)
    }
  }, [questions, currentIndex, attemptId])

  /**
   * Auto-submit on timer expiry — submits whatever has been answered so far.
   */
  const autoSubmit = useCallback(async () => {
    if (status === 'submitting' || status === 'submitted') return
    await finalizeSubmission()
  }, [status, attemptId])

  /**
   * Finalize submission via submit_exam RPC.
   * P0-B: scoring is computed server-side from the responses table.
   * P2-A: no longer reads answeredMap, so no stale-closure risk.
   */
  async function finalizeSubmission() {
    if (!attemptId) return
    setStatus('submitting')
    try {
      const { data, error } = await supabase.rpc('submit_exam', { p_attempt_id: attemptId })
      if (error) throw error

      const { score, total_questions: total } = data[0]
      const pct = total > 0 ? Math.round((score / total) * 100) : 0
      setResult({ score, total, percentage: pct })
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
