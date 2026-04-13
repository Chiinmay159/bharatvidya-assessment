/**
 * Shared animated spinner SVG.
 *
 * Props:
 *   size      — width/height in px (default 24)
 *   color     — stroke color (default 'currentColor')
 *   className — extra CSS class (optional)
 */
export function Spinner({ size = 24, color = 'currentColor', className = '' }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`u-spin ${className}`}
      style={{ display: 'block' }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray="31"
        strokeDashoffset="10"
      />
    </svg>
  )
}
