import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * SeriesStanding — the student's running total in a modular exam series.
 * Shown on the result screen when the batch belongs to a series.
 *
 * Visibility is enforced server-side: hidden-result modules arrive as
 * 'pending' with no marks, and the running total excludes them.
 * Fails silently — this panel must never disrupt the result screen.
 */
export function SeriesStanding({ batch, rollNumber, email }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (!email) return // standing is keyed on roll + email
        const { data: ser } = await supabase.rpc('get_batch_series', { p_batch_id: batch.id })
        const series = Array.isArray(ser) ? ser[0] : ser
        if (!series?.series_id || cancelled) return
        const { data } = await supabase.rpc('get_my_series_standing', {
          p_series_id:    series.series_id,
          p_roll_number:  rollNumber,
          p_email:        email,
        })
        if (!cancelled && Array.isArray(data) && data.length > 0) setRows(data)
      } catch { /* never disrupt the result screen */ }
    }
    const t = setTimeout(load, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [batch.id, rollNumber, email])

  if (!rows) return null

  const totalWeight = rows.reduce((s, r) => s + r.weight_marks, 0)
  const { running_total, visible_weight_total, series_name } = rows[0]

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16, textAlign: 'left' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
        {series_name} — your standing
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
        {rows.map(r => (
          <div key={r.module_position} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
            <span style={{ color: 'var(--text-2)' }}>{r.module_label}</span>
            <span style={{ fontWeight: 600, color: statusColor(r.status), whiteSpace: 'nowrap' }}>
              {r.status === 'scored' && `${r.my_marks} / ${r.weight_marks}`}
              {r.status === 'pending' && 'awaiting results'}
              {r.status === 'upcoming' && 'upcoming'}
              {r.status === 'absent' && 'absent'}
            </span>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--accent-lt)', border: '1px solid var(--accent-md)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-deep)' }}>Running total</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-deep)' }}>
          {running_total} <span style={{ fontSize: 12, fontWeight: 600 }}>/ {visible_weight_total} so far · {totalWeight} overall</span>
        </span>
      </div>
    </div>
  )
}

function statusColor(status) {
  if (status === 'scored') return 'var(--text-1)'
  if (status === 'absent') return 'var(--error)'
  return 'var(--text-3)'
}
