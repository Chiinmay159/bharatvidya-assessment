import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'

export function WaitingRoom({ batch, rollNumber, studentName, onExamStarted }) {
  const [countdown, setCountdown] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const startTime = new Date(batch.scheduled_start).getTime()

    const tick = () => {
      const now = Date.now()
      const diff = startTime - now

      if (diff <= 0) {
        setCountdown('00:00:00')
        // Check if batch is now active
        checkAndTransition()
        return
      }

      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      )
    }

    tick()
    const timer = setInterval(tick, 1000)

    // Also poll Supabase every 10s for status change
    const poll = setInterval(checkAndTransition, 10_000)

    return () => {
      clearInterval(timer)
      clearInterval(poll)
    }
  }, [batch.id])

  async function checkAndTransition() {
    if (checking) return
    setChecking(true)
    try {
      const { data } = await supabase
        .from('batches')
        .select('status')
        .eq('id', batch.id)
        .single()

      if (data?.status === 'active') {
        onExamStarted()
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="bg-white border border-gray-200 rounded-xl p-10">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">{batch.name}</h1>
        <p className="text-sm text-gray-500 mb-6">
          Exam starts at{' '}
          <strong>
            {formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'hh:mm a')} IST
          </strong>
          {' · '}{batch.duration_minutes} minutes
        </p>

        <div className="bg-gray-50 rounded-lg px-8 py-6 mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Exam starts in</p>
          <div className="text-5xl font-mono font-bold text-gray-900 tracking-wider">
            {countdown}
          </div>
        </div>

        <div className="text-sm text-gray-500 space-y-1">
          <p>Roll No: <strong className="text-gray-900">{rollNumber}</strong></p>
          <p>Name: <strong className="text-gray-900">{studentName}</strong></p>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          This page will automatically advance when the exam begins. Do not close this tab.
        </p>
      </div>
    </div>
  )
}
