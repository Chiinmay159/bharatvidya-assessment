import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { StudentPage } from './pages/StudentPage'
import { ErrorBoundary } from './components/shared/ErrorBoundary'

// Lazy-load admin (includes recharts ~400KB) — not needed for student path
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then(m => ({ default: m.AdminPage }))
)

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
          <Route path="/" element={<StudentPage />} />
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
