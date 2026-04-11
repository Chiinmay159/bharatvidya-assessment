import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { generateCsv, downloadCsv } from '../../lib/csv'
import { formatInTimeZone } from 'date-fns-tz'

export function ResultsView({ batch, onBack }) {
  const [attempts, setAttempts] = useState([])
  const [questions, setQuestions] = useState([])
  const [responses, setResponses] = useState([]) // flat: { attempt_id, question_id, selected_answer, is_correct }
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('score')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    fetchAll()
  }, [batch.id])

  async function fetchAll() {
    setLoading(true)
    const [attResult, qResult] = await Promise.all([
      supabase
        .from('attempts')
        .select('*')
        .eq('batch_id', batch.id)
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: false }),
      supabase
        .from('questions')
        .select('id, question_text, sort_order, correct_answer')
        .eq('batch_id', batch.id)
        .order('sort_order', { ascending: true }),
    ])

    const fetchedAttempts = attResult.data || []
    const fetchedQuestions = qResult.data || []
    setAttempts(fetchedAttempts)
    setQuestions(fetchedQuestions)

    if (fetchedAttempts.length > 0) {
      const attemptIds = fetchedAttempts.map(a => a.id)
      const { data: resp } = await supabase
        .from('responses')
        .select('attempt_id, question_id, selected_answer, is_correct')
        .in('attempt_id', attemptIds)
      setResponses(resp || [])
    }

    setLoading(false)
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sortedAttempts = [...attempts].sort((a, b) => {
    let va = a[sortKey]
    let vb = b[sortKey]
    if (sortKey === 'percentage') {
      va = a.total_questions ? (a.score / a.total_questions) * 100 : 0
      vb = b.total_questions ? (b.score / b.total_questions) * 100 : 0
    }
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortDir === 'asc' ? va - vb : vb - va
  })

  function handleExportCsv() {
    // Build response map: { attemptId: { questionId: { selected_answer, is_correct } } }
    const respMap = {}
    responses.forEach(r => {
      if (!respMap[r.attempt_id]) respMap[r.attempt_id] = {}
      respMap[r.attempt_id][r.question_id] = r
    })

    const qFields = questions.flatMap(q => [
      `q_${q.sort_order}_text`,
      `q_${q.sort_order}_answer`,
      `q_${q.sort_order}_correct`,
    ])

    const fields = [
      'roll_number', 'student_name', 'score', 'total_questions',
      'percentage', 'time_taken_mins', 'submitted_at',
      ...qFields,
    ]

    const rows = attempts.map(a => {
      const timeTaken = a.submitted_at && a.started_at
        ? Math.round((new Date(a.submitted_at) - new Date(a.started_at)) / 60000)
        : ''
      const percentage = a.total_questions ? ((a.score / a.total_questions) * 100).toFixed(1) : ''
      const submittedAt = a.submitted_at
        ? formatInTimeZone(new Date(a.submitted_at), 'Asia/Kolkata', 'dd/MM/yyyy HH:mm:ss')
        : ''

      const row = {
        roll_number: a.roll_number,
        student_name: a.student_name,
        score: a.score ?? '',
        total_questions: a.total_questions ?? '',
        percentage,
        time_taken_mins: timeTaken,
        submitted_at: submittedAt,
      }

      questions.forEach(q => {
        const resp = respMap[a.id]?.[q.id]
        row[`q_${q.sort_order}_text`] = q.question_text.slice(0, 80)
        row[`q_${q.sort_order}_answer`] = resp ? resp.selected_answer : ''
        row[`q_${q.sort_order}_correct`] = resp ? (resp.is_correct ? 'TRUE' : 'FALSE') : ''
      })

      return row
    })

    const csv = generateCsv(rows, fields)
    downloadCsv(csv, `${batch.name.replace(/\s+/g, '_')}_results.csv`)
  }

  const SortHeader = ({ label, field }) => (
    <th
      className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none whitespace-nowrap"
      onClick={() => toggleSort(field)}
    >
      {label}
      {sortKey === field && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )

  if (loading) {
    return (
      <div>
        <button onClick={onBack} className="text-sm text-indigo-600 hover:text-indigo-800 mb-4">← Back</button>
        <div className="text-gray-500 text-sm py-8 text-center">Loading results...</div>
      </div>
    )
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-indigo-600 hover:text-indigo-800 mb-4 flex items-center gap-1">
        ← Back to batches
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{batch.name} — Results</h2>
          <p className="text-sm text-gray-500 mt-1">{attempts.length} submissions</p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={attempts.length === 0}
          className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Download CSV
        </button>
      </div>

      {attempts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">No submissions yet.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <SortHeader label="Roll No." field="roll_number" />
                <SortHeader label="Name" field="student_name" />
                <SortHeader label="Score" field="score" />
                <SortHeader label="Total" field="total_questions" />
                <SortHeader label="%" field="percentage" />
                <SortHeader label="Time (min)" field="time_taken_mins" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Submitted (IST)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedAttempts.map(a => {
                const percentage = a.total_questions
                  ? ((a.score / a.total_questions) * 100).toFixed(1)
                  : '-'
                const timeTaken = a.submitted_at && a.started_at
                  ? Math.round((new Date(a.submitted_at) - new Date(a.started_at)) / 60000)
                  : '-'
                const submittedAt = a.submitted_at
                  ? formatInTimeZone(new Date(a.submitted_at), 'Asia/Kolkata', 'dd MMM, hh:mm a')
                  : '-'

                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-700">{a.roll_number}</td>
                    <td className="px-4 py-3 text-gray-900">{a.student_name}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{a.score ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{a.total_questions ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${parseFloat(percentage) >= 60 ? 'text-green-700' : 'text-red-600'}`}>
                        {percentage}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{timeTaken}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{submittedAt}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
