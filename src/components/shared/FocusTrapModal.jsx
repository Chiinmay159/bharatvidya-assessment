import { useEffect, useRef, useCallback } from 'react'

/**
 * Accessible modal overlay with:
 *  - Focus trap (Tab / Shift+Tab cycle within modal)
 *  - Escape key to close
 *  - Focus restore on unmount
 *  - ARIA role="dialog" + aria-modal
 *  - Backdrop click to close (optional)
 *
 * Props:
 *   onClose       — called on Escape or backdrop click (optional)
 *   ariaLabel     — accessible name for the dialog (required)
 *   closeOnBackdrop — whether clicking backdrop calls onClose (default: true)
 *   children      — modal content
 */
export function FocusTrapModal({ onClose, ariaLabel, closeOnBackdrop = true, children }) {
  const modalRef = useRef(null)
  const previousActiveRef = useRef(null)

  // Save previously focused element and focus the modal
  useEffect(() => {
    previousActiveRef.current = document.activeElement

    // Focus the first focusable element inside the modal, or the modal itself
    const timer = requestAnimationFrame(() => {
      if (!modalRef.current) return
      const focusable = getFocusableElements(modalRef.current)
      if (focusable.length > 0) {
        focusable[0].focus()
      } else {
        modalRef.current.focus()
      }
    })

    return () => {
      cancelAnimationFrame(timer)
      // Restore focus on unmount
      if (previousActiveRef.current && typeof previousActiveRef.current.focus === 'function') {
        previousActiveRef.current.focus()
      }
    }
  }, [])

  // Trap Tab key within modal
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation()
        onClose()
        return
      }

      if (e.key !== 'Tab') return
      if (!modalRef.current) return

      const focusable = getFocusableElements(modalRef.current)
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [onClose],
  )

  function handleBackdropClick(e) {
    if (closeOnBackdrop && onClose && e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      ref={modalRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(15,23,42,.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card u-slide-up"
        style={{
          maxWidth: 440,
          width: '100%',
          padding: '36px 28px',
          textAlign: 'center',
          boxShadow: 'var(--shadow-xl)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** Returns focusable elements inside a container */
function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  )
}
