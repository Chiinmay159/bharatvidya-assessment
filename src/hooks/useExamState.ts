import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { selectAndShuffleQuestions, type BankQuestion, type ShuffledQuestion } from '../lib/seed'
import { formatDbError } from '../lib/errors'
import { hasCachedPaper, getDecryptedPaper } from '../lib/paper'

export type ExamStatus = 'loading' | 'ready' | 'submitting' | 'unsaved_warning' | 'submitted' | 'error'

/** Batch row fields used by the exam session. */
export interface ExamBatch {
  id: string
  scheduled_start: string
  duration_minutes: number
  questions_per_student?: number | null
  show_results?: boolean | null
  pass_percentage?: number | null
  max_attempts?: number | null
  status?: string | null
}

export interface ExamResult {
  alreadySubmitted?: boolean
  score: number | null
  total: number
  percentage: number | null
  showResults: boolean
  passPercentage: number | null
  canRetry: boolean
  attemptNumber: number
  maxAttempts: number
}

interface QueuedResponse {
  questionId: string
  originalLabel: string
  attemptId: string
  timeSpent?: number | null
}

export interface UseExamStateOptions {
  batch: ExamBatch | null | undefined
  rollNumber: string
  studentName: string
  email?: string | null
  accessCode?: string | null
  forceNewAttempt?: boolean
}

export interface UseExamStateResult {
  status: ExamStatus
  attemptId: string | null
  currentQuestion: ShuffledQuestion | null
  currentIndex: number
  totalQuestions: number
  answeredMap: Record<string, string>
  result: ExamResult | null
  error: string | null
  pendingCount: number
  unsavedCount: number
  /** Admin-granted time extension in minutes (0 if none), via exam_heartbeat */
  extraTimeMinutes: number
  submitAnswer: (selectedLabel: string, isFinal?: boolean, timeSpentMs?: number | null) => Promise<void>
  autoSubmit: () => Promise<void>
  retrySubmit: () => Promise<void>
  forceSubmit: () => Promise<void>
}

/** Minimal error shape narrowed from unknown caught values / Supabase errors. */
interface ErrorLike {
  message?: string
  code?: string
}

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
 * - UNIQUE(batch_id, roll_number, attempt_number) on attempts
 * - Session tokens enforced authoritatively: save_response and submit_exam
 *   both validate the token server-side (no anon INSERT policy on responses)
 * - Heartbeat via check_session detects when another window claims the session
 *
 * Retry support:
 * - forceNewAttempt=true creates a new attempt even when previous is submitted
 * - Seed includes attemptNumber for different questions per retry
 * - submit_exam returns can_retry, show_results, pass_percentage for result UI
 */
