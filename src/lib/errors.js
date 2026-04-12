/**
 * Maps raw Supabase/PostgreSQL errors to user-friendly messages.
 * Students should never see technical error text.
 */

const PG_CODE_MAP = {
  '23505': 'This record already exists. Please check your details and try again.',
  '23503': 'A required reference was not found. Please go back and try again.',
  '42501': 'Access denied. Please contact your invigilator.',
  'PGRST116': 'No record found. Please check your details.',
  'PGRST301': 'Your session has expired. Please refresh the page.',
}

const PATTERN_MAP = [
  { re: /row.level security/i,  msg: 'Access denied. Please contact your invigilator.' },
  { re: /duplicate key/i,       msg: 'This record already exists. Please check your details.' },
  { re: /foreign key/i,         msg: 'A required record was not found. Please go back and try again.' },
  { re: /violates/i,            msg: 'Your request could not be processed. Please try again.' },
  { re: /JWT/i,                 msg: 'Your session has expired. Please refresh the page.' },
  { re: /network/i,             msg: 'Network error. Please check your connection and try again.' },
  { re: /timeout/i,             msg: 'The request timed out. Please try again.' },
  { re: /failed to fetch/i,     msg: 'Could not reach the server. Please check your connection.' },
]

/**
 * @param {Error | { message?: string; code?: string } | string | null} err
 * @param {string} [fallback]
 * @returns {string}
 */
export function formatDbError(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback
  const msg  = typeof err === 'string' ? err : (err.message || '')
  const code = typeof err === 'object' ? (err.code || '') : ''

  if (PG_CODE_MAP[code]) return PG_CODE_MAP[code]
  for (const { re, msg: friendly } of PATTERN_MAP) {
    if (re.test(msg)) return friendly
  }
  // Return as-is if already human-readable (no technical keywords, reasonable length)
  if (msg && !/error|exception|supabase|postgres|pgrst|sql|violates/i.test(msg) && msg.length < 200) {
    return msg
  }
  return fallback
}
