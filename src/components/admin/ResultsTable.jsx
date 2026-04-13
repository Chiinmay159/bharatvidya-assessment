import { formatInTimeZone } from 'date-fns-tz'

export function ResultsTable({ batch, sorted, tabSwitches, sortKey, sortDir, toggleSort, onDeleteAttempt }) {
  const hasRetries = (batch.max_attempts ?? 1) > 1
  const passThreshold = batch.pass_percentage ?? 60

  const columns = [
    { label: 'Roll No.',   key: 'roll_number' },
    { label: 'Name',       key: 'student_name' },
    ...(hasRetries ? [{ label: 'Attempt', key: 'attempt_number' }] : []),
    { label: 'Score',      key: 'score' },
    { label: 'Total',      key: 'total_questions' },
    { label: '%',          key: 'percentage' },
    { label: 'Time (min)', key: null },
    { label: 'Tab Sw.',    key: null },
    { label: 'Submitted',  key: null },
    { label: '',           key: null },
  ]

  return (
    <div className="card" style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <caption className="sr-only">Student exam results for {batch.name}</caption>
        <thead>
          <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
            {columns.map(({ label, key }, i) => (
              <th
                key={i}
                scope="col"
                onClick={key ? () => toggleSort(key) : undefined}
                aria-sort={key ? (sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', fontSize: 12, whiteSpace: 'nowrap', cursor: key ? 'pointer' : 'default', userSelect: 'none' }}
              >
                {label}
                {sortKey === key && <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((a, i) => {
            const pct       = a.total_questions ? ((a.score / a.total_questions) * 100).toFixed(1) : '-'
            const timeTaken = a.submitted_at && a.started_at
              ? Math.round((new Date(a.submitted_at) - new Date(a.started_at)) / 60000) : '-'
            const passed  = parseFloat(pct) >= passThreshold
            const tswitch = tabSwitches[a.id] || 0
            return (
              <tr key={a.id} style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>{a.roll_number}</td>
                <td style={{ padding: '11px 14px', fontWeight: 500, color: 'var(--text-1)' }}>{a.student_name}</td>
                {hasRetries && (
                  <td style={{ padding: '11px 14px', color: 'var(--text-3)', fontSize: 12 }}>{a.attempt_number ?? 1}</td>
                )}
                <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--text-1)' }}>{a.score ?? '-'}</td>
                <td style={{ padding: '11px 14px', color: 'var(--text-3)' }}>{a.total_questions ?? '-'}</td>
                <td style={{ padding: '11px 14px' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: passed ? 'var(--success)' : 'var(--error)' }}>
                    {pct}{pct !== '-' ? '%' : ''}
                  </span>
                </td>
                <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>{timeTaken}</td>
                <td style={{ padding: '11px 14px', color: tswitch > 0 ? 'var(--warn)' : 'var(--text-3)', fontWeight: tswitch > 0 ? 600 : 400 }}>
                  {tswitch || '\u2014'}
                </td>
                <td style={{ padding: '11px 14px', color: 'var(--text-3)', fontSize: 12 }}>
                  {a.submitted_at ? formatInTimeZone(new Date(a.submitted_at), 'Asia/Kolkata', 'dd MMM, hh:mm a') : '-'}
                </td>
                <td style={{ padding: '11px 14px' }} className="no-print">
                  <button onClick={() => onDeleteAttempt(a)} style={deleteLink}>Delete</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const deleteLink = { all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--error)', padding: '3px 8px', borderRadius: 'var(--radius-xs)', border: '1px solid #FECACA', background: 'var(--error-lt)', whiteSpace: 'nowrap' }
