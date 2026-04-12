import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { selectAndShuffleQuestions } from '../lib/seed'
import { formatDbError } from '../lib/errors'

const SESSION_KEY = (batchId, rollNumber) => `bv_session_${batchId}_${rollNumber}`

/**
 * useExamState — manages the full student exam session lifecycle.
 *
 * Security hardening:
 * - Questions fetched via get_exam_questions RPC (correct_answer stripped server-side)
 * - is_correct set by a BEFORE INSERT trigger on responses (not client-computed)
 * - Submission via submit_exam RPC (server-side scoring)
 * - get_my_attempt passes student name for ownership verification
 * - Session token (3.2): prevents concurrent sessions across browser tabs
 */
export function useExamState({ batch, rollNumber, studentName, email }) {
  const [status,       setStatus]       = useState('loading') // 'loading' | 'ready' | 'submitting' | 'submitted' | 'error'
  const [attemptId,    setAttemptId]    = useState(null)
  const [sessionToken, setSessionToken] = useState(null)
  const [questions,    setQuestions]    = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answeredMap,  setAnsweredMap]  = useState({})
  const [result,       setResult]       = useState(null)
  const [error,        setError]        = useState(null)

  const batchId = batch?.id

  useEffect(() => {
    if (!batch || !rollNumber || !studentName) return
    initExam()
  }, [batch?.id, rollNumber, studentName, email])

  async function initExam() {
    try {
      setStatus('loading')

      // Guard: block entry if exam window has already closed
      const examEndMs = new Date(batch.scheduled_start).getTime() + batch.duration_minutes * 60 * 1000
      if (Date.now() > examEndMs) {
        throw new Error('The exam time window has already closed. Please contact your invigilator.')
      }

      // 1. Check for existing attempt (refresh recovery)
      const { data: existing } = await supabase.rpc('get_my_attempt', {
        p_batch_id:     batchId,
        p_roll_number:  rollNumber,
        p_student_name: studentName,
      })

      let currentAttemptId
      let currentToken

      if (existing && existing.length > 0) {
        const attempt = existing[0]
        if (attempt.submitted_at) {
          setResult({ alreadySubmitted: true })
          setStatus('submitted')
          return
        }

        // 3.2 Session token validation: detect concurrent tab
        const storedToken = sessionStorage.getItem(SESSION_KEY(batchId, rollNumber))
        if (attempt.session_token && storedToken && storedToken !== attempt.session_token) {
          throw new Error('This exam is already open in another window. Only one session is allowed.')
        }

        // Restore token into sessionStorage (handles page refresh in same tab)
        if (attempt.session_token) {
          sessionStorage.setItem(SESSION_KEY(batchId, rollNumber), attempt.session_token)
          currentToken = attempt.session_token
        }

        currentAttemptId = attempt.id
      } else {
        // Create new attempt with session token (3.2)
        const token = crypto.randomUUID()
        const { data: newAttempt, error: insertError } = await supabase
          .from('attempts')
          .insert({
            batch_id: batchId,
            roll_number: rollNumber,
            student_name: studentName,
            email: email || null,
            session_token: token,
          })
          .select('id')
          .single()

        if (insertError) {
          if (insertError.code === '23505') {
            throw new Error('This roll number has already been registered for this exam.')
          }
          throw insertError
        }

        sessionStorage.setItem(SESSION_KEY(batchId, rollNumber), token)
        currentToken = token
        currentAttemptId = newAttempt.id
      }

      setAttemptId(currentAttemptId)
      setSessionToken(currentToken)

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

      // 4. Recover previous answers on refresh
      if (existing && existing.length > 0) {
        const { data: prevResponses } = await supabase.rpc('get_my_responses', {
          p_attempt_id: currentAttemptId,
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
  }

  /**
   * Submit a single response and advance.
   */
  const submitAnswer = useCallback(async (selectedLabel, isFinal = false) => {
    const question = questions[currentIndex]
    if (!question || !attemptId) return

    // 3.2 Session token check before each submission
    const storedToken = sessionStorage.getItem(SESSION_KEY(batchId, rollNumber))
    if (sessionToken && storedToken && storedToken !== sessionToken) {
      setError('This exam is already open in another window. Only one session is allowed.')
      setStatus('error')
      return
    }

    const selectedOption = question.options.find(o => o.label === selectedLabel)
    const originalLabel = selectedOption.originalLabel

    setAnsweredMap(prev => ({ ...prev, [question.questionId]: originalLabel }))

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
        attempt_id:      attemptId,
        question_id:     question.questionId,
        selected_answer: originalLabel,
        is_correct:      false,  // overwritten server-side by trigger
      })
    } catch (err) {
      console.error('Failed to save response:', err)
      // Non-fatal: continue exam
    }

    if (isFinal) {
      await finalizeSubmission()
    } else {
      setCurrentIndex(i => i + 1)
    }
  }, [questions, currentIndex, attemptId, sessionToken, batchId, rollNumber])

  /**
   * Auto-submit on timer expiry.
   */
  const autoSubmit = useCallback(async () => {
    if (status === 'submitting' || status === 'submitted') return
    await finalizeSubmission()
  }, [status, attemptId])

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
      setError(formatDbError(err, 'Submission failed. Please contact the invigilator.'))
    }
  }

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
    submitAnswer,
    autoSubmit,
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
