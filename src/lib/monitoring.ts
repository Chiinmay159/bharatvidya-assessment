import * as Sentry from '@sentry/react'

/**
 * monitoring.ts — production error tracking (Sentry).
 *
 * Activates ONLY when VITE_SENTRY_DSN is set; otherwise every export is a
 * harmless no-op, so local dev and CI need no Sentry account.
 *
 * Privacy: no PII is sent. Roll numbers / student names are never attached
 * to events — only anonymous technical context (batch id, app phase).
 */

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

export const monitoringEnabled: boolean = Boolean(dsn)

export function initMonitoring(): void {
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Exam app: errors matter, perf tracing mostly doesn't — keep quota cheap
    tracesSampleRate: 0.02,
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip URL query params (may carry identifiers in future flows)
      if (event.request?.url) event.request.url = event.request.url.split('?')[0]
      return event
    },
  })
}

/** Report a handled error with optional anonymous context. */
export function captureError(error: unknown, context: Record<string, unknown> = {}): void {
  if (!dsn) return
  Sentry.captureException(error, { extra: context })
}

/** Set anonymous app-phase context (e.g. step, batchId) for future events. */
export function setMonitoringContext(key: string, value: string | number | boolean): void {
  if (!dsn) return
  Sentry.setTag(key, String(value))
}
