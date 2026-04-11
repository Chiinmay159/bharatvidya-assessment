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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white border border-gray-200 rounded-xl p-10 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">BV</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Admin Login</h1>
          <p className="text-sm text-gray-500 mb-6">BharatVidya Exams</p>

          {authError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-4">
              {authError}
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
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
          <button
            onClick={() => setView('dashboard')}
            className="text-sm text-indigo-600 hover:text-indigo-800 mb-6 flex items-center gap-1"
          >
            ← Back to batches
          </button>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Create New Batch</h2>
          <BatchForm
            onSaved={handleBatchSaved}
            onCancel={() => setView('dashboard')}
          />
        </div>
      )}

      {view === 'edit-batch' && selectedBatch && (
        <div>
          <button
            onClick={() => { setView('dashboard'); setSelectedBatch(null) }}
            className="text-sm text-indigo-600 hover:text-indigo-800 mb-6 flex items-center gap-1"
          >
            ← Back to batches
          </button>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Edit Batch</h2>
          <BatchForm
            batch={selectedBatch}
            onSaved={handleBatchSaved}
            onCancel={() => { setView('dashboard'); setSelectedBatch(null) }}
          />
        </div>
      )}

      {view === 'questions' && selectedBatch && (
        <QuestionUpload
          batch={selectedBatch}
          onBack={() => { setView('dashboard'); setSelectedBatch(null) }}
        />
      )}

      {view === 'results' && selectedBatch && (
        <ResultsView
          batch={selectedBatch}
          onBack={() => { setView('dashboard'); setSelectedBatch(null) }}
        />
      )}
    </AdminLayout>
  )
}