export function useExamState({ batch, rollNumber, studentName, email, accessCode, forceNewAttempt = false }: UseExamStateOptions): UseExamStateResult {
  const [status,       setStatus]       = useState<ExamStatus>('loading') // 'loading' | 'ready' | 'submitting' | 'unsaved_warning' | 'submitted' | 'error'
  const [attemptId,    setAttemptId]    = useState<string | null>(null)
  const [questions,    setQuestions]    = useState<ShuffledQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answeredMap,  setAnsweredMap]  = useState<Record<string, string>>({})
  const [result,       setResult]       = useState<ExamResult | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [unsavedCount, setUnsavedCount] = useState(0)
  // Admin-granted extension (minutes), delivered via exam_heartbeat
  const [extraTimeMinutes, setExtraTimeMinutes] = useState(0)
  const failedQueueRef = useRef<QueuedResponse[]>([]) // { questionId, originalLabel, attemptId }
  const sessionTokenRef = useRef<string | null>(null)

  const batchId = batch?.id

  const initExam = useCallback(async () => {
    try {
      setStatus('loading')
      if (!batch || !batchId) return

      // Guard: block entry if exam window has already closed (using server time)
      const { data: serverTimeData } = await supabase.rpc('get_server_time')
      const serverNow = serverTimeData ? new Date(serverTimeData as string).getTime() : Date.now()
      const examEndMs = new Date(batch.scheduled_start).getTime() + batch.duration_minutes * 60 * 1000
      if (serverNow > examEndMs) {
        throw new Error('The exam time window has already closed. Please contact your invigilator.')
      }

      // 1. Check for existing attempts (refresh recovery / retry detection)
      const { data: existing } = await supabase.rpc('get_my_attempt', {
        p_batch_id:     batchId,
        p_roll_number:  rollNumber,
        p_student_name: studentName,
      })

      let currentAttemptId: string
      let currentAttemptNumber = 1

      if (existing && existing.length > 0) {
        // existing[0] is the latest attempt (ordered by attempt_number DESC)
        const latest = existing[0]

        if (latest.submitted_at) {
          if (forceNewAttempt) {
            // Retry flow: create a new attempt
            currentAttemptNumber = existing.length + 1

            const { data: newAttemptId, error: insertError } = await supabase
              .rpc('create_attempt', {
                p_batch_id:     batchId,
                p_roll_number:  rollNumber,
                p_student_name: studentName,
                p_email:        email || null,
                p_access_code:  accessCode || null,
              })

            if (insertError) {
              if (insertError.message?.includes('Maximum attempts reached')) {
                throw new Error('You have used all available attempts for this exam.')
              }
              if (insertError.code === '23505' || insertError.message?.includes('already been registered')) {
                throw new Error('This roll number has already been registered for this exam.')
              }
              throw insertError
            }
            currentAttemptId = newAttemptId as string
          } else {
            // Not a retry — show the latest submitted result
            const showResults = batch.show_results !== false
            const passPercentage = batch.pass_percentage ?? null
            const attemptNum = latest.attempt_number ?? 1
            const maxAttempts = batch.max_attempts ?? 1

            // Compute actual percentage for retry logic (not shown to student when hidden)
            const actualPct = (latest.score != null && latest.total_questions > 0)
              ? Math.round((latest.score / latest.total_questions) * 100) : null
            // Display percentage — null when results are hidden
            const displayPct = showResults ? actualPct : null

            const canRetry = (
              attemptNum < maxAttempts
              && passPercentage != null
              && actualPct != null
              && actualPct < passPercentage
              && batch.status === 'active'
            )

            setResult({
              alreadySubmitted: true,
              score: showResults ? latest.score : null,
              total: latest.total_questions,
              percentage: displayPct,
              showResults,
              passPercentage,
              canRetry,
              attemptNumber: attemptNum,
              maxAttempts,
            })
            setStatus('submitted')
            return
          }
        } else {
          // Latest attempt is unsubmitted — resume it
          currentAttemptNumber = latest.attempt_number ?? 1
          currentAttemptId = latest.id
        }
      } else {
        // No existing attempts — create first one
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
        currentAttemptId = newAttemptId as string
      }

      setAttemptId(currentAttemptId)

      // 2. Claim session token (invalidates any prior window's token)
      const { data: token, error: sessionErr } = await supabase.rpc('claim_session', {
        p_attempt_id:   currentAttemptId,
        p_roll_number:  rollNumber,
        p_student_name: studentName,
      })
      if (sessionErr) throw sessionErr
      sessionTokenRef.current = token as string

      // 3. Get questions. Fast path (scale): decrypt the paper pre-fetched
      //    in the waiting room — only a tiny key RPC at start time.
      //    Fallback: direct get_exam_questions RPC (same server-side
      //    correct_answer stripping in both paths).
      let rawQuestions: BankQuestion[] | null = null
      if (hasCachedPaper(batchId)) {
        rawQuestions = await getDecryptedPaper(batchId)
      }
      if (!rawQuestions) {
        const { data, error: qError } = await supabase
          .rpc('get_exam_questions', { p_batch_id: batchId })
        if (qError) throw qError
        rawQuestions = data as BankQuestion[]
      }

      if (!rawQuestions || rawQuestions.length === 0) {
        throw new Error('No questions found for this exam. Please contact your invigilator.')
      }

      // 4. Deterministic shuffle (seed includes attemptNumber for unique questions per retry)
      const shuffled = selectAndShuffleQuestions(
        rawQuestions, rollNumber, batchId, batch.questions_per_student ?? null, currentAttemptNumber
      )
      setQuestions(shuffled)

      // 5. Recover previous answers on refresh (ownership-verified)
      if (existing && existing.length > 0 && !existing[0].submitted_at) {
        const { data: prevResponses } = await supabase.rpc('get_my_responses', {
          p_attempt_id:   currentAttemptId,
          p_roll_number:  rollNumber,
          p_student_name: studentName,
        })
        if (prevResponses?.length > 0) {
          const map: Record<string, string> = {}
          prevResponses.forEach((r: { question_id: string; selected_answer: string }) => { map[r.question_id] = r.selected_answer })
          setAnsweredMap(map)
          const answeredIds = new Set(prevResponses.map((r: { question_id: string }) => r.question_id))
          const firstUnanswered = shuffled.findIndex(q => !answeredIds.has(q.questionId))
          setCurrentIndex(firstUnanswered === -1 ? shuffled.length - 1 : firstUnanswered)
        }
      }

      setStatus('ready')
    } catch (err) {
      setError(formatDbError(err as ErrorLike, 'Failed to start exam. Please try again.'))
      setStatus('error')
    }
  }, [batch, batchId, rollNumber, studentName, email, accessCode, forceNewAttempt])

  useEffect(() => {
    if (!batch || !rollNumber || !studentName) return
    initExam()
  }, [batch, rollNumber, studentName, email, accessCode, initExam])

  // Session heartbeat — detect when another window claims the session.
  // Runs during 'ready' and 'unsaved_warning' to prevent pausing detection.
  // Scale: 30s cadence + per-client jitter (±5s) — halves sustained RPC
  // load at 2000 students and desynchronizes the herd. Session conflicts
  // are still caught instantly by save_response on the next answer.
  useEffect(() => {
    if (!attemptId || !sessionTokenRef.current) return
    if (status !== 'ready' && status !== 'unsaved_warning') return
    const intervalMs = 30_000 + (Math.random() - 0.5) * 10_000
    let useLegacy = false
    const interval = setInterval(async () => {
      try {
        if (!useLegacy) {
          // exam_heartbeat: validates session, stamps presence for mission
          // control, and returns any admin-granted time extension.
          const { data, error } = await supabase.rpc('exam_heartbeat', {
            p_attempt_id:    attemptId,
            p_session_token: sessionTokenRef.current,
          })
          if (error) {
            // Pre-migration DB — fall back to plain session check
            useLegacy = true
            return
          }
          const row = Array.isArray(data) ? data[0] : data
          if (row?.valid === false) {
            setError('This exam is already open in another window. Close that tab and refresh to continue.')
            setStatus('error')
            return
          }
          if (typeof row?.extra_time_minutes === 'number') {
            setExtraTimeMinutes(prev => row.extra_time_minutes !== prev ? row.extra_time_minutes : prev)
          }
          return
        }
        const { data: valid } = await supabase.rpc('check_session', {
          p_attempt_id:    attemptId,
          p_session_token: sessionTokenRef.current,
        })
        if (valid === false) {
          setError('This exam is already open in another window. Close that tab and refresh to continue.')
          setStatus('error')
        }
      } catch {
        // Network error — don't kick the student out
      }
    }, intervalMs)
    return () => clearInterval(interval)
  }, [attemptId, status])

  /**
   * Drain the failed queue before final submission.
   * Scale: one save_responses_batch RPC (single session check, bulk upsert)
   * instead of N sequential save_response calls. Falls back to per-item
   * saves if the batch RPC is unavailable (older DB).
   */
  const drainFailedQueue = useCallback(async () => {
    const queue = [...failedQueueRef.current]
    if (queue.length === 0) return

    try {
      const { error } = await supabase.rpc('save_responses_batch', {
        p_attempt_id:    queue[0].attemptId,
        p_session_token: sessionTokenRef.current,
        p_responses:     queue.map(q => ({ question_id: q.questionId, selected_answer: q.originalLabel, time_spent_ms: q.timeSpent ?? null })),
      })
      if (!error) {
        failedQueueRef.current = []
        setPendingCount(0)
        return
      }
      if (error.message?.includes('Invalid session')) return // keep queue; submit flow handles it
      // Other errors (e.g. RPC missing) → fall through to per-item path
    } catch { /* fall through to per-item path */ }

    const remaining: QueuedResponse[] = []
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]
      try {
        const { error } = await supabase.rpc('save_response', {
          p_attempt_id:      item.attemptId,
          p_question_id:     item.questionId,
          p_selected_answer: item.originalLabel,
          p_session_token:   sessionTokenRef.current,
        })
        if (error) {
          // Session conflict → all remaining will also fail, stop draining
          if (error.message?.includes('Invalid session')) {
            remaining.push(...queue.slice(i))
            break
          }
          remaining.push(item)
        }
      } catch {
        remaining.push(item)
      }
    }
    failedQueueRef.current = remaining
    setPendingCount(remaining.length)
  }, [])

  const finalizeSubmission = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
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
      if (unsaved > 0 && !force) {
        // Let the student decide: retry or submit with missing answers
        setUnsavedCount(unsaved)
        setStatus('unsaved_warning')
        return
      }
      if (unsaved > 0) {
        console.warn(`Force-submitting with ${unsaved} unsaved answer(s)`)
      }

      const { data, error } = await supabase.rpc('submit_exam', {
        p_attempt_id:    attemptId,
        p_session_token: sessionTokenRef.current,
      })
      if (error) throw error

      const row = data[0]
      const pct = (row.score != null && row.total_questions > 0)
        ? Math.round((row.score / row.total_questions) * 100) : null

      setResult({
        score: row.score,
        total: row.total_questions,
        percentage: pct,
        showResults: row.show_results,
        passPercentage: row.pass_percentage,
        attemptNumber: row.attempt_number,
        maxAttempts: row.max_attempts,
        canRetry: row.can_retry,
      })
      setStatus('submitted')
    } catch (err) {
      console.error('Submission error:', err)
      setStatus('error')
      setError(formatDbError(err as ErrorLike, 'Submission failed. Please contact the invigilator.'))
    }
  }, [attemptId, drainFailedQueue])

  /**
   * Submit a single response and advance.
   */
  const submitAnswer = useCallback(async (selectedLabel: string, isFinal = false, timeSpentMs: number | null = null) => {
    const question = questions[currentIndex]
    if (!question || !attemptId) return

    const selectedOption = question.options.find(o => o.label === selectedLabel)
    if (!selectedOption) return // stale/invalid label — never throw mid-exam
    const originalLabel = selectedOption.originalLabel
    const timeSpent = Number.isFinite(timeSpentMs) ? Math.round(timeSpentMs as number) : null

    setAnsweredMap(prev => ({ ...prev, [question.questionId]: originalLabel }))

    /** Save via RPC with session-token validation. Retries on transient errors. */
    async function saveWithRetry(questionId: string, answer: string, retries = 3): Promise<void> {
      let includeTiming = true
      for (let i = 0; i < retries; i++) {
        const params: Record<string, unknown> = {
          p_attempt_id:      attemptId,
          p_question_id:     questionId,
          p_selected_answer: answer,
          p_session_token:   sessionTokenRef.current,
        }
        if (includeTiming) params.p_time_spent_ms = timeSpent
        const { error } = await supabase.rpc('save_response', params)
        if (!error) return
        // Pre-migration DB (function signature mismatch) → retry without timing
        if (includeTiming && (error.code === 'PGRST202' || error.message?.includes('function'))) {
          includeTiming = false
          continue
        }
        // Session conflict — don't retry, escalate immediately
        if (error.message?.includes('Invalid session')) throw error
        if (i < retries - 1) await sleep(500 * Math.pow(2, i))
        else throw error
      }
    }

    try {
      await saveWithRetry(question.questionId, originalLabel)
    } catch (err) {
      // Session conflict = hard stop — lock the student out immediately
      if ((err as ErrorLike)?.message?.includes('Invalid session')) {
        setError('This exam is already open in another window. Close that tab and refresh to continue.')
        setStatus('error')
        return
      }
      // Transient network error — queue for retry before submission
      console.error('Failed to save response after retries, queuing:', err)
      failedQueueRef.current.push({ questionId: question.questionId, originalLabel, attemptId, timeSpent })
      setPendingCount(failedQueueRef.current.length)
    }

    if (isFinal) {
      await finalizeSubmission()
    } else {
      setCurrentIndex(i => i + 1)
    }
  }, [questions, currentIndex, attemptId, finalizeSubmission])

  /**
   * Auto-submit on timer expiry — always forces even with unsaved answers.
   */
  const autoSubmit = useCallback(async () => {
    if (status === 'submitting' || status === 'submitted') return
    await finalizeSubmission({ force: true })
  }, [status, finalizeSubmission])

  /** Retry submission (drain failed queue again, warn if still unsaved). */
  const retrySubmit = useCallback(() => finalizeSubmission(), [finalizeSubmission])

  /** Force-submit accepting that unsaved answers will be lost. */
  const forceSubmit = useCallback(() => finalizeSubmission({ force: true }), [finalizeSubmission])

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
    unsavedCount,
    extraTimeMinutes,
    submitAnswer,
    autoSubmit,
    retrySubmit,
    forceSubmit,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
