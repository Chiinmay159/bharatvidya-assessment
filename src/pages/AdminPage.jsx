import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AdminLayout }      from '../components/admin/AdminLayout'
import { AdminDashboard }   from '../components/admin/AdminDashboard'
import { BatchList }        from '../components/admin/BatchList'
import { BatchForm }        from '../components/admin/BatchForm'
import { QuestionUpload }   from '../components/admin/QuestionUpload'
import { RosterUpload }     from '../components/admin/RosterUpload'
import { ResultsView }      from '../components/admin/ResultsView'
import { BulkBatchCreate }  from '../components/admin/BulkBatchCreate'
import { ActivityLog }      from '../components/admin/ActivityLog'
import { QuestionBank }     from '../components/admin/QuestionBank'
import { BatchAnalytics }   from '../components/admin/BatchAnalytics'
import { MissionControl }   from '../components/admin/MissionControl'
import { CertificatesPanel } from '../components/admin/CertificatesPanel'
import { StudentsView }     from '../components/admin/StudentsView'
import { TeamView }         from '../components/admin/TeamView'
import { SeriesView }       from '../components/admin/SeriesView'
import { InsightsView }     from '../components/admin/InsightsView'

// Views: 'dashboard' | 'batches' | 'create-batch' | 'edit-batch' | 'bulk-create'
//        'questions' | 'roster' | 'results' | 'activity-log'

