import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { StudentPage } from './pages/StudentPage'
import { SystemCheckPage } from './pages/SystemCheckPage'
import { VerifyPage } from './pages/VerifyPage'
import { ErrorBoundary } from './components/shared/ErrorBoundary'

// Lazy-load admin (includes recharts ~400KB) — not needed for student path
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then(m => ({ default: m.AdminPage }))
)

// The landing page at "/" is now the static redesign (public/home.html), served
// by Vercel outside the SPA. If anything client-navigates to "/" (a stray link
// or the "*" fallback), do a full load so the real landing renders — never the
// retired React component.
function HomeRedirect() {
  useEffect(() => { window.location.replace('/') }, [])
  return null
}

function AdminFallback() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading admin...</p>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <a href="#main-content" className="sr-only">
          Skip to main content
        </a>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/exam" element={<StudentPage />} />
          <Route path="/check" element={<SystemCheckPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route
            path="/admin"
            element={
              <Suspense fallback={<AdminFallback />}>
                <AdminPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
