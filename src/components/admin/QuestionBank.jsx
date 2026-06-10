import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'
import { Spinner } from '../shared/Spinner'
import { QuestionBankForm } from './QuestionBankForm'

const DIFFICULTIES = ['easy', 'medium', 'hard']
const STATUSES = ['draft', 'in_review', 'approved', 'retired']
const STATUS_LABEL = { draft: 'Draft', in_review: 'In review', approved: 'Approved', retired: 'Retired' }
const STATUS_COLOR = {
  draft:     { bg: 'var(--surface-2)',  fg: 'var(--text-2)' },
  in_review: { bg: 'var(--warn-lt)',    fg: 'var(--warn)' },
  approved:  { bg: 'var(--success-lt)', fg: 'var(--success)' },
  retired:   { bg: 'var(--error-lt)',   fg: 'var(--error)' },
}

/**
 * QuestionBank — browse, author, and review the reusable question bank.
 * Review rules are enforced server-side (no self-approval; edits to
 * approved questions revert to draft) — the UI just surfaces them.
 */
export function QuestionBank({ userEmail }) {
  const [questions, setQuestions] = useState([])
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  // Filters
  const [fTopic, setFTopic] = useState('')
  const [fDifficulty, setFDifficulty] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fSearch, setFSearch] = useState('')
  // Editing
  const [editing, setEditing] = useState(null) // null | 'new' | question row

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let q = supabase.from('bank_questions')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(500)
      if (fTopic)      q = q.eq('topic', fTopic)
      if (fDifficulty) q = q.eq('difficulty', fDifficulty)
      if (fStatus)     q = q.eq('status', fStatus)
      if (fSearch)     q = q.ilike('question_text', `%${fSearch}%`)
      const { data, error: err } = await q
      if (err) throw err
      setQuestions(data ?? [])

      const { data: topicRows } = await supabase.from('bank_questions').select('topic')
      setTopics([...new Set((topicRows ?? []).map(r => r.topic))].sort())
    } catch (err) {
      setError(formatDbError(err, 'Failed to load the question bank.'))
    } finally {
      setLoading(false)
    }
  }, [fTopic, fDifficulty, fStatus, fSearch])

  useEffect(() => { load() }, [load])

  async function setStatus(row, status) {
    setNotice(null)
    setError(null)
    const { error: err } = await supabase.from('bank_questions')
      .update({ status }).eq('id', row.id)
    if (err) {
      setError(formatDbError(err, 'Status change failed.'))
    } else {
      setNotice(`"${truncate(row.question_text, 40)}" → ${STATUS_LABEL[status]}`)
      load()
    }
  }

  if (editing) {
    return (
      <QuestionBankForm
        question={editing === 'new' ? null : editing}
        topics={topics}
        onSaved={() => { setEditing(null); load() }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  const counts = questions.reduce((a, q) => { a[q.status] = (a[q.status] || 0) + 1; return a }, {})

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.3px' }}>Question Bank</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            {questions.length} shown
            {counts.approved ? ` · ${counts.approved} approved` : ''}
            {counts.in_review ? ` · ${counts.in_review} awaiting review` : ''}
          </p>
        </div>
        <button onClick={() => setEditing('new')} className="btn btn-primary" style={{ padding: '10px 18px' }}>
          + New question
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          type="search" placeholder="Search question text…" value={fSearch}
          onChange={e => setFSearch(e.target.value)} aria-label="Search questions"
          style={{ ...filterInput, flex: '1 1 220px' }}
        />
        <select value={fTopic} onChange={e => setFTopic(e.target.value)} aria-label="Filter by topic" style={filterInput}>
          <option value="">All topics</option>
          {topics.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fDifficulty} onChange={e => setFDifficulty(e.target.value)} aria-label="Filter by difficulty" style={filterInput}>
          <option value="">All difficulties</option>
          {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Filter by status" style={filterInput}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {notice && <Banner kind="success">{notice}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={26} color="var(--accent)" /></div>
      ) : questions.length === 0 ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
          {fTopic || fStatus || fDifficulty || fSearch
            ? 'No questions match these filters.'
            : 'The bank is empty. Add your first question to start building reusable papers.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {questions.map(q => {
            const sc = STATUS_COLOR[q.status]
            const canApprove = q.status === 'in_review' && q.created_by !== userEmail
            return (
              <div key={q.id} className="card" style={{ padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 500, color: 'var(--text-1)', lineHeight: 1.5 }}>
                    {truncate(q.question_text, 140)}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-3)', alignItems: 'center' }}>
                    <span style={{ ...pill, background: sc.bg, color: sc.fg }}>{STATUS_LABEL[q.status]}</span>
                    <span style={pill}>{q.topic}{q.subtopic ? ` / ${q.subtopic}` : ''}</span>
                    <span style={pill}>{q.difficulty}</span>
                    <span style={pill}>{q.language}</span>
                    {q.version > 1 && <span style={pill}>v{q.version}</span>}
                    {q.times_used > 0 && <span>used {q.times_used}×</span>}
                    <span>by {q.created_by}</span>
                    {q.reviewed_by && <span>· approved by {q.reviewed_by}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditing(q)} className="btn btn-secondary" style={smallBtn}>Edit</button>
                  {q.status === 'draft' && (
                    <button onClick={() => setStatus(q, 'in_review')} className="btn btn-secondary" style={smallBtn}>Submit for review</button>
                  )}
                  {q.status === 'in_review' && (
                    canApprove
                      ? <button onClick={() => setStatus(q, 'approved')} className="btn btn-success" style={smallBtn}>Approve</button>
                      : <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center' }} title="Four-eyes rule: a different admin must approve">awaiting another reviewer</span>
                  )}
                  {q.status === 'approved' && (
                    <button onClick={() => setStatus(q, 'retired')} className="btn btn-secondary" style={smallBtn}>Retire</button>
                  )}
                  {q.status === 'retired' && (
                    <button onClick={() => setStatus(q, 'draft')} className="btn btn-secondary" style={smallBtn}>Reinstate as draft</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Banner({ kind, children }) {
  const isErr = kind === 'error'
  return (
    <div role={isErr ? 'alert' : 'status'} style={{
      padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14,
      background: isErr ? 'var(--error-lt)' : 'var(--success-lt)',
      color: isErr ? 'var(--error)' : 'var(--success)',
      border: '1px solid var(--border)',
    }}>{children}</div>
  )
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s }

const filterInput = {
  padding: '9px 12px', fontSize: 13, border: '1px solid var(--border-md)',
  borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text-1)',
  fontFamily: 'inherit',
}
const pill = {
  padding: '2px 8px', borderRadius: 'var(--radius-pill)',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  fontSize: 11, fontWeight: 600,
}
const smallBtn = { padding: '6px 12px', fontSize: 12 }
