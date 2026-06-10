import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'
import { FocusTrapModal } from '../shared/FocusTrapModal'
import { Spinner } from '../shared/Spinner'

/**
 * ComposePaperModal — build a batch paper from the question bank by blueprint.
 * Shows live availability per rule so the examiner sees shortfalls before
 * composing. Server enforces: approved-only, no duplicates, LRU rotation.
 */
export function ComposePaperModal({ batch, onComposed, onClose }) {
  const [availability, setAvailability] = useState([]) // [{topic, difficulty, n}]
  const [rules, setRules] = useState([{ topic: '', difficulty: '', count: 10 }])
  const [composing, setComposing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.from('bank_questions')
      .select('topic, difficulty')
      .eq('status', 'approved')
      .then(({ data }) => {
        const map = new Map()
        for (const r of data ?? []) {
          const k = `${r.topic}|${r.difficulty}`
          map.set(k, (map.get(k) || 0) + 1)
        }
        setAvailability([...map.entries()].map(([k, n]) => {
          const [topic, difficulty] = k.split('|')
          return { topic, difficulty, n }
        }))
      })
  }, [])

  const topics = [...new Set(availability.map(a => a.topic))].sort()
  const availableFor = (topic, difficulty) =>
    availability.filter(a => a.topic === topic && (!difficulty || a.difficulty === difficulty))
      .reduce((s, a) => s + a.n, 0)

  const setRule = (i, k, v) => setRules(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r))
  const totalRequested = rules.reduce((s, r) => s + (parseInt(r.count) || 0), 0)
  const allValid = rules.length > 0 && rules.every(r =>
    r.topic && (parseInt(r.count) || 0) > 0 && availableFor(r.topic, r.difficulty) >= parseInt(r.count))

  async function handleCompose() {
    setError(null)
    setComposing(true)
    try {
      const blueprint = rules.map(r => ({
        topic: r.topic,
        ...(r.difficulty ? { difficulty: r.difficulty } : {}),
        count: parseInt(r.count),
      }))
      const { data, error: err } = await supabase.rpc('compose_batch_from_bank', {
        p_batch_id: batch.id,
        p_blueprint: blueprint,
      })
      if (err) throw err
      onComposed(data)
    } catch (err) {
      setError(formatDbError(err, 'Composition failed.'))
      setComposing(false)
    }
  }

  return (
    <FocusTrapModal ariaLabel="Compose paper from question bank" onClose={onClose}>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, textAlign: 'left' }}>
        Compose paper from bank
      </h2>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-2)', textAlign: 'left', lineHeight: 1.55 }}>
        Questions are copied into <strong>{batch.name}</strong> from approved bank items,
        rotating the least-recently-used first.
      </p>

      {error && (
        <div role="alert" style={{ background: 'var(--error-lt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 14, textAlign: 'left' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        {rules.map((r, i) => {
          const avail = r.topic ? availableFor(r.topic, r.difficulty) : null
          const short = avail != null && avail < (parseInt(r.count) || 0)
          return (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={r.topic} onChange={e => setRule(i, 'topic', e.target.value)} aria-label="Topic" style={{ ...sel, flex: '2 1 130px' }}>
                <option value="">Topic…</option>
                {topics.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={r.difficulty} onChange={e => setRule(i, 'difficulty', e.target.value)} aria-label="Difficulty" style={{ ...sel, flex: '1 1 90px' }}>
                <option value="">any difficulty</option>
                {['easy', 'medium', 'hard'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <input
                type="number" min="1" value={r.count} aria-label="Count"
                onChange={e => setRule(i, 'count', e.target.value)}
                style={{ ...sel, width: 64, flex: '0 0 64px' }}
              />
              <span style={{ fontSize: 11, color: short ? 'var(--error)' : 'var(--text-3)', flex: '0 0 auto' }}>
                {avail != null ? `${avail} available` : ''}
              </span>
              {rules.length > 1 && (
                <button type="button" onClick={() => setRules(rs => rs.filter((_, j) => j !== i))}
                  aria-label="Remove rule" className="btn btn-secondary" style={{ padding: '4px 9px', fontSize: 12 }}>✕</button>
              )}
            </div>
          )
        })}
      </div>

      <button type="button" onClick={() => setRules(rs => [...rs, { topic: '', difficulty: '', count: 5 }])}
        className="btn btn-secondary" style={{ padding: '7px 14px', fontSize: 12, marginBottom: 18 }}>
        + Add rule
      </button>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handleCompose} disabled={!allValid || composing} className="btn btn-primary" style={{ flex: 1, padding: '11px 16px' }}>
          {composing ? <><Spinner size={14} /> Composing…</> : `Compose ${totalRequested} question${totalRequested !== 1 ? 's' : ''}`}
        </button>
        <button onClick={onClose} className="btn btn-secondary" style={{ flex: 1, padding: '11px 16px' }}>
          Cancel
        </button>
      </div>
    </FocusTrapModal>
  )
}

const sel = {
  padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-md)',
  borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text-1)',
  fontFamily: 'inherit',
}
