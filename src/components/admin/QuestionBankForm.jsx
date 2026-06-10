import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'
import { Spinner } from '../shared/Spinner'

const DIFFICULTIES = ['easy', 'medium', 'hard']
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'sa', label: 'Sanskrit' },
  { value: 'mr', label: 'Marathi' },
  { value: 'mixed', label: 'Mixed' },
]
const BLOOM = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']

/** Create/edit a bank question. Editing an approved question reverts it
 *  to draft server-side (version bump) — the form warns about this. */
export function QuestionBankForm({ question, topics, onSaved, onCancel }) {
  const isEdit = Boolean(question)
  const [form, setForm] = useState({
    question_text:  question?.question_text  ?? '',
    option_a:       question?.option_a       ?? '',
    option_b:       question?.option_b       ?? '',
    option_c:       question?.option_c       ?? '',
    option_d:       question?.option_d       ?? '',
    correct_answer: question?.correct_answer ?? 'A',
    topic:          question?.topic          ?? '',
    subtopic:       question?.subtopic       ?? '',
    difficulty:     question?.difficulty     ?? 'medium',
    bloom_level:    question?.bloom_level    ?? '',
    language:       question?.language       ?? 'en',
    explanation:    question?.explanation    ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSave(e) {
    e.preventDefault()
    setError(null)
    if (!form.question_text.trim() || !form.topic.trim()
        || !form.option_a.trim() || !form.option_b.trim()
        || !form.option_c.trim() || !form.option_d.trim()) {
      setError('Question text, topic, and all four options are required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        topic: form.topic.trim(),
        subtopic: form.subtopic.trim() || null,
        bloom_level: form.bloom_level || null,
        explanation: form.explanation.trim() || null,
      }
      if (isEdit) {
        const { error: err } = await supabase.from('bank_questions')
          .update(payload).eq('id', question.id)
        if (err) throw err
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        const { error: err } = await supabase.from('bank_questions')
          .insert({ ...payload, created_by: session?.user?.email ?? 'unknown' })
        if (err) throw err
      }
      onSaved()
    } catch (err) {
      setError(formatDbError(err, 'Could not save the question.'))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="card" style={{ padding: '28px 26px', maxWidth: 720 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 700, color: 'var(--text-1)' }}>
        {isEdit ? 'Edit bank question' : 'New bank question'}
      </h2>
      <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--text-3)' }}>
        {isEdit && question.status === 'approved'
          ? '⚠ This question is approved. Saving content changes will revert it to draft (new version) and require re-review.'
          : 'New questions start as drafts; submit for review when ready.'}
      </p>

      {error && (
        <div role="alert" style={{ background: 'var(--error-lt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <Field label="Question text" required>
        <textarea value={form.question_text} onChange={set('question_text')} rows={3} style={{ ...input, resize: 'vertical' }} required />
      </Field>

      <div style={grid2}>
        {['a', 'b', 'c', 'd'].map(letter => (
          <Field key={letter} label={`Option ${letter.toUpperCase()}`} required>
            <input value={form[`option_${letter}`]} onChange={set(`option_${letter}`)} style={input} required />
          </Field>
        ))}
      </div>

      <div style={grid2}>
        <Field label="Correct answer" required>
          <select value={form.correct_answer} onChange={set('correct_answer')} style={input}>
            {['A', 'B', 'C', 'D'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Difficulty" required>
          <select value={form.difficulty} onChange={set('difficulty')} style={input}>
            {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Topic" required>
          <input value={form.topic} onChange={set('topic')} style={input} list="bank-topics" required />
          <datalist id="bank-topics">{topics.map(t => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Subtopic">
          <input value={form.subtopic} onChange={set('subtopic')} style={input} />
        </Field>
        <Field label="Language" required>
          <select value={form.language} onChange={set('language')} style={input}>
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </Field>
        <Field label="Bloom's level">
          <select value={form.bloom_level} onChange={set('bloom_level')} style={input}>
            <option value="">—</option>
            {BLOOM.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Explanation (for future practice modes — never shown in live exams)">
        <textarea value={form.explanation} onChange={set('explanation')} rows={2} style={{ ...input, resize: 'vertical' }} />
      </Field>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: '11px 24px' }}>
          {saving ? <><Spinner size={14} /> Saving…</> : (isEdit ? 'Save changes' : 'Add to bank')}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary" style={{ padding: '11px 24px' }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function Field({ label, required, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5 }}>
        {label}{required && <span aria-hidden="true" style={{ color: 'var(--error)' }}> *</span>}
      </span>
      {children}
    </label>
  )
}

const input = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: 14,
  border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit',
}
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 16px' }
