// Timestamped factor names so multiple enrollments are tellable apart in
// the portal's factor lists (the name is Supabase-internal; authenticator
// apps label entries from the otpauth issuer instead).
export function enrollmentName(prefix = 'Authenticator') {
  const d = new Date()
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  return `${prefix} · ${day}, ${time}`
}
