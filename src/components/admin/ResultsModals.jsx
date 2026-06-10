import { FocusTrapModal } from '../shared/FocusTrapModal'

/* ── Delete single attempt modal ───────────────── */
export function DeleteAttemptModal({ confirmDelete, actionError, actionLoading, onConfirm, onCancel, onClose, btnSecondary }) {
  return (
    <FocusTrapModal ariaLabel="Confirm delete attempt" onClose={onClose}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>&#x1F5D1;&#xFE0F;</div>
      <h3 style={modalTitle}>Delete attempt?</h3>
      <p style={modalBody}>
        <strong>{confirmDelete.student_name}</strong> ({confirmDelete.roll_number}) will be able to retake the exam. Their responses and score will be permanently deleted.
      </p>
      {actionError && <p style={{ color: 'var(--error)', fontSize: 12, margin: '0 0 12px' }}>{actionError}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onConfirm} disabled={actionLoading} style={{ ...btnDestructive, flex: 1, opacity: actionLoading ? .6 : 1 }}>
          {actionLoading ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button onClick={onCancel} disabled={actionLoading} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
      </div>
    </FocusTrapModal>
  )
}

/* ── Styles ───────────────────────────────────────────────── */
const btnDestructive = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '9px 16px', borderRadius: 8, background: 'var(--error)', color: '#fff', fontSize: 13, fontWeight: 600 }
const modalTitle = { margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }
const modalBody  = { margin: '0 0 20px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }
