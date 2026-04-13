export function ResultsSummaryBar({ attempts, avg, median, stddev, highest, avgTime }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      <StatCard label="Submissions" value={attempts.length} />
      {avg    !== null && <StatCard label="Class average"  value={`${avg}%`} />}
      {median !== null && <StatCard label="Median"         value={`${median}%`} />}
      {stddev !== null && <StatCard label="Std deviation"  value={`${stddev}%`} />}
      {highest!== null && <StatCard label="Highest"        value={`${highest}%`} />}
      {avgTime!== null && <StatCard label="Avg time"       value={`${avgTime} min`} />}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="card" style={{ padding: '14px 20px', minWidth: 100 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{label}</div>
    </div>
  )
}
