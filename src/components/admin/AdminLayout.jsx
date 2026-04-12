import { supabase } from '../../lib/supabase'

export function AdminLayout({ user, children, navItems = [] }) {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const initials = user?.email?.[0]?.toUpperCase() ?? 'A'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top nav ──────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        height: 56,
        display: 'flex', alignItems: 'stretch',
        padding: '0 20px',
        gap: 0,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 20, borderRight: '1px solid var(--border)', flexShrink: 0 }}>
          <img src="/logo.png" alt="BharatVidya" style={{ width: 30, height: 30, borderRadius: '50%' }} />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', letterSpacing: '-.1px' }}>BharatVidya</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Admin Portal</div>
          </div>
        </div>

        {/* Nav tabs */}
        {navItems.length > 0 && (
          <nav style={{ display: 'flex', alignItems: 'stretch', paddingLeft: 4, flex: 1 }}>
            {navItems.map(item => (
              <button
                key={item.label}
                onClick={item.onClick}
                className={`nav-tab${item.active ? ' is-active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}

        {/* Right side — user */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--accent-lt)', border: '1.5px solid var(--accent-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
            }}>
              {initials}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="btn btn-secondary"
            style={{ padding: '5px 12px', fontSize: 12 }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Page body ────────────────────────────────────── */}
      <main style={{ flex: 1, maxWidth: 1100, width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        {children}
      </main>
    </div>
  )
}
