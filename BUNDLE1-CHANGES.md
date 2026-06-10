# Bundle 1 — "Harden the Engine" — Change Log & Deployment Checklist
**Completed:** 11 June 2026 · Backup: `_backups/bharatvidya-pre-bundle1-2026-06-11.tar.gz` + git tag `pre-bundle1-2026-06-11`

## What changed

### Fixes (B1.1)
- `index.html` — removed viewport zoom lock (WCAG fix)
- `src/lib/supabase.js` — fail-fast env validation with friendly error screen
- `src/components/student/BatchSelect.jsx` — "Upcoming" badge contrast (AA)
- `src/hooks/useExamState.js` — guard against stale option label throwing mid-exam

### Audit corrections
- Timer-under-modal "critical bug" was a false positive — server-authoritative countdown is intentional and correct.
- `.env` was never committed; git history clean. Key rotation optional.

### Scale redesign (B1.3) — `migrations/011`
- Encrypted question-paper pre-fetch in WaitingRoom (jittered 0–45s); only a 64-char key fetched at exam start. AES-256-CBC via pgcrypto ↔ Web Crypto (round-trip tested). Transparent fallback to direct fetch.
- `save_responses_batch` RPC — bulk queue drain, one session check.
- Heartbeat 15s → jittered 30s±5s. WaitingRoom polls and at-zero check jittered.

### Integrity signals (B1.4) — `migrations/012`
- `responses.time_spent_ms` — per-question timing telemetry (anomaly detection + future item analysis).
- `integrity_events` table — fullscreen exits and copy attempts logged (never auto-eject). Same RLS pattern as tab_switches.
- Fullscreen entered on "begin exam" (best-effort; iOS-safe), exited after submit.
- Per-student question + option shuffling verified already present (`seed.js`).

### Ops backbone (B1.5)
- `.github/workflows/ci.yml` — lint + test + build on every push/PR.
- Sentry (`src/lib/monitoring.js`) — activates only when `VITE_SENTRY_DSN` is set; no PII sent; wired into ErrorBoundary.
- 10 new tests (26 total): timer countdown/expiry/clock-tampering immunity/urgency/fallback; paper prefetch/decrypt/Devanagari round-trip/corruption fallback.
- `loadtest/k6-exam-flow.js` — full student-lifecycle load test. **Staging only.**

### System check (B1.6)
- `/check` route — self-serve device check: server connection + speed, Web Crypto, Devanagari rendering (with visual sample), fullscreen, screen size, browser. Share this link with students days before the exam.
- **Mock mode:** by convention, create a "Practice" batch — the engine runs it identically to a real exam, which is higher-fidelity than a simulated mode. No code needed.

## Deployment checklist (in order)
1. `npm install` locally (lockfile was out of sync + new `@sentry/react` dep) — commit `package-lock.json`
2. Apply `supabase/migrations/011_*.sql` then `012_*.sql` to the Supabase project (SQL editor or `supabase db push`)
3. Optional: create a free Sentry project, add `VITE_SENTRY_DSN` to Vercel env
4. Push to GitHub — CI workflow activates automatically; enable branch protection on `main` requiring the CI check
5. Deploy via Vercel as usual

## Bundle 1 exit criterion — ✅ PASSED (11 June 2026)
2000-VU load test on staging (`bharatvidya-staging`, ap-south-1, free tier):
92,872 requests, **0 errors**, p95 = 80ms (threshold 2000ms), median 25ms,
~115 req/s sustained, 1,837 full student lifecycles completed.
Staging project paused after the run. **Bundle 1 closed.**

### Original gate instructions (for future re-runs)
The formal gate is a simulated 2000-student exam passing on staging:
1. Create a second (free) Supabase project, apply `schema.sql` + migrations 011–012
2. Create a test batch + questions, set status `active`
3. `k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e BATCH_ID=... -e VUS=2000 loadtest/k6-exam-flow.js`
4. Pass: <1% RPC errors, p95 latency <2s (k6 enforces these thresholds automatically)
