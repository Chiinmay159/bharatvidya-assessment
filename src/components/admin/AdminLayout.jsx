import { supabase } from '../../lib/supabase'

export function AdminLayout({ user, children }) {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Top nav */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        padding: '0 24px',
        height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '-.2px' }}>BV</span>
          </div>
          <div>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>BharatVidya Exams</span>
            <span style={{
              marginLeft: 8, fontSize: 11, fontWeight: 500,
              padding: '2px 7px', borderRadius: 99,
              background: 'var(--accent-lt)', color: 'var(--accent)',
              border: '1px solid var(--accent-md)',
            }}>
              Admin
            </span>
          </div>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{user?.email}</span>
          <button
            onClick={handleSignOut}
            style={{
              all: 'unset', cursor: 'pointer',
              fontSize: 13, fontWeight: 500,
              color: 'var(--text-2)',
              padding: '5px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Page body */}
      <main style={{ flex: 1, maxWidth: 1100, width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        {children}
      </main>
    </div>
  )
}
