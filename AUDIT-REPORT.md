# BharatVidya Quiz App — Multi-Dimensional Audit
**Date:** 10 June 2026 · **Goal:** Elevate to professional platform level

## Overall Scorecard

| Dimension | Score | Verdict |
|---|---|---|
| Security & exam integrity | 9/10 | Excellent — RLS, server-side scoring, session tokens all solid |
| Code quality & architecture | 8/10 | Strong, with oversized components and no TypeScript |
| Accessibility | 7/10 | Good ARIA/semantic foundation, a few violations |
| UX | 7/10 | Solid flows; offline feedback and save-confirmation gaps |
| Operations & DevOps | 5/10 | No CI/CD, no error monitoring, weak env hygiene |
| Testing | 2/10 | Only 2 unit test files; core exam logic untested |

**Verdict:** The foundation is production-grade — the security model in particular is unusually good for a project at this stage. What separates it from a "professional platform" is almost entirely operational maturity: testing, CI/CD, monitoring, and TypeScript. The product is well-built; the *engineering process around it* is not yet.

---

## 1. Security & Data Layer (strongest dimension)

**Strengths verified:**
- RLS policies are layered and correct; no anonymous INSERT on sensitive tables
- Correct answers are stripped server-side via RPC — never reach the client
- All student writes require a validated session token; direct-API cheating is blocked
- Scoring is server-authoritative (triggers) — score tampering prevented
- 15-second heartbeat for session isolation

**Findings:**
- 🔴 **CRITICAL — Secrets committed to repo.** `.env` contains the Supabase anon key and admin email and is in the working tree. Rotate the anon key, confirm `.env` is gitignored, and purge it from git history (`git filter-repo`).
- 🟠 **Admin auth is a single hardcoded email, no MFA.** Move to Supabase Auth roles + enforce MFA for admin accounts.
- 🟠 **Audit logging incomplete.** Batch deletions are logged but exam submissions are not. Log all integrity-relevant events.
- 🟡 Client-side input validation thinner than server-side (server is the safety net, but UX suffers).
- 🟡 Some error messages disclose internal detail; sanitize before display.

## 2. Architecture & Code Quality

**Strengths:** centralized `useExamState` hook (no prop drilling), server-synced monotonic timer immune to clock tampering, RPC-first data layer, clean dependency tree.

**Findings:**
- 🔴 **Timer keeps running under the unsaved-answer warning modal** → exam can auto-submit while the student is mid-interaction. Pause or account for modal time, or auto-save before warning.
- 🔴 **Error serialization in `useExamState` not wrapped** → an edge-case throw can orphan exam state. Wrap in try/catch with recovery.
- 🟠 **Five components exceed 300 lines** (BatchList, ExamScreen, ResultsView, ResultScreen, AdminDashboard). Split into container + presentational pieces.
- 🟠 Inconsistent upload error handling — some paths use `formatDbError`, others raw errors.
- 🟡 **No TypeScript.** At ~4,700 LOC with a security-sensitive domain, this is the single highest-leverage refactor. Migrate incrementally (`allowJs`, convert lib/ and hooks/ first).
- 🟡 Server-time sync logic duplicated between `useTimer` and `WaitingRoom` — extract a shared utility.
- ⚪ RPC naming inconsistent (`check_*` / `verify_*` / `get_*`); inline style duplication across components.

## 3. UX & Accessibility

**Findings:**
- 🔴 **Viewport meta disables user zoom** (`user-scalable=no` / `maximum-scale=1`) — WCAG violation, 1-line fix in `index.html`.
- 🟠 LiveBadge color contrast below AA; heading hierarchy skips levels in places; admin logo missing meaningful alt text.
- 🟠 **No "answer saved" feedback** during the exam — students can't tell if their answer persisted. Add a subtle saved-state indicator/toast.
- 🟠 **Weak offline messaging.** The offline queue exists, but the student isn't clearly told connectivity is lost or that answers are queued. This is the #1 trust feature for an exam product used in real classrooms.
- 🟡 Touch targets on mobile likely under 44px for some controls; timer screen-reader announcements should begin earlier.

## 4. Testing (weakest dimension)

