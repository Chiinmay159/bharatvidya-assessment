import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'

export function BatchSelect({ onSelectBatch }) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchBatches()
    const interval = setInterval(fetchBatches, 30_000) // refresh every 30s
    return () => clearInterval(interval)
  }, [])

  async function fetchBatches() {
    const { data, error } = await supabase
      .from('batches')
      .select('id, name, scheduled_start, duration_minutes, status, questions_per_student')
      .in('status', ['scheduled', 'active'])
      .order('scheduled_start', { ascending: true })

    if (error) {
      setError('Failed to load exam batches. Please refresh.')
    } else {
      setBatches(data || [])
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <div className="text-gray-500">Loading available exams...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">BharatVidya Exams</h1>
        <p className="text-gray-500">Select your exam batch to continue</p>
      </div>

      {batches.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 text-lg">No exams are currently available.</p>
          <p className="text-gray-400 text-sm mt-2">Check back closer to your scheduled exam time.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {batches.map(batch => (
            <button
              key={batch.id}
              onClick={() => onSelectBatch(batch)}
              className="w-full bg-white border border-gray-200 rounded-xl p-5 text-left hover:border-indigo-400 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
                    {batch.name}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'EEEE, dd MMMM yyyy')}
                    {' · '}
                    {formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'hh:mm a')} IST
                  </p>
                  <p className="text-sm text-gray-500">
                    Duration: {batch.duration_minutes} minutes
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    batch.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {batch.status === 'active' ? 'Live Now' : 'Upcoming'}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
