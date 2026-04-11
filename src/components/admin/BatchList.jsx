import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  active:    'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
}

const STATUS_TRANSITIONS = {
  draft:     [{ label: 'Mark Scheduled', next: 'scheduled' }],
  scheduled: [{ label: 'Start Now', next: 'active' }, { label: 'Revert to Draft', next: 'draft' }],
  active:    [{ label: 'End Exam', next: 'completed' }],
  completed: [],
}

export function BatchList({ onSelectBatch, onCreateBatch, onViewResults, onManageQuestions }) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [questionCounts, setQuestionCounts] = useState({})
  const [submissionCounts, setSubmissionCounts] = useState({})
  const [confirmAction, setConfirmAction] = useState(null) // { batchId, next, label }
  const [transitioning, setTransitioning] = useState(null)

  useEffect(() => {
    fetchBatches()
  }, [])

  async function fetchBatches() {
    setLoading(true)
    const { data, error } = await supabase
      .from('batches')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setBatches(data)
      fetchCounts(data.map(b => b.id))
    }
    setLoading(false)
  }

  async function fetchCounts(batchIds) {
    if (batchIds.length === 0) return

    const [qResult, aResult] = await Promise.all([
      supabase.from('questions').select('batch_id').in('batch_id', batchIds),
      supabase.from('attempts').select('batch_id').in('batch_id', batchIds).not('submitted_at', 'is', null),
    ])

    const qCounts = {}
    const aCounts = {}
    batchIds.forEach(id => { qCounts[id] = 0; aCounts[id] = 0 })
    qResult.data?.forEach(q => { qCounts[q.batch_id] = (qCounts[q.batch_id] || 0) + 1 })
    aResult.data?.forEach(a => { aCounts[a.batch_id] = (aCounts[a.batch_id] || 0) + 1 })
    setQuestionCounts(qCounts)
    setSubmissionCounts(aCounts)
  }

  async function handleStatusTransition(batchId, nextStatus) {
    // Validate: cannot mark scheduled if questions_per_student > question count
    if (nextStatus === 'scheduled') {
      const batch = batches.find(b => b.id === batchId)
      const qCount = questionCounts[batchId] || 0
      if (batch?.questions_per_student && batch.questions_per_student > qCount) {
        alert(
          `Cannot schedule: question bank has ${qCount} questions but batch requires ${batch.questions_per_student} per student. ` +
          `Upload more questions or reduce questions per student.`
        )
        setConfirmAction(null)
        return
      }
      if (qCount === 0) {
        alert('Cannot schedule: no questions uploaded for this batch.')
        setConfirmAction(null)
        return
      }
    }

    setTransitioning(batchId)
    const { error } = await supabase
      .from('batches')
      .update({ status: nextStatus })
      .eq('id', batchId)

    if (!error) {
      setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: nextStatus } : b))
    }
    setConfirmAction(null)
    setTransitioning(null)
  }

  if (loading) {
    return <div className="text-gray-500 text-sm py-8 text-center">Loading batches...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Batches</h2>
        <button
          onClick={onCreateBatch}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + New Batch
        </button>
      </div>

      {batches.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No batches yet.</p>
          <p className="text-sm">Create your first batch to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Scheduled Start (IST)</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Questions</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Submissions</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.map(batch => (
                <tr key={batch.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{batch.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'dd MMM yyyy, hh:mm a')}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{batch.duration_minutes} min</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[batch.status]}`}>
                      {batch.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {questionCounts[batch.id] ?? 0}
                    {batch.questions_per_student && (
                      <span className="text-gray-400 ml-1">/ {batch.questions_per_student} per student</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{submissionCounts[batch.id] ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => onSelectBatch(batch)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onManageQuestions(batch)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                      >
                        Questions
                      </button>
                      {(batch.status === 'active' || batch.status === 'completed') && (
                        <button
                          onClick={() => onViewResults(batch)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                        >
                          Results
                        </button>
                      )}
                      {STATUS_TRANSITIONS[batch.status]?.map(t => (
                        <button
                          key={t.next}
                          onClick={() => setConfirmAction({ batchId: batch.id, ...t })}
                          disabled={transitioning === batch.id}
                          className="text-xs bg-white border border-gray-300 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-50 disabled:opacity-50"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Confirm Action</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to <strong>{confirmAction.label}</strong> this batch?
              {confirmAction.next === 'active' && (
                <span className="block mt-1 text-amber-600">This will immediately allow students to start the exam.</span>
              )}
              {confirmAction.next === 'completed' && (
                <span className="block mt-1 text-red-600">This will end the exam for all students immediately.</span>
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleStatusTransition(confirmAction.batchId, confirmAction.next)}
                className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
