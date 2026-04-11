import { useState, useEffect } from 'react'
import { supabase, ADMIN_EMAIL } from '../lib/supabase'
import { AdminLayout } from '../components/admin/AdminLayout'
import { BatchList } from '../components/admin/BatchList'
import { BatchForm } from '../components/admin/BatchForm'
import { QuestionUpload } from '../components/admin/QuestionUpload'
import { ResultsView } from '../components/admin/ResultsView'

// Views: 'dashboard' | 'create-batch' | 'edit-batch' | 'questions' | 'results'

export function AdminPage() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [view, setView] = useState('dashboard')
  const [selectedBatch, setSelectedBatch] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      if (u && u.email !== ADMIN_EMAIL) {
        supabase.auth.signOut()
        setAuthError('Access denied. Only the admin account may log in here.')
        setUser(null)
      } else {
        setUser(u)
      }
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      if (u && u.email !== ADMIN_EMAIL) {
        supabase.auth.signOut()
        setAuthError('Access denied. Only the admin account may log in here.')
        setUser(null)
        return
      }
      setUser(u)
      setAuthError(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleGoogleSignIn() {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
      },
    })
    if (error) setAuthError(error.message)
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
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="card" style={{ width: '100%', maxWidth: 380, padding: '40px 36px', textAlign: 'center' }}>
          {/* Brand */}
          <img src="/logo.png" alt="BharatVidya" style={{ width: 72, height: 72, borderRadius: '50%', display: 'block', margin: '0 auto 16px' }} />
          <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>Admin Portal</h1>
          <p style={{ margin: '0 0 28px', fontSize: 13, color: 'var(--text-3)' }}>BharatVidya Exams · Restricted access</p>

          {authError && (
            <div style={{ background: 'var(--error-lt)', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: 'var(--error)', fontSize: 13, marginBottom: 16, textAlign: 'left' }}>
              {authError}
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            style={{
              all: 'unset', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '10px 16px',
              border: '1.5px solid var(--border-md)', borderRadius: 8,
              fontSize: 14, fontWeight: 500, color: 'var(--text-1)',
              background: 'var(--surface)',
            }}
          >
            <GoogleLogo />
            Sign in with Google
          </button>

          <p style={{ margin: '20px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
            Only <strong>chinmay@matramedia.co.in</strong> is authorised.
          </p>
        </div>
      </div>
    )
  }

  function handleSelectBatch(batch) {
    setSelectedBatch(batch)
    setView('edit-batch')
  }

  function handleManageQuestions(batch) {
    setSelectedBatch(batch)
    setView('questions')
  }

  function handleViewResults(batch) {
    setSelectedBatch(batch)
    setView('results')
  }

  function handleBatchSaved() {
    setView('dashboard')
    setSelectedBatch(null)
  }

  return (
    <AdminLayout user={user}>
      {view === 'dashboard' && (
        <BatchList
          onSelectBatch={handleSelectBatch}
          onCreateBatch={() => setView('create-batch')}
          onViewResults={handleViewResults}
          onManageQuestions={handleManageQuestions}
        />
      )}

      {view === 'create-batch' && (
        <div>
          <button onClick={() => setView('dashboard')} style={backBtn}>← Back to batches</button>
          <h2 style={pageHeading}>Create New Batch</h2>
          <BatchForm onSaved={handleBatchSaved} onCancel={() => setView('dashboard')} />
        </div>
      )}

      {view === 'edit-batch' && selectedBatch && (
        <div>
          <button onClick={() => { setView('dashboard'); setSelectedBatch(null) }} style={backBtn}>← Back to batches</button>
          <h2 style={pageHeading}>Edit Batch</h2>
          <BatchForm batch={selectedBatch} onSaved={handleBatchSaved} onCancel={() => { setView('dashboard'); setSelectedBatch(null) }} />
        </div>
      )}

      {view === 'questions' && selectedBatch && (
        <QuestionUpload batch={selectedBatch} onBack={() => { setView('dashboard'); setSelectedBatch(null) }} />
      )}

      {view === 'results' && selectedBatch && (
        <ResultsView batch={selectedBatch} onBack={() => { setView('dashboard'); setSelectedBatch(null) }} />
      )}
    </AdminLayout>
  )
}

/* ── Helpers ────────────────────────────────────────────── */
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

const backBtn = { all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }
const pageHeading = { margin: '0 0 20px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.3px' }
