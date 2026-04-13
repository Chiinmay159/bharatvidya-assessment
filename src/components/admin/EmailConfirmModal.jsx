import { FocusTrapModal } from '../shared/FocusTrapModal'

export function EmailConfirmModal({ batch, emailableCount, emailing, onConfirm, onClose }) {
  return (
    <FocusTrapModal ariaLabel="Confirm email results" onClose={onClose}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>&#x2709;&#xFE0F;</div>
      <h3 style={modalTitle}>Email results?</h3>
      <p style={modalBody}>
        Send exam results to <strong>{emailableCount} students</strong> who have email addresses on record for <strong>{batch.name}</strong>.
      </p>
      <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--warn)', background: 'var(--warn-lt)', padding: '8px 12px', borderRadius: 6 }}>
        Resend free tier: 100 emails/day. Make sure RESEND_API_KEY is configured in Vercel.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onConfirm} disabled={emailing} style={{ ...btnPrimary, flex: 1, opacity: emailing ? .6 : 1 }}>
          {emailing ? 'Sending\u2026' : `Send to ${emailableCount} students`}
        </button>
        <button onClick={onClose} disabled={emailing} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
      </div>
    </FocusTrapModal>
  )
}

const modalTitle = { margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }
const modalBody  = { margin: '0 0 20px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }
const btnPrimary = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600 }
const btnSecondary = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-md)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500 }
