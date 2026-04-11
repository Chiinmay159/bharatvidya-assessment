import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'

const STATUS_LABELS = { draft: 'Draft', scheduled: 'Scheduled', active: 'Active', completed: 'Completed' }

export function BatchForm({ batch, onSaved, onCancel }) {
  const isEditing = !!batch

  const [form, setForm] = useState({
    name: batch?.name ?? '',
    scheduled_date: batch?.scheduled_start
      ? format(new Date(batch.scheduled_start), "yyyy-MM-dd")
      : '',
    scheduled_time: batch?.scheduled_start
      ? format(new Date(batch.scheduled_start), "HH:mm")
      : '',
    duration_minutes: batch?.duration_minutes ?? '',
    questions_per_student: batch?.questions_per_student ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const scheduledStart = new Date(`${form.scheduled_date}T${form.scheduled_time}`)
    if (isNaN(scheduledStart.getTime())) {
      setError('Please enter a valid date and time.')
      return
    }

    const duration = parseInt(form.duration_minutes)
    if (!duration || duration <= 0) {
      setError('Duration must be a positive number.')
      return
    }

    const qps = form.questions_per_student ? parseInt(form.questions_per_student) : null
    if (qps !== null && (!Number.isInteger(qps) || qps <= 0)) {
      setError('Questions per student must be a positive integer.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        scheduled_start: scheduledStart.toISOString(),
        duration_minutes: duration,
        questions_per_student: qps,
      }

      if (isEditing) {
        const { error: err } = await supabase
          .from('batches')
          .update(payload)
          .eq('id', batch.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('batches').insert(payload)
        if (err) throw err
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Batch Name</label>
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="e.g. Batch A – Morning"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            name="scheduled_date"
            type="date"
            value={form.scheduled_date}
            onChange={handleChange}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
          <input
            name="scheduled_time"
            type="time"
            value={form.scheduled_time}
            onChange={handleChange}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
        <input
          name="duration_minutes"
          type="number"
          min="1"
          value={form.duration_minutes}
          onChange={handleChange}
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="e.g. 60"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Questions per student
          <span className="text-gray-400 font-normal ml-1">(optional)</span>
        </label>
        <input
          name="questions_per_student"
          type="number"
          min="1"
          value={form.questions_per_student}
          onChange={handleChange}
          disabled={isEditing && (batch?.status === 'active' || batch?.status === 'completed')}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          placeholder="Leave blank to use all questions"
        />
        <p className="text-xs text-gray-500 mt-1">
          If set, each student receives this many randomly selected questions from the uploaded pool.
          {isEditing && (batch?.status === 'active' || batch?.status === 'completed') && (
            <span className="text-amber-600 ml-1">Cannot change once exam is active.</span>
          )}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Batch'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
