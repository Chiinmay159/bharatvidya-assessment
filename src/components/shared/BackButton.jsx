/**
 * Shared "← Back" button with consistent styling and aria-label.
 *
 * Props:
 *   onClick — click handler (required)
 *   label   — accessible label (default "Go back")
 */
export function BackButton({ onClick, label = 'Go back' }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: 'var(--text-2)',
        fontSize: 14,
        fontWeight: 500,
        padding: '4px 0',
      }}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 12H5m0 0l7-7m-7 7l7 7"
        />
      </svg>
      Back
    </button>
  )
}
