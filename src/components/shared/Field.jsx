import { Children, cloneElement, isValidElement } from 'react'

/**
 * Shared form field wrapper with accessible label association.
 *
 * Generates a stable `id` from the label text and passes it to the
 * child input via React.cloneElement, then uses `htmlFor` on the
 * `<label>` so assistive tech correctly links them.
 *
 * Props:
 *   label    — field label text (required)
 *   required — show asterisk (optional)
 *   hint     — helper text shown beside/below label (optional)
 *   htmlFor  — explicit id override (optional)
 *   children — a single input element
 */
export function Field({ label, required, hint, htmlFor, children }) {
  const fieldId = htmlFor || `field-${label.replace(/\s+/g, '-').toLowerCase()}`

  // Clone the first valid child and inject the id
  const enhancedChildren = Children.map(children, (child) => {
    if (isValidElement(child) && !child.props.id) {
      return cloneElement(child, { id: fieldId })
    }
    return child
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label
          htmlFor={fieldId}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}
        >
          {label}
          {required && (
            <span style={{ color: 'var(--error)', marginLeft: 2 }}>*</span>
          )}
        </label>
        {hint && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{hint}</span>
        )}
      </div>
      {enhancedChildren}
    </div>
  )
}
