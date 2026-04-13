import { Component } from 'react'

/**
 * React Error Boundary — catches render errors in child trees
 * and shows a friendly fallback UI instead of a blank screen.
 *
 * Usage:
 *   <ErrorBoundary fallback={<p>Something went wrong.</p>}>
 *     <MyComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback takes priority
      if (this.props.fallback) return this.props.fallback

      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg)',
            padding: 20,
          }}
        >
          <div
            style={{
              maxWidth: 400,
              width: '100%',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              padding: '40px 32px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 44, marginBottom: 16 }}>⚠️</div>
            <h2
              style={{
                margin: '0 0 10px',
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--text-1)',
                letterSpacing: '-.2px',
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                margin: '0 0 24px',
                color: 'var(--text-2)',
                fontSize: 14,
                lineHeight: 1.65,
              }}
            >
              An unexpected error occurred. Please refresh the page to try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '11px 24px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Refresh page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
