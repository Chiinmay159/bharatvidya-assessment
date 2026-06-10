/* ── Icons ──────────────────────────────────────────────────── */

export function CheckIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" fill="none" stroke="var(--success)" strokeWidth="2.5" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function XIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" fill="none" stroke="var(--error)" strokeWidth="2.5" viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
    </svg>
  )
}

export function WarningIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" fill="none" stroke="var(--warn)" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
    </svg>
  )
}

export function RetryIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="1 4 1 10 7 10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ClipboardIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" fill="none" stroke="var(--accent)" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <polyline points="9 14 11 16 15 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
