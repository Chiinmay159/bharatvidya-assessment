# Bundle 3 — "Open the Doors" — Change Log
**Completed:** 11 June 2026 · Migrations validated on staging (`bharatvidya-staging`)

## Database (migrations 015–016)

### 015 — Organizations, presence, time extensions
- `organizations` table; `batches.organization_id` + `admin_users.organization_id`. Org-scoped admins see only their org's batches; global admins (org NULL) see all. Existing batches assigned to "BharatVidya". *Known scope: child-table RLS gets org-tightened when the first external partner onboards.*
- **invigilator** role added (owner / examiner / invigilator / viewer).
- `exam_heartbeat(attempt, token)` — single RPC: validates session, stamps `attempts.last_seen` (presence), returns batch status + time extension. Client falls back to `check_session` on pre-migration DBs.
- `grant_time_extension(attempt, minutes)` — per-student extra time (0–240 min), audit-logged; the student's timer extends on their next heartbeat (≤30s). Must be granted **before** their timer expires.
- `mission_control(batch)` — one-round-trip live snapshot: state (in_exam / disconnected [>90s silent] / submitted), answers saved, last seen, signals, extensions.

### 016 — Certificates
- `certificates` table with snapshot fields (immutable face) and unguessable codes (`BV-XXXX-XXXX-XXXX`, no-ambiguity alphabet).
- `issue_certificates(batch)` — latest submitted attempt per roll number; pass-gated when the batch has a pass mark; idempotent. Validated on staging.
- `verify_certificate(code)` — anon-safe public lookup, certificate-face fields only.

## Frontend
- **Mission Control** (`MissionControl.jsx`) — "Live" action on active batches: auto-refreshing (10s) student table with state chips/filters (incl. flagged), per-student time-extension modal. Re-admission requires no admin action — dropped students just reopen the link and resume.
- **Timer extensions live** — `useTimer` accepts `extraMinutes`; delivered to students via the existing heartbeat with zero extra load.
- **Certificates panel** (from batch results): issue + print A4 certificates with QR codes pointing to `/verify?c=CODE`. New public **/verify** page (auto-verifies from QR, manual code entry too).
- **Report pack** (`reportPack.ts`): one-click .xlsx from Item Analysis view — Results / Item Analysis / Anomalies / Certificates sheets. This is the hand-off artifact for partner colleges (who handle student communication).
- **Students** admin tab: searchable persistent identities with expandable cross-exam history.
- **PWA + SEO**: manifest.json (installable, theme color), Open Graph + meta tags, apple-touch icon.

## New dependencies
`qrcode` (QR data-URLs, local), `xlsx` (report workbook)

## Deliberately deferred
- Full i18n string extraction (EN/HI/MR) — a dedicated content project; the architecture poses no obstacle (`lang` attributes already used for Devanagari).
- Org-scoped RLS on child tables — add when first external institution onboards.
- Service-worker offline caching — the encrypted-paper prefetch already covers the critical exam-time window.

## Verification
typecheck ✓ · eslint ✓ · 26 tests ✓ · build ✓ · migrations 015–016 smoke-tested on staging (issuance, verification, heartbeat, mission_control over 3,400 attempts)

## Deployment (full sequence for production, when restored)
1. `npm install` and commit
2. Apply migrations **011 → 016 in order** to the production project
3. Re-point `.env`/Vercel envs at production; deploy
4. Enable MFA in Supabase Auth settings
5. Optional: add Sentry DSN; add invigilator/examiner accounts to `admin_users`
