import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { parseQuestionsCsv } from '../../lib/csv'

export function QuestionUpload({ batch, onBack }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [parseErrors, setParseErrors] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [existingCount, setExistingCount] = useState(0)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetchExistingCount()
  }, [batch.id])

  async function fetchExistingCount() {
    const { count } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('batch_id', batch.id)
    setExistingCount(count ?? 0)
  }

  async function handleFileChange(e) {
    const selected = e.target.files[0]
    if (!selected) return
    setFile(selected)
    setPreview(null)
    setParseErrors([])
    setSuccess(false)

    const { questions, errors } = await parseQuestionsCsv(selected)
    if (errors.length > 0) {
      setParseErrors(errors)
      setPreview(null)
    } else {
      setPreview(questions)
    }
  }

  async function handleUpload() {
    if (!preview || preview.length === 0) return
    setUploading(true)
    setUploadError(null)

    try {
      // Delete existing questions for this batch first
      const { error: deleteError } = await supabase
        .from('questions')
        .delete()
        .eq('batch_id', batch.id)
      if (deleteError) throw deleteError

      // Bulk insert new questions
      const rows = preview.map((q, i) => ({
        ...q,
        batch_id: batch.id,
        sort_order: i + 1,
      }))

      // Insert in chunks of 500 to avoid payload limits
      const chunkSize = 500
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize)
        const { error } = await supabase.from('questions').insert(chunk)
        if (error) throw error
      }

      setSuccess(true)
      setExistingCount(preview.length)
      setPreview(null)
      setFile(null)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-4xl">
      <button
        onClick={onBack}
        className="text-sm text-indigo-600 hover:text-indigo-800 mb-4 flex items-center gap-1"
      >
        ← Back to batches
      </button>

      <h2 className="text-xl font-semibold text-gray-900 mb-1">{batch.name}</h2>
      <p className="text-sm text-gray-500 mb-6">
        Currently uploaded: <strong>{existingCount}</strong> questions
        {batch.questions_per_student && (
          <span className="ml-2 text-indigo-600 font-medium">
            → {batch.questions_per_student} per student
          </span>
        )}
      </p>

      {/* Validation warning */}
      {batch.questions_per_student && existingCount > 0 && batch.questions_per_student > existingCount && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm">
          Warning: question bank has {existingCount} questions but batch requires {batch.questions_per_student} per student.
          Upload more questions or reduce questions per student before scheduling.
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">
          Questions uploaded successfully! {existingCount} questions are now in the bank.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h3 className="font-medium text-gray-900 mb-3">Upload CSV</h3>
        <p className="text-xs text-gray-500 mb-3">
          Required columns: <code className="bg-gray-100 px-1 rounded">question, option_a, option_b, option_c, option_d, correct</code>
          <br />Correct column accepts: A, B, C, D (case-insensitive). UTF-8 encoding. Devanagari supported.
        </p>

        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="block text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
        />
      </div>

      {parseErrors.length > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-700 mb-2">CSV validation errors:</p>
          <ul className="text-sm text-red-600 space-y-1 list-disc list-inside">
            {parseErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {preview && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900">
              Preview — {preview.length} questions parsed
            </h3>
            {batch.questions_per_student && (
              <span className="text-sm text-indigo-600">
                Bank: {preview.length} questions → {batch.questions_per_student} per student
                {batch.questions_per_student > preview.length && (
                  <span className="text-amber-600 ml-1">
                    (Warning: per-student count exceeds bank size)
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-auto max-h-80">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-8">#</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Question</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">A</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">B</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">C</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">D</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Correct</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((q, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 text-gray-900 max-w-xs truncate">{q.question_text}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-20 truncate">{q.option_a}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-20 truncate">{q.option_b}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-20 truncate">{q.option_c}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-20 truncate">{q.option_d}</td>
                    <td className="px-3 py-2 font-medium text-green-700">{q.correct_answer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {uploadError && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {uploadError}
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Uploading...' : `Confirm Upload (${preview.length} questions)`}
            </button>
            <button
              onClick={() => { setPreview(null); setFile(null) }}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
          {existingCount > 0 && (
            <p className="text-xs text-amber-600 mt-2">
              Note: uploading will replace all {existingCount} existing questions for this batch.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