export function AdminPage() {
  const [user,          setUser]          = useState(null)
  const [authLoading,   setAuthLoading]   = useState(true)
  const [authError,     setAuthError]     = useState(null)
  const [view,          setView]          = useState('dashboard')
  const [selectedBatch, setSelectedBatch] = useState(null)
  const [orgLabel,      setOrgLabel]      = useState(null)
  const [role,          setRole]          = useState(null) // owner|examiner|invigilator|viewer
  const [pwEmail,       setPwEmail]       = useState('')
  const [pwPass,        setPwPass]        = useState('')
  const [signingIn,     setSigningIn]     = useState(false)

  // Tenant-aware header + role gating for the UI.
  useEffect(() => {
    if (!user?.email) return
    let cancelled = false
    supabase
      .from('admin_users')
      .select('role, organization_id, organizations(name, display_name)')
      .eq('email', user.email)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const org = data?.organizations
        setOrgLabel(org ? (org.display_name ?? org.name) : 'Matra')
        setRole(data?.role ?? null)
        // Invigilators monitor exams — land them on the batch list (where "Live" lives)
        if (data?.role === 'invigilator') setView('batches')
      })
    return () => { cancelled = true }
  }, [user?.email])

  // Capability flags derived from role (UI layer; the DB enforces the truth)
  const canManage  = role === 'owner' || role === 'examiner'      // create/edit/delete exam content
  const canMonitor = role !== 'viewer'                            // mission control + time extensions
  const isOwner    = role === 'owner'

  useEffect(() => {
    // Authorization is role-based (admin_users table) — checked server-side
    // via is_admin(). RLS enforces the real boundary; this gate is UX.
    async function vetUser(u) {
      if (!u) { setUser(null); return }
      const { data: isAdmin } = await supabase.rpc('is_admin')
      if (!isAdmin) {
        supabase.auth.signOut()
        setAuthError('Access denied. This account is not an authorized admin.')
        setUser(null)
        return
      }
      setAuthError(null)
      setUser(u)
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await vetUser(session?.user ?? null)
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      vetUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleGoogleSignIn() {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    })
    if (error) setAuthError(error.message)
  }

  async function handlePasswordSignIn(e) {
    e.preventDefault()
    setAuthError(null)
    setSigningIn(true)
    const { error } = await supabase.auth.signInWithPassword({ email: pwEmail.trim(), password: pwPass })
    if (error) setAuthError('Incorrect email or password.')
    setSigningIn(false)
    // onAuthStateChange → vetUser handles the rest
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--gradient-hero)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="card u-slide-up" style={{ width: '100%', maxWidth: 360, padding: '40px 36px', textAlign: 'center', boxShadow: 'var(--shadow-xl)', borderTop: '3px solid var(--accent)' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 20px', border: '3px solid var(--accent-md)', boxShadow: 'var(--shadow-md)' }}>
            <img src="/logo.png" alt="Matra" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h1 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.35px' }}>Admin Portal</h1>
          <p style={{ margin: '0 0 28px', fontSize: 13, color: 'var(--text-3)' }}>Matra Assessment Platform · Restricted access</p>

          {authError && (
            <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16, textAlign: 'left', lineHeight: 1.5 }}>
              {authError}
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            style={{
              all: 'unset', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '11px 16px', border: '1.5px solid var(--border-md)', borderRadius: 'var(--radius-sm)',
              fontSize: 14, fontWeight: 600, color: 'var(--text-1)', background: 'var(--surface)',
              transition: 'border-color .15s, box-shadow .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-md)'; e.currentTarget.style.boxShadow = 'var(--shadow-focus)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; e.currentTarget.style.boxShadow = 'none' }}
          >
            <GoogleLogo />
            Sign in with Google
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Email + password (for institutional accounts not on Google) */}
          <form onSubmit={handlePasswordSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
            <input
              type="email" value={pwEmail} onChange={e => setPwEmail(e.target.value)}
              placeholder="Email" autoComplete="username" required
              style={pwInput}
            />
            <input
              type="password" value={pwPass} onChange={e => setPwPass(e.target.value)}
              placeholder="Password" autoComplete="current-password" required
              style={pwInput}
            />
            <button type="submit" disabled={signingIn || !pwEmail.trim() || !pwPass} className="btn btn-primary btn-block" style={{ padding: '11px 16px' }}>
              {signingIn ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p style={{ margin: '18px 0 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
            Access limited to authorized admin accounts. Password accounts are created by your administrator.
          </p>
        </div>
      </div>
    )
  }

  /* ── Navigation helpers ──────────────────────────────────── */
  function goToBatches()   { setView('batches'); setSelectedBatch(null) }
  function goDashboard()   { setView('dashboard'); setSelectedBatch(null) }

  function handleSelectBatch(batch)     { setSelectedBatch(batch); setView('edit-batch') }
  function handleManageQuestions(batch) { setSelectedBatch(batch); setView('questions') }
  function handleManageRoster(batch)    { setSelectedBatch(batch); setView('roster') }
  function handleViewResults(batch)     { setSelectedBatch(batch); setView('results') }
  function handleBatchSaved()           { goDashboard() }

  /* ── Nav tabs, filtered by role ──────────────────────────────
     viewer:      Dashboard, All Batches, Insights, Activity Log (read-only)
     invigilator: + nothing extra (monitors via batch "Live")
     examiner:    + Question Bank, Series, Students
     owner:       + Team                                              */
  const navItems = [
    { label: 'Dashboard', active: view === 'dashboard',    onClick: goDashboard, show: true },
    { label: 'All Batches', active: view === 'batches',    onClick: goToBatches, show: true },
    { label: 'Question Bank', active: view === 'question-bank', onClick: () => setView('question-bank'), show: canManage },
    { label: 'Series', active: view === 'series', onClick: () => setView('series'), show: canManage },
    { label: 'Students', active: view === 'students', onClick: () => setView('students'), show: canManage },
    { label: 'Team', active: view === 'team', onClick: () => setView('team'), show: isOwner },
    { label: 'Insights', active: view === 'insights', onClick: () => setView('insights'), show: true },
    { label: 'Activity Log', active: view === 'activity-log', onClick: () => setView('activity-log'), show: true },
  ].filter(i => i.show)

  return (
    <AdminLayout user={user} navItems={navItems} orgLabel={orgLabel}>
      {view === 'dashboard' && (
        <AdminDashboard
          canManage={canManage}
          onViewAllBatches={goToBatches}
          onCreateBatch={canManage ? () => setView('create-batch') : undefined}
          onViewResults={handleViewResults}
          onManageRoster={handleManageRoster}
          onManageQuestions={handleManageQuestions}
        />
      )}

      {view === 'batches' && (
        <BatchList
          canManage={canManage}
          canMonitor={canMonitor}
          onSelectBatch={handleSelectBatch}
          onCreateBatch={canManage ? () => setView('create-batch') : undefined}
          onViewResults={handleViewResults}
          onManageQuestions={handleManageQuestions}
          onManageRoster={handleManageRoster}
          onMissionControl={(batch) => { setSelectedBatch(batch); setView('mission-control') }}
        />
      )}

      {view === 'mission-control' && selectedBatch && (
        <MissionControl batch={selectedBatch} onBack={goToBatches} />
      )}

      {view === 'create-batch' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={goDashboard} style={backBtn}>← Back</button>
            <button onClick={() => setView('bulk-create')} style={bulkBtn}>Bulk create from CSV</button>
          </div>
          <h2 style={pageHeading}>Create New Batch</h2>
          <BatchForm onSaved={handleBatchSaved} onCancel={goDashboard} />
        </div>
      )}

      {view === 'bulk-create' && (
        <BulkBatchCreate
          onBack={() => setView('create-batch')}
          onCreated={goDashboard}
        />
      )}

      {view === 'edit-batch' && selectedBatch && (
        <div>
          <button onClick={goToBatches} style={backBtn}>← Back to batches</button>
          <h2 style={pageHeading}>Edit Batch</h2>
          <BatchForm batch={selectedBatch} onSaved={handleBatchSaved} onCancel={goToBatches} />
        </div>
      )}

      {view === 'questions' && selectedBatch && (
        <QuestionUpload batch={selectedBatch} onBack={goToBatches} />
      )}

      {view === 'roster' && selectedBatch && (
        <RosterUpload batch={selectedBatch} onBack={goToBatches} />
      )}

      {view === 'results' && selectedBatch && (
        <ResultsView
          batch={selectedBatch}
          canManage={canManage}
          onBack={goToBatches}
          onViewAnalytics={() => setView('analytics')}
          onViewCertificates={() => setView('certificates')}
        />
      )}

      {view === 'analytics' && selectedBatch && (
        <BatchAnalytics batch={selectedBatch} onBack={() => setView('results')} />
      )}

      {view === 'certificates' && selectedBatch && (
        <CertificatesPanel batch={selectedBatch} canManage={canManage} onBack={() => setView('results')} />
      )}

      {view === 'question-bank' && (
        <QuestionBank userEmail={user.email} />
      )}

      {view === 'students' && (
        <StudentsView />
      )}

      {view === 'team' && (
        <TeamView userEmail={user.email} />
      )}

      {view === 'insights' && (
        <InsightsView />
      )}

      {view === 'series' && (
        <SeriesView userEmail={user.email} />
      )}

      {view === 'activity-log' && (
        <ActivityLog onBack={goDashboard} />
      )}
    </AdminLayout>
  )
}

/* ── Helpers ─────────────────────────────────────────────── */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

const backBtn = {
  all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4,
}
const bulkBtn = {
  all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 500,
  color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 10px', border: '1px solid var(--border-md)', borderRadius: 6,
}
const pageHeading = { margin: '0 0 20px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.3px' }
const pwInput = {
  width: '100%', boxSizing: 'border-box', padding: '11px 14px', fontSize: 14,
  border: '1.5px solid var(--border-md)', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit',
}
