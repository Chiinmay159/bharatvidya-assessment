import { formatInTimeZone } from 'date-fns-tz'
import { LockIcon } from './batchIcons'

const STATUS_STYLE = {
  draft:     { bg: 'var(--surface-2)',  color: 'var(--text-3)',  border: 'var(--border)' },
  scheduled: { bg: 'var(--teal-lt)',           color: 'var(--teal)',        border: 'var(--teal-md)' },
  active:    { bg: 'var(--success-lt)', color: 'var(--success)', border: 'var(--success-md)' },
  completed: { bg: 'var(--accent-lt)',           color: 'var(--accent-deep)',        border: 'var(--accent-md)' },
}

const TRANSITIONS = {
  draft:     [{ label: 'Mark Scheduled', next: 'scheduled', variant: 'default' }],
  scheduled: [{ label: 'Start Now',      next: 'active',    variant: 'success' },
              { label: 'Revert Draft',   next: 'draft',     variant: 'danger'  }],
  active:    [{ label: 'End Exam',       next: 'completed', variant: 'danger'  }],
  completed: [],
}

export function BatchListRow({
  batch, isLast,
  questionCounts, startedCounts, submissionCounts, rosterCounts,
  transitioning,
  canManage = true, canMonitor = true,
  onSelectBatch, onManageQuestions, onManageRoster, onViewResults, onMissionControl,
  setCloneTarget, setDeleteTarget, setDeleteConfirmName, setConfirmAction,
}) {
  const ss          = STATUS_STYLE[batch.status] || STATUS_STYLE.draft
  const transitions = TRANSITIONS[batch.status] || []
  const isActive    = batch.status === 'active'
  const started     = startedCounts[batch.id]    ?? 0
  const submitted   = submissionCounts[batch.id] ?? 0
  const rostered    = rosterCounts[batch.id]     ?? 0

  return (
    <tr
      className="table-row"
      style={{ borderBottom: !isLast ? '1px solid var(--border)' : 'none' }}
    >
      {/* Name */}
      <td style={{ padding: '13px 14px', fontWeight: 600, color: 'var(--text-1)', minWidth: 140 }}>
        {batch.name}
        {batch.access_code && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-lt)', border: '1px solid var(--warn-md)', borderRadius: 'var(--radius-pill)', padding: '1px 6px', marginLeft: 6, verticalAlign: 'middle' }}>
            <LockIcon /> Code
          </span>
        )}
        {batch.max_attempts > 1 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: 'var(--teal)', background: 'var(--teal-lt)', border: '1px solid var(--teal-md)', borderRadius: 'var(--radius-pill)', padding: '1px 6px', marginLeft: 4, verticalAlign: 'middle' }}>
            {batch.max_attempts} attempts
          </span>
        )}
      </td>

      {/* Date */}
      <td style={{ padding: '13px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap', fontSize: 12 }}>
        {formatInTimeZone(new Date(batch.scheduled_start), 'Asia/Kolkata', 'dd MMM yy, hh:mm a')}
      </td>

      {/* Duration */}
      <td style={{ padding: '13px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
        {batch.duration_minutes} min
      </td>

      {/* Status badge */}
      <td style={{ padding: '13px 14px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 10px', borderRadius: 'var(--radius-pill)',
          fontSize: 11, fontWeight: 600,
          background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
          textTransform: 'capitalize', whiteSpace: 'nowrap',
        }}>
          {isActive && <span className="u-pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />}
          {batch.status}
        </span>
      </td>

      {/* Questions */}
      <td style={{ padding: '13px 14px', color: 'var(--text-2)' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{questionCounts[batch.id] ?? 0}</span>
        {batch.questions_per_student && (
          <span style={{ color: 'var(--text-3)', marginLeft: 3, fontSize: 11 }}>/ {batch.questions_per_student} ea</span>
        )}
      </td>

      {/* Roster */}
      <td style={{ padding: '13px 14px' }}>
        {rostered > 0
          ? <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{rostered}</span>
          : <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
        }
      </td>

      {/* Submissions / live progress */}
      <td style={{ padding: '13px 14px', minWidth: 110 }}>
        {isActive && rostered > 0 ? (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>
              {started} started · <strong style={{ color: 'var(--success)' }}>{submitted}</strong> done
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${rostered > 0 ? Math.round((submitted / rostered) * 100) : 0}%`,
                background: 'var(--success)', borderRadius: 3,
                transition: 'width .5s ease',
              }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
              {rostered > 0 ? Math.round((submitted / rostered) * 100) : 0}% of {rostered}
            </div>
          </div>
        ) : (
          <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{submitted}</span>
        )}
      </td>

      {/* Actions */}
      <td style={{ padding: '13px 14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {canManage && <button onClick={() => onSelectBatch(batch)} className="action-link">Edit</button>}
          {canManage && <button onClick={() => onManageQuestions(batch)} className="action-link">Questions</button>}
          {canManage && <button onClick={() => onManageRoster(batch)} className="action-link">Roster</button>}
          {(batch.status === 'active' || batch.status === 'completed') && (
            <button onClick={() => onViewResults(batch)} className="action-link">Results</button>
          )}
          {batch.status === 'active' && canMonitor && onMissionControl && (
            <button onClick={() => onMissionControl(batch)} className="action-link" style={{ fontWeight: 700 }}>Live</button>
          )}
          {canManage && <button onClick={() => setCloneTarget(batch)} className="action-link">Clone</button>}
          {canManage && <button
            onClick={() => { setDeleteTarget(batch); setDeleteConfirmName('') }}
            className="action-link"
            style={{ color: 'var(--error)' }}
          >
            Delete
          </button>}

          {canManage && transitions.map(t => (
            <button
              key={t.next}
              onClick={() => setConfirmAction({ batchId: batch.id, ...t })}
              disabled={transitioning === batch.id}
              style={{
                all: 'unset', cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                padding: '3px 9px', borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                whiteSpace: 'nowrap',
                ...(t.variant === 'success'
                  ? { background: 'var(--success-lt)', color: 'var(--success)', borderColor: 'var(--success-md)' }
                  : t.variant === 'danger'
                    ? { background: 'var(--error-lt)', color: 'var(--error)', borderColor: 'var(--error-md)' }
                    : { background: 'var(--surface)', color: 'var(--text-2)', borderColor: 'var(--border-md)' }
                ),
                opacity: transitioning === batch.id ? .5 : 1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </td>
    </tr>
  )
}
