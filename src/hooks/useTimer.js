import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const FIVE_MINUTES_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 30_000
const TICK_INTERVAL_MS = 1_000

/**
 * useTimer — server-synced countdown with batch status polling.
 *
 * Design (Opus-reviewed):
 * - Fetches server time once on mount, computes offset using half-RTT compensation.
 * - Uses setInterval (not rAF) so the timer continues when tab is backgrounded.
 * - Derives remaining time from wall-clock + offset on every tick (self-correcting).
 * - Polls batch status every 30s for early termination by admin.
 * - onTimeUp and onBatchEnded are guarded against double-fire.
 */
export function useTimer({ scheduledStart, durationMinutes, onTimeUp, onBatchEnded, batchId, enabled }) {
  const [remainingMs, setRemainingMs] = useState(null)
  const [syncStatus, setSyncStatus] = useState('syncing') // 'syncing' | 'synced' | 'fallback'

  // Monotonic timer: immune to client clock changes.
  // After server sync, we record a performance.now() baseline and derived server ms.
  // On each tick: serverNow = baselineServerMs + (performance.now() - baselinePerf)
  const baselinePerfRef = useRef(0)
  const baselineServerMsRef = useRef(0)
  const examEndTimeRef = useRef(null)
  const hasTriggeredRef = useRef(false)
  const onTimeUpRef = useRef(onTimeUp)
  const onBatchEndedRef = useRef(onBatchEnded)

  // Keep callback refs current without re-creating intervals
  useEffect(() => { onTimeUpRef.current = onTimeUp }, [onTimeUp])
  useEffect(() => { onBatchEndedRef.current = onBatchEnded }, [onBatchEnded])

  // Compute exam end time whenever inputs change
  useEffect(() => {
    if (!scheduledStart || !durationMinutes) return
    const startMs = new Date(scheduledStart).getTime()
    examEndTimeRef.current = startMs + durationMinutes * 60 * 1000
  }, [scheduledStart, durationMinutes])

  // Fetch server time once and establish a monotonic baseline.
  // All subsequent ticks derive from performance.now() — immune to clock changes.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function syncServerTime() {
      try {
        const t1 = performance.now()
        const { data, error } = await supabase.rpc('get_server_time')
        const t2 = performance.now()
        if (cancelled) return
        if (error || !data) throw new Error('Server time unavailable')
        const rtt = t2 - t1
        const serverMs = new Date(data).getTime()
        // Server captured time at ~t1 + rtt/2
        const estimatedServerNow = serverMs + rtt / 2
        // Record monotonic baseline
        baselinePerfRef.current = t2
        baselineServerMsRef.current = estimatedServerNow
        setSyncStatus('synced')
      } catch {
        if (!cancelled) {
          // Fallback: use wall clock
          baselinePerfRef.current = performance.now()
          baselineServerMsRef.current = Date.now()
          setSyncStatus('fallback')
        }
      }
    }

    syncServerTime()
    return () => { cancelled = true }
  }, [enabled])

  // Main tick interval
  useEffect(() => {
    if (!enabled || syncStatus === 'syncing') return

    const tick = () => {
      if (!examEndTimeRef.current) return
      // Derive server time from monotonic clock — immune to wall-clock changes
      const serverNow = baselineServerMsRef.current + (performance.now() - baselinePerfRef.current)
      const remaining = examEndTimeRef.current - serverNow
      const clamped = Math.max(0, remaining)
      setRemainingMs(clamped)

      if (remaining <= 0 && !hasTriggeredRef.current) {
        hasTriggeredRef.current = true
        onTimeUpRef.current?.()
      }
    }

    tick() // run immediately on mount
    const timerId = setInterval(tick, TICK_INTERVAL_MS)
    return () => clearInterval(timerId)
  }, [enabled, syncStatus])

  // Batch status poll (every 30s) for admin early-end
  useEffect(() => {
    if (!enabled || !batchId) return

    const pollStatus = async () => {
      if (hasTriggeredRef.current) return
      try {
        const { data } = await supabase
          .from('batches')
          .select('status')
          .eq('id', batchId)
          .single()
        if (data?.status === 'completed' && !hasTriggeredRef.current) {
          hasTriggeredRef.current = true
          onBatchEndedRef.current?.()
        }
      } catch {
        // Ignore poll errors — timer will still auto-submit on expiry
      }
    }

    const pollId = setInterval(pollStatus, POLL_INTERVAL_MS)
    return () => clearInterval(pollId)
  }, [enabled, batchId])

  const remainingFormatted = remainingMs == null
    ? '--:--'
    : formatTime(remainingMs)

  const isUrgent = remainingMs != null && remainingMs <= FIVE_MINUTES_MS
  const isExpired = remainingMs != null && remainingMs <= 0

  return { remainingMs, remainingFormatted, isUrgent, isExpired, syncStatus }
}

function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