- Only `errors.test.js` and `seed.test.js` exist (~18 unit tests). **Zero coverage** on `useTimer`, `useExamState`, `ExamScreen`, FocusTrapModal, and the entire admin surface. No component tests, no e2e.
- For an assessment platform, untested timer/submission logic is the biggest professional-credibility gap.
- Recommended: vitest + @testing-library/react for hooks and ExamScreen; Playwright e2e covering the full student journey (register → exam → submit → result) and one admin flow. ~30–40 hours to a respectable baseline.

## 5. Operations & DevOps

- 🔴 **No CI/CD** — nothing guarantees main builds or passes lint/tests. Add a GitHub Actions workflow (lint + test + build) gating merges; wire Vercel preview deploys to PRs.
- 🔴 **No error monitoring** — production failures are invisible. Add Sentry (free tier suffices), wire into ErrorBoundary and the edge function.
- 🟠 No env validation at boot — fail fast with a clear message if `VITE_SUPABASE_*` is missing.
- 🟡 Missing SEO/meta/OG tags; no PWA manifest (offline-capable PWA would be a real differentiator for classroom use); no i18n scaffolding despite the heritage/IKS audience.

---

## Prioritized Roadmap

**Phase 1 — Immediate (this week, ~1 day):**
1. Rotate Supabase anon key; purge `.env` from git history
2. Fix viewport zoom lock, logo alt text, LiveBadge contrast
3. Fix timer-under-modal auto-submit bug
4. Add env validation at boot

**Phase 2 — Operational backbone (1–2 weeks):**
5. GitHub Actions CI (lint, test, build) + branch protection
6. Sentry error monitoring
7. Tests for useTimer, useExamState, ExamScreen; one Playwright e2e of the student flow
8. Audit-log exam submissions; standardize error handling

**Phase 3 — Platform maturity (3–6 weeks):**
9. Incremental TypeScript migration (lib/ → hooks/ → components/)
10. Split the five oversized components
11. Offline/save-state UX: connectivity banner, answer-saved indicator
12. Admin auth via Supabase Auth roles + MFA
13. PWA manifest + SEO/meta; design tokens for the inline-style duplication

**Effort estimate:** Phases 1–2 ≈ 25–35 hours; Phase 3 ≈ 60–80 hours.

---

# Part II — Strategic Expansion: From Quiz App to Assessment Platform

The current build is a well-executed *exam runner*. To serve BharatVidya's actual mission — assessing 2000+ students at once, repeatedly, across courses — the gaps below matter more than any code-quality item above. Organized by perspective.

## A. Scale Engineering (2000+ concurrent is the forcing function)

The current architecture has not been validated at this load, and three specific pressure points will break first:

1. **Thundering herd at exam start.** 2000 students fetching questions and writing heartbeats simultaneously will hit Supabase connection/RPC limits. Mitigations: (a) pre-fetch the question paper during the WaitingRoom phase, encrypted, with the key released at start time — turns the start spike into a single tiny broadcast; (b) stagger batch starts in waves of 200–300; (c) move heartbeats from 15s row-writes to Supabase Realtime presence or batch them.
2. **Per-answer writes.** 2000 students × 50 questions = 100k writes in an hour, bursty. Buffer answers client-side and sync in batches of 5–10; the offline queue already half-exists for this.
3. **Load testing as a gate.** Before any 2000-seat event, run a k6/Artillery simulation of the full student lifecycle against a staging project. This should be a standing pre-event ritual, not a one-off.
4. **Result computation.** Server-side scoring per submission is fine; ranking/percentile across 2000 should be a single post-exam batch job (materialized view), not computed per-request.

## B. Assessment Science (what makes it credible as an *assessment*, not a quiz)

5. **Question bank with metadata** — difficulty, topic/sub-topic tags, Bloom's level, usage history — instead of per-batch CSV uploads. Papers get composed from the bank by blueprint ("10 easy Vedanta, 5 hard Nyaya...").
6. **Per-student randomization** — shuffle question order and option order per student. With 2000 students in one hall or on one campus, this is the cheapest anti-copying measure available and is currently absent.
7. **Item analysis after every exam** — difficulty index, discrimination index, distractor analysis per question. This is what separates a serious assessment body from a quiz tool, and it compounds: every exam improves the bank.
8. **More item types** — assertion-reason (standard in Indian competitive exams), match-the-following, passage-based clusters, image-based (manuscripts, iconography — uniquely relevant to BharatVidya), numeric entry.
9. **Negative marking / partial credit schemes** configurable per batch.
10. **Question versioning + review workflow** — author → reviewer → approved. With Sanskrit/IKS content, scholarly review before a question reaches 2000 students is reputationally essential.

