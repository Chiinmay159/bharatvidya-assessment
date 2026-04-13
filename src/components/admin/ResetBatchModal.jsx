import { FocusTrapModal } from '../shared/FocusTrapModal'

export function ResetBatchModal({ batch, attempts, resetNameInput, setResetNameInput, actionLoading, actionError, onConfirm, onClose }) {
  return (
    <FocusTrapModal ariaLabel="Confirm reset all attempts" onClose={onClose}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>&#x26A0;&#xFE0F;</div>
      <h3 style={modalTitle}>Reset all attempts?</h3>
      <p style={modalBody}>
        This will permanently delete <strong>all {attempts.length} submission{attempts.length !== 1 ? 's' : ''}</strong> for <strong>{batch.name}</strong>, including in-progress attempts.
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--error)', background: 'var(--error-lt)', padding: '8px 12px', borderRadius: 6 }}>
        This action cannot be undone.
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-2)' }}>
        Type the batch name to confirm:
      </p>
      <input
        value={resetNameInput}
        onChange={e => setResetNameInput(e.target.value)}
        placeholder={batch.name}
        style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border-md)', borderRadius: 6, fontSize: 13, marginBottom: 16, boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--text-1)' }}
      />
      {actionError && <p style={{ color: 'var(--error)', fontSize: 12, margin: '0 0 12px' }}>{actionError}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onConfirm}
          disabled={actionLoading || resetNameInput !== batch.name}
          style={{ ...btnDestructive, flex: 1, opacity: (actionLoading || resetNameInput !== batch.name) ? .4 : 1 }}
        >
          {actionLoading ? 'Resetting\u2026' : 'Yes, reset all'}
        </button>
        <button onClick={onClose} disabled={actionLoading} style={{ ...btnSecondary, flex: 1 }}>
          Cancel
        </button>
      </div>
    </FocusTrapModal>
  )
}

const modalTitle = { margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }
const modalBody  = { margin: '0 0 20px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }
const btnDestructive = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '9px 16px', borderRadius: 8, background: 'var(--error)', color: '#fff', fontSize: 13, fontWeight: 600 }
const btnSecondary = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-md)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500 }
