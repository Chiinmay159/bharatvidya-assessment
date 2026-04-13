import { FocusTrapModal } from '../shared/FocusTrapModal'

export function ExportConfigModal({ exportCols, setExportCols, baseColumns, onSave, onClose }) {
  return (
    <FocusTrapModal ariaLabel="Export columns configuration" onClose={onClose}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, textAlign: 'left' }}>Export Columns</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {baseColumns.map(col => (
          <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={!!exportCols[col.key]}
              onChange={e => setExportCols(prev => ({ ...prev, [col.key]: e.target.checked }))}
              style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
            />
            {col.label}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onSave} style={btnPrimary}>Save & Close</button>
        <button onClick={onClose} style={btnSecondary}>Cancel</button>
      </div>
    </FocusTrapModal>
  )
}

const btnPrimary = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600 }
const btnSecondary = { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-md)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500 }
