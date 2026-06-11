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
  const [view, setView] = useState('bank')      // 'bank' | 'performance'
  // Lifetime cross-exam performance, keyed by bank_question_id
  const [perf, setPerf] = useState({})

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

      // Cross-exam lifetime performance (compounds as questions are reused)
      const { data: perfRows } = await supabase.rpc('bank_item_performance')
      setPerf(Object.fromEntries((perfRows ?? []).map(r => [r.bank_question_id, r])))
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setView(view === 'bank' ? 'performance' : 'bank')} className="btn btn-secondary" style={{ padding: '10px 16px' }}>
            {view === 'bank' ? 'Bank performance →' : '← Back to bank'}
          </button>
          {view === 'bank' && (
            <button onClick={() => setEditing('new')} className="btn btn-primary" style={{ padding: '10px 18px' }}>
              + New question
            </button>
          )}
        </div>
      </div>

      {view === 'performance' ? <BankPerformance perf={perf} loading={loading} /> : (<>

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
                  {/* Lifetime cross-exam performance, once the question has been answered */}
                  {perf[q.id] && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-2)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span title="Across all exams this question has appeared in">
                        lifetime: <strong>{Number(perf[q.id].difficulty_index).toFixed(2)}</strong> difficulty
                      </span>
                      <span>· {perf[q.id].n_responses} responses across {perf[q.id].exams_used} exam{perf[q.id].exams_used !== 1 ? 's' : ''}</span>
                      {perf[q.id].avg_time_s != null && <span>· {perf[q.id].avg_time_s}s avg</span>}
                    </div>
                  )}
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
      </>)}
    </div>
  )
}

/* ── Cross-exam bank performance (the compounding asset) ───── */
function BankPerformance({ perf, loading }) {
  const rows = Object.values(perf).sort((a, b) => b.n_responses - a.n_responses)
  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={26} color="var(--accent)" /></div>
  }
  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
        No performance data yet. Once questions composed from the bank are answered in live exams,
        their lifetime statistics appear here and sharpen with every reuse.
      </div>
    )
  }
  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
        Lifetime performance of bank questions across every exam they've appeared in. Difficulty index is the
        fraction answered correctly (lower = harder). Use it to retire weak items and trust strong ones.
      </p>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ ...th, textAlign: 'left' }}>Question</th>
              <th style={th}>Topic</th>
              <th style={th}>Difficulty tag</th>
              <th style={th} title="Fraction answered correctly across all exams">Lifetime difficulty</th>
              <th style={th}>Exams</th>
              <th style={th}>Responses</th>
              <th style={th}>Avg time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const di = Number(r.difficulty_index)
              const flag = di < 0.15 || di > 0.95
              return (
                <tr key={r.bank_question_id} style={{ borderBottom: '1px solid var(--border)', background: flag ? 'var(--warn-lt)' : undefined }}>
                  <td style={{ ...td, textAlign: 'left', maxWidth: 320 }}>{r.question_text.length > 90 ? r.question_text.slice(0, 89) + '…' : r.question_text}</td>
                  <td style={td}>{r.topic}</td>
                  <td style={td}>{r.difficulty}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{di.toFixed(2)}</td>
                  <td style={td}>{r.exams_used}</td>
                  <td style={td}>{r.n_responses}</td>
                  <td style={td}>{r.avg_time_s != null ? `${r.avg_time_s}s` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
        Highlighted rows are statistically extreme (too easy &gt; 0.95 or too hard &lt; 0.15) and worth reviewing.
      </p>
    </div>
  )
}

const th = { padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center', whiteSpace: 'nowrap' }
const td = { padding: '9px 12px', textAlign: 'center', color: 'var(--text-1)', verticalAlign: 'top' }

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
