import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

export function ResultsAnalytics({ histogram, hardest, easiest }) {
  return (
    <div style={{ marginBottom: 24 }} className="no-print">
      <div className="card" style={{ padding: '24px', marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Score Distribution</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={histogram} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="range" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip formatter={(v) => [v, 'Students']} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {histogram.map((_, i) => (
                <Cell key={i} fill={i >= 6 ? 'var(--success)' : i >= 4 ? 'var(--accent)' : 'var(--error)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <QuestionList title="Top 5 Hardest Questions" questions={hardest} colorVar="var(--error)" />
        <QuestionList title="Top 5 Easiest Questions"  questions={easiest} colorVar="var(--success)" />
      </div>
    </div>
  )
}

function QuestionList({ title, questions, colorVar }) {
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{title}</h4>
      {questions.length === 0
        ? <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>Not enough data</p>
        : questions.map((q, i) => (
          <div key={q.id} style={{ marginBottom: i < questions.length - 1 ? 10 : 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 2, lineHeight: 1.4 }}>{q.text}…</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: colorVar }}>{q.pct}% correct ({q.attempts} attempts)</div>
          </div>
        ))
      }
    </div>
  )
}