## C. Integrity at Scale (lightweight proctoring)

11. **Browser-side signals:** fullscreen enforcement, tab-switch/visibility-change counting, copy-paste blocking on question text. Log rather than auto-eject; surface counts to admins.
12. **Anomaly detection post-hoc:** flag improbably fast completions, identical answer-pattern pairs (cheating dyads), and answer-change patterns. At n=2000 these statistics actually work.
13. **Time-per-question telemetry** — already nearly free to capture, valuable both for integrity and for item analysis (#7).

## D. Student Experience for the Indian Context

14. **Offline-first PWA.** Many candidates will sit exams on mid-range Android phones over flaky 4G in semi-urban venues. Aggressive answer-queueing, clear "you are offline, answers are safe" messaging, and resume-on-reconnect are the single biggest UX differentiators. (Half-built already — finish it.)
15. **Indic language support.** Question rendering in Devanagari is presumably working, but UI chrome, instructions, and error messages should be bilingual (English/Hindi minimum, Marathi for the BORI catchment). Verify Devanagari font fallback and conjunct rendering on cheap Android devices specifically.
16. **Pre-exam system check** — a self-serve page that tests the student's device, connection, and fonts days before the exam. Cuts day-of support load dramatically at 2000 seats.
17. **Mock/practice mode** on the same engine, so the first time a student sees the interface isn't the real exam.

## E. Institutional & Business Layer

18. **Multi-organization model.** Currently single-admin. BharatVidya will plausibly run assessments *for* partner institutions (BORI, universities, pathshalas). Schema-level `organization_id` + role-based admin (owner / examiner / invigilator / viewer) future-proofs this and is far cheaper to add now than retrofit.
19. **Certificates with verification** — auto-generated PDF certificates with a QR/URL that resolves to a public verification page. Turns every certificate into marketing and gives results lasting value.
20. **Student profiles & longitudinal tracking** — a student identity that persists across exams enables progress reports, course-completion credentials, and eventually an alumni dataset. Currently each batch roster is an island.
21. **Self-registration flow** — for public exams, students self-register against a batch (replacing manual roster upload). Payments deliberately out of scope for now.
22. **Communication — deferred.** Student communication (hall tickets, reminders, results distribution) is left to partner colleges. The platform's job is exportable artifacts (results, report packs) the institution can distribute through its own channels. The existing email-results edge function stays as-is; no bulk pipeline will be built.

## F. Admin & Operations at Event Scale

23. **Live exam-day mission control** — a real-time dashboard: students in waiting room / in exam / submitted / flagged / disconnected, with the ability to grant individual time extensions or re-admit a dropped student. At 2000 seats, the admin's exam-day view *is* the product.
24. **Invigilator role** — limited accounts that can monitor and assist a slice of students without full admin power.
25. **Dry-run/rehearsal mode** — clone a batch into a sandbox to rehearse the full flow before the event.
26. **Post-event report pack** — one-click PDF/Excel: results, item analysis, integrity flags, attendance — the artifact handed to the institution.

# Part III — Unified Execution Plan: Three Architectural Bundles

Phases 1–3 (audit fixes) and Waves 1–3 (capabilities) merge naturally, because each bundle touches the *same architectural layer* — doing them together means each file/schema is opened once, not three times.

## Bundle 1 — "Harden the Engine" (exam-runtime layer)
*Theme: everything that executes during a live exam. One pass through ExamScreen, useTimer, useExamState, the session/answer schema, and the start-flow.*

- Secrets rotation + git history purge; env validation at boot
- Timer-under-modal bug; error-serialization fix; viewport zoom, contrast, alt-text fixes
- **Scale work as one redesign, not patches:** encrypted pre-fetch of papers in WaitingRoom + key broadcast at start; client-side answer batching (finishes the offline queue); heartbeats → Realtime presence; staggered start waves
- Per-student question/option shuffling (schema change to the same answer/paper tables being touched anyway)
- Integrity signals: fullscreen, tab-switch counting, time-per-question telemetry (same ExamScreen pass)
- CI/CD + Sentry + tests for the exam core; k6 load-test harness as the bundle's exit criterion
- Pre-exam system-check page + mock mode (thin reuse of the hardened runtime)

**Exit criterion:** a simulated 2000-student exam passes on staging. This bundle alone makes the next big event safe.

## Bundle 2 — "Build the Brain" (content & identity layer)
*Theme: the data-model reframe — question bank and student identity become first-class. One schema migration cycle, one TypeScript migration alongside.*

- Question bank with metadata, versioning, author→reviewer workflow; paper composition by blueprint
- New item types (assertion-reason, match, passage clusters, image-based); marking schemes
- Persistent student identity across exams; self-registration flow (no payments)
- Item analysis + anomaly detection (fast-finishers, answer-pattern pairs) — both consume the telemetry Bundle 1 captured
- Incremental TypeScript migration + splitting oversized components (done *while* refactoring these data flows, not separately)
- Admin auth → Supabase Auth roles + MFA (prerequisite for roles in Bundle 3)

**Exit criterion:** an exam composed from the bank, taken by identified students, producing item-analysis output.

## Bundle 3 — "Open the Doors" (institutional & operations layer)
*Theme: multi-tenancy and event operations. Builds strictly on Bundle 2's identity/roles.*

- `organization_id` multi-tenancy + role hierarchy (owner/examiner/invigilator/viewer)
- Exam-day mission control dashboard + invigilator views; individual time extensions/re-admission
- Dry-run/rehearsal mode; one-click post-event report pack (PDF/Excel)
- Certificates with QR verification page
- Offline-first PWA polish, bilingual UI (EN/HI/MR), SEO/meta

**Exit criterion:** a partner institution runs its own 2000-seat exam end-to-end with BharatVidya as the platform.

## External Integrations & Dependencies Arising

| Need | Recommended | Bundle | Notes |
|---|---|---|---|
| Error monitoring | Sentry (free tier) | 1 | Frontend + edge functions |
| CI/CD | GitHub Actions + Vercel previews | 1 | Already on Vercel |
| Load testing | k6 (Grafana) or Artillery | 1 | Against a separate staging Supabase project |
| Staging environment | Second Supabase project | 1 | New standing dependency; keep migrations in lockstep |
| Realtime presence/broadcast | Supabase Realtime (already in stack) | 1 | No new vendor; new usage pattern with its own quotas — verify limits at 2000 connections |
| Client crypto for paper pre-fetch | Web Crypto API (native) | 1 | No dependency; AES-GCM, key broadcast at start |
| E2E testing | Playwright | 1 | Dev dependency only |
| PDF generation (certificates, report packs) | Edge function with Typst/wkhtmltopdf, or a service like DocRaptor | 3 | Self-hosted render keeps cost ~zero |
| QR codes | `qrcode` npm lib | 3 | Trivial, no service |
| Auth/MFA | Supabase Auth (already in stack) | 2 | Replaces hardcoded admin email; TOTP MFA built in |
| Image/asset storage for image-based questions | Supabase Storage + CDN | 2 | Already available; needs signed-URL policy design |
| i18n | i18next/react-i18next | 3 | Library only; the real cost is translation content |
| Indic font delivery | Self-hosted Noto Sans/Serif Devanagari | 3 | Avoid Google Fonts runtime dependency in exam halls |

**Deliberately excluded for now:** payments (Razorpay), all student communication (email/SMS/WhatsApp — left to partner colleges; the platform provides exportable artifacts instead), third-party proctoring services, analytics SaaS (item analysis is in-house SQL).

The dependency picture is now minimal: everything rides on the existing Supabase + Vercel stack. The only genuinely *new* external service is **Sentry** — everything else is dev tooling or native platform capability. With communication delegated to colleges, the export quality of the post-event report pack and certificates becomes correspondingly more important: they are the hand-off artifact.

**The single most important reframe:** today the unit of the product is *a batch*; for a platform it must become *the question bank* and *the student identity*. Bundle 2 is that shift; Bundles 1 and 3 are what make it survivable and sellable.

