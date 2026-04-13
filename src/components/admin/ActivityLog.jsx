import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'

const ACTION_LABELS = {
  status_changed:        'Status changed',
  batch_cloned:          'Batch cloned',
  bulk_batches_created:  'Bulk batches created',
  roster_uploaded:       'Roster uploaded',
  questions_replaced:    'Questions replaced',
  attempt_deleted:       'Attempt deleted',
  batch_reset:           'Batch reset',
  results_exported:      'Results exported',
  results_emailed:       'Results emailed',
}

const ACTION_COLORS = {
  status_changed:       { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
  batch_cloned:         { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
  bulk_batches_created: { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
  roster_uploaded:      { bg: 'var(--accent-lt)', color: 'var(--accent)', border: 'var(--accent-md)' },
  questions_replaced:   { bg: 'var(--accent-lt)', color: 'var(--accent)', border: 'var(--accent-md)' },
  attempt_deleted:      { bg: 'var(--error-lt)', color: 'var(--error)', border: '#FECACA' },
  batch_reset:          { bg: 'var(--error-lt)', color: 'var(--error)', border: '#FECACA' },
  results_exported:     { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' },
  results_emailed:      { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' },
}

/**
 * 2.1 Activity Log — shows recent audit_log events, filterable by action type
 */
export function ActivityLog({ onBack }) {
  const [events,    setEvents]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('all')
  const [page,      setPage]      = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => {
    let cancelled = false
    async function fetchEvents() {
      setLoading(true)
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (filter !== 'all') {
        query = query.eq('action', filter)
      }
      const { data } = await query
      if (!cancelled) {
        // Append on pagination, replace on filter change (page resets to 0)
        setEvents(prev => page === 0 ? (data || []) : [...prev, ...(data || [])])
        setLoading(false)
      }
    }
    fetchEvents()
    return () => { cancelled = true }
  }, [filter, page])

  function formatDetails(details) {
    if (!details) return null
    const parts = []
    if (details.new_status) parts.push(`→ ${details.new_status}`)
    if (details.count !== undefined) parts.push(`${details.count} records`)
    if (details.source_name) parts.push(`from "${details.source_name}"`)
    if (details.batch_name) parts.push(`"${details.batch_name}"`)
    if (details.roll_number) parts.push(`Roll: ${details.roll_number}`)
    return parts.join(' · ')
  }

  return (
    <div>
      <button onClick={onBack} style={backBtn}>← Back to batches</button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>Activity Log</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>Recent admin actions</p>
        </div>
        <select
          value={filter}
          onChange={e => { setFilter(e.target.value); setPage(0) }}
          style={{ padding: '7px 12px', border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--text-1)', background: 'var(--surface)', cursor: 'pointer' }}
        >
          <option value="all">All actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>Loading…</div>
      )}

      {!loading && events.length === 0 && (
        <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>No activity recorded yet.</p>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <caption className="sr-only">Admin activity log</caption>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {['Time', 'Action', 'Actor', 'Details'].map(h => (
                  <th key={h} scope="col" style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => {
                const style = ACTION_COLORS[ev.action] || { bg: 'var(--surface-2)', color: 'var(--text-2)', border: 'var(--border)' }
                const detail = formatDetails(ev.details)
                return (
                  <tr key={ev.id} style={{ borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-3)', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {formatInTimeZone(new Date(ev.created_at), 'Asia/Kolkata', 'dd MMM, hh:mm a')}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                        fontSize: 11, fontWeight: 600,
                        background: style.bg, color: style.color, border: `1px solid ${style.border}`,
                      }}>
                        {ACTION_LABELS[ev.action] || ev.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-2)', fontSize: 12 }}>{ev.actor}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-2)', fontSize: 12 }}>{detail || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {events.length === PAGE_SIZE && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => setPage(p => p + 1)} style={btnSecondary}>Load more</button>
        </div>
      )}
    </div>
  )
}

const backBtn = {
  all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20,
}
const btnSecondary = {
  all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
  padding: '8px 16px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-md)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500,
}
