# ERROR_HANDLING Security Report

## Status: PASS

## Findings
- **Client:** a top-level `ErrorBoundary` ([src/components/shared/ErrorBoundary.jsx](../../src/components/shared/ErrorBoundary.jsx)) catches render errors and shows a generic message. Supabase/Postgres errors are mapped to friendly copy via [src/lib/errors.ts](../../src/lib/errors.ts) (`formatDbError`), so raw DB error text is not surfaced as UI. Optional Sentry captures details server-side/telemetry-side, not to the user.
- **RPCs** raise deliberately generic exceptions ("Invalid session", "Unauthorized", "Roll number and email do not match the exam roster") that reveal no internals and give attackers no oracle (e.g., cannot distinguish "roll exists" from "email wrong").
- **Edge functions** return `{ error: 'generic message' }` with appropriate status codes; internal failures are not echoed verbatim to clients.
- Production is a static build (`vite build`); there is no server debug mode. `import.meta.env.MODE` gates Sentry environment only.

## What's at risk
Nothing. No stack traces, SQL text, file paths, or library internals reach API/UI responses.

## What's already secure
Generic-by-design DB exceptions (a stated pentest strength), client error mapping, no production debug surface.

## Recommendations
None. Keep new RPC exceptions generic and non-oracular.

## Verification results
- [x] Global error boundary catches unhandled client exceptions
- [x] Client responses carry only generic messages
- [x] Full detail stays server/telemetry-side
- [x] No stack traces / SQL / file paths in responses
- [x] No production debug mode
