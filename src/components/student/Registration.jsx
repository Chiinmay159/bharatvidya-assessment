import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'

export function Registration({ batch, onRegistered, onBack }) {
  const [rollNumber, setRollNumber] = useState('')
  const [studentName, setStudentName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const roll = rollNumber.trim()
    const name = studentName.trim()

    if (!roll || !name) {
      setError('Please enter both roll number and name.')
      setSubmitting(false)
      return
    }

    // Check if already attempted
    const { data: existing } = await supabase.rpc('get_my_attempt', {
      p_batch_id: batch.id,
      p_roll_number: roll,
    })

    if (existing && existing.length > 0) {
      const attempt = existing[0]
      if (attempt.submitted_at) {
        setError('This roll number has already submitted this exam. Results cannot be viewed after submission.')
        setSubmitting(false)
        return
      }
      // Resume existing attempt
      onRegistered({ rollNumber: roll, studentName: name })
      return
    }

    // Check for duplicate (in case RPC finds nothing but insert would fail)
    onRegistered({ rollNumber: roll, studentName: name })
    setSubmitting(false)
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <button
        onClick={onBack}
        className="text-sm text-indigo-600 hover:text-indigo-800 mb-6 flex items-center gap-1"
      >
        ← Back to exam list
      </button>

      <div className="bg-white border border-gray-200 rounded-xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{batch.name}</h1>
        <p className="text-sm text-gray-500 mb-1">
          {formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'dd MMMM yyyy, hh:mm a')} IST
        </p>
        <p className="text-sm text-gray-500 mb-6">Duration: {batch.duration_minutes} minutes</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Roll Number</label>
            <input
              type="text"
              value={rollNumber}
              onChange={e => setRollNumber(e.target.value)}
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter your roll number"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter your full name"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors mt-2"
          >
            {submitting ? 'Checking...' : 'Enter Exam'}
          </button>
        </form>
      </div>
    </div>
  )
}
