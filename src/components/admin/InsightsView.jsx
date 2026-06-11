import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { formatDbError } from '../../lib/errors'
import { Spinner } from '../shared/Spinner'

/**
 * InsightsView — program-level, longitudinal analytics across all exams
 * the admin can see (org-scoped server-side). Complements the per-exam
 * Item Analysis: this is the "how is the whole programme doing" view.
 */
export function InsightsView() {
  const [rows, setRows] = useState(null)       // program_analytics rows
  const [topics, setTopics] = useState(null)   // bank_item_performance aggregated by topic
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [pa, bp] = await Promise.all([
          supabase.rpc('program_analytics'),
          supabase.rpc('bank_item_performance'),
        ])
        if (cancelled) return
        if (pa.error) throw pa.error
        setRows(pa.data ?? [])
        // Aggregate bank performance into per-topic difficulty
        const byTopic = {}
        for (const r of bp.data ?? []) {
          const t = byTopic[r.topic] ?? { topic: r.topic, sum: 0, n: 0, responses: 0 }
          t.sum += Number(r.difficulty_index) * Number(r.n_responses)
          t.n += Number(r.n_responses)
          t.responses += Number(r.n_responses)
          byTopic[r.topic] = t
        }
        setTopics(Object.values(byTopic)
          .map(t => ({ topic: t.topic, difficulty: t.n ? +(t.sum / t.n).toFixed(2) : 0, responses: t.responses }))
          .sort((a, b) => a.difficulty - b.difficulty))
      } catch (err) {
        if (!cancelled) setError(formatDbError(err, 'Failed to load insights.'))
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (error) return <div role="alert" className="card" style={{ padding: 20, color: 'var(--error)', fontSize: 14 }}>{error}</div>
  if (!rows) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={26} color="var(--accent)" /></div>

  const completed = rows.filter(r => r.submissions > 0)
  const totalSubs = completed.reduce((s, r) => s + Number(r.submissions), 0)
  const withAvg = completed.filter(r => r.avg_percentage != null)
  const overallAvg = withAvg.length ? Math.round(withAvg.reduce((s, r) => s + Number(r.avg_percentage), 0) / withAvg.length) : null
  const withPass = completed.filter(r => r.pass_rate != null)
  const overallPass = withPass.length ? Math.round(withPass.reduce((s, r) => s + Number(r.pass_rate), 0) / withPass.length) : null

  // Time series (chronological), short labels
  const series = completed.map(r => ({
    name: r.batch_name.length > 14 ? r.batch_name.slice(0, 13) + '…' : r.batch_name,
    avg: r.avg_percentage == null ? null : Number(r.avg_percentage),
    subs: Number(r.submissions),
  }))

  if (completed.length === 0) {
    return (
      <div>
        <Header />
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
          No completed exams yet. Once exams run, programme-level trends appear here.
        </div>
      </div>
    )
  }

  return (
    <div>
      <Header />

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <Stat n={completed.length} k="Exams conducted" />
        <Stat n={totalSubs} k="Submissions" />
        <Stat n={overallAvg == null ? '—' : `${overallAvg}%`} k="Average score" />
        <Stat n={overallPass == null ? '—' : `${overallPass}%`} k="Average pass rate" />
      </div>

      {/* Average score trend */}
      <Section title="Average score by exam (chronological)">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={series} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--border)' }} />
            <Line type="monotone" dataKey="avg" stroke="var(--blue)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent-deep)' }} name="Avg %" />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      {/* Submissions per exam */}
      <Section title="Submissions per exam">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={series} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--border)' }} />
            <Bar dataKey="subs" fill="var(--blue-mid)" radius={[3, 3, 0, 0]} name="Submissions" />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Topic difficulty (from the bank, cross-exam) */}
      {topics && topics.length > 0 && (
        <Section title="Topic difficulty (lifetime, hardest first)">
          <ResponsiveContainer width="100%" height={Math.max(160, topics.length * 34)}>
            <BarChart data={topics} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
              <YAxis type="category" dataKey="topic" width={120} tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--border)' }}
                formatter={(v, _n, p) => [`${v} difficulty · ${p.payload.responses} responses`, p.payload.topic]} />
              <Bar dataKey="difficulty" radius={[0, 3, 3, 0]} name="Difficulty index">
                {topics.map((t, i) => (
                  <Cell key={i} fill={t.difficulty < 0.4 ? 'var(--error)' : t.difficulty > 0.85 ? 'var(--accent-deep)' : 'var(--success)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
            Difficulty index = fraction answered correctly across all exams. Red = hard (&lt;0.4), gold = very easy (&gt;0.85).
          </p>
        </Section>
      )}
    </div>
  )
}

function Header() {
  return (
    <>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>Insights</h2>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-3)' }}>
        Programme-level analytics across every exam — trends, volume, and where students struggle.
      </p>
    </>
  )
}

function Stat({ n, k }) {
  return (
    <div className="stat-card" style={{ minWidth: 130 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 4 }}>{k}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{title}</h3>
      {children}
    </div>
  )
}
