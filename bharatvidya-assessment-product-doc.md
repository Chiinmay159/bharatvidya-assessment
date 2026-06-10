# BharatVidya Assessment Platform — Product Document

**Version:** 2.0
**Last updated:** 13 April 2026
**Author:** Chinmay Bhandari / Matra Media & Communication Pvt. Ltd.
**Repository:** github.com/Chiinmay159/bharatvidya-assessment (Private)
**Live URL:** bharatvidya-assessment.vercel.app

---

## 1. Product Summary

BharatVidya Assessment Platform is a secure web-based examination system for running timed multiple-choice assessments with controlled student entry, roster validation, live exam monitoring, configurable result disclosure, and retry-aware evaluation.

The product is designed for two primary user groups:

- **Students** taking scheduled or live exams from a browser (desktop or mobile).
- **Administrators / invigilators** creating batches, managing questions and rosters, monitoring activity, and reviewing outcomes.

The platform is optimized for institution-managed assessments where exam integrity, operational simplicity, and quick batch setup matter more than highly customizable test authoring. It is currently deployed for BharatVidya's institutional partnerships, with the first production use targeting 1,000 students across 6 batches.

---

## 2. Product Goals

### Primary goals

- Deliver a simple and reliable timed exam experience for students.
- Give admins strong control over batch setup, access gating, and result visibility.
- Preserve exam integrity through server-authoritative scoring, session enforcement, and scoped database access.
- Support real-world administration workflows: roster gating, resets, retries, exports, and audit logging.
- Run on free-tier infrastructure with zero recurring cost at current scale.

### Non-goals

- Rich subjective/descriptive answer evaluation.
- Complex exam authoring with sections, weighted scoring, or adaptive logic.
- Multi-tenant admin hierarchies or institution-level role management.
- Deep LMS-style course management.
- Remote proctoring with webcam/AI monitoring (physical invigilator assumed).

---

## 3. Core User Roles

### Student

A student can:

- View currently scheduled or active exam batches.
- Filter visible batches by roll number (when rostered).
- Enter a batch using roll number, optional access code, and name/roster verification.
- Wait for a scheduled exam start time with a live countdown.
- Read exam instructions and confirm readiness before beginning.
- Take a timed MCQ exam (linear, one question at a time, no backtracking).
- Recover an in-progress attempt on browser refresh.
- Receive immediate results or a submission confirmation depending on batch settings.
- Retry the exam if enabled and eligible (while batch is still active).

### Admin / Invigilator

An admin can:

- Create, edit, clone, schedule, start, end, and delete exam batches.
- Upload and replace question banks from CSV.
- Upload and replace student rosters from CSV.
- Set optional access codes, passing percentages, retry limits, and result visibility per batch.
- View live progress and submission counts during active exams.
- Inspect results, analytics, per-question correctness, and tab-switch counts.
- Export results to CSV with configurable columns.
- Email result summaries to students.
- Print formatted result sheets.
- Reset a batch or delete individual attempts.
- View activity/audit logs of all admin actions.

Admin access is restricted to a single Google account (`chinmay@matramedia.co.in`) via Supabase Google OAuth. All admin-only operations are enforced server-side via the `is_admin()` database function.

---

## 4. Product Feature Set

### 4.1 Batch Management

Each assessment is represented as a **batch**. A batch includes:

- Batch name
- Scheduled start time (date + time, stored as timestamptz)
- Duration in minutes
- Status lifecycle: `draft` → `scheduled` → `active` → `completed`
- Questions per student (nullable; if NULL, student gets all questions)
- Optional access code (4-6 character alphanumeric, case-sensitive, verified server-side)
- Result disclosure toggle (`show_results`, default: true)
- Optional passing percentage (1-100, nullable)
- Maximum attempts per student (default: 1, configurable, no hard cap)

Supported admin actions:

- Create a new batch with all configuration fields
- Edit a draft or scheduled batch (critical fields locked once active)
- Start a scheduled batch immediately (manual override)
- End an active batch immediately
- Clone an existing batch into a new draft (copies name, duration, questions_per_student, and all questions; roster not copied)
- Delete a batch and all dependent data through the `delete_batch` RPC (cascades: tab_switches → responses → attempts → questions → roster → batch)

### 4.2 Student Entry and Verification

The student entry flow supports both rostered and open exams.

**Rostered batch flow:**

1. Student enters roll number.
2. System checks roster for this batch via server-side RPC.
3. If not found: "You are not registered for this exam. Contact your instructor."
4. If found: student identity (name, email) is fetched and displayed.
5. Student sees confirmation screen: "You are registered as [Name], Roll No [Number], for [Batch Name]. Confirm?"
6. Student confirms before proceeding.

**Open batch flow (no roster):**

1. Student enters roll number.
2. Student manually enters full name.
3. The pair `(roll_number, student_name)` becomes the attempt identity.

**Access code flow (optional, per-batch):**

- If a batch has an access code, students must enter it alongside their roll number.
- Verification is server-side via the `create_attempt` RPC.
- The actual code is never exposed to anonymous clients; the UI only knows `has_access_code: true/false`.

**Exam window validation:**

- If the exam time window has already closed when a student tries to enter, the system blocks entry with "The exam time window has already closed" and does not create an attempt.
- If the batch status is `completed`, the system shows "This exam has ended."

### 4.3 Exam Delivery

The exam engine supports:

- Timed MCQ delivery (one question at a time, linear, no backtracking)
- Deterministic question selection and order randomization per student
- Optional random subset selection from a larger question bank
- Retry-aware question reseeding (each attempt gets different questions)
- Per-question response submission (saved individually on each "Next" click, not batched)
- Exam recovery on browser refresh (resume at next unanswered question)
- Auto-submission on timer expiry
- Unsaved-answer warning when connectivity issues prevent sync (student chooses retry vs forced submit)

### 4.4 Question Bank and Randomization

**Question bank model:**

- Admin uploads N questions via CSV (e.g., 100).
- Admin optionally sets `questions_per_student` (e.g., 50).
- If `questions_per_student` is NULL, student receives all N questions.
- If set, each student receives a random subset of that size from the pool.
- Validation: `questions_per_student` must be ≤ total uploaded questions.

**Randomization pipeline:**

1. All questions for the batch are fetched, sorted by `sort_order` (deterministic input).
2. A seed is computed: `cyrb53(roll_number + '|' + batch_id + '|' + attempt_number)`.
3. The seed initializes a `mulberry32` PRNG (seeded pseudo-random number generator).
4. The full question list is shuffled using Fisher-Yates with the seeded RNG.
5. If `questions_per_student` is set: `shuffled.slice(0, questions_per_student)`.
6. Option order within each question is also shuffled using the same seeded RNG. Correct answer mapping is adjusted accordingly.

**Guarantees:**

- Same student, same attempt: always sees the same questions in the same order (deterministic on refresh).
- Different students: see different question sets and different option orders (prevents copying in a lab).
- Different attempts (retry): different seed produces different question selection and order.
- No duplicate questions within a single attempt (Fisher-Yates produces a permutation; mathematically impossible).

### 4.5 Timer Logic

- Timer is based on `batch.scheduled_start` and `batch.duration_minutes`.
- Exam end time = `scheduled_start + duration_minutes`.
- Remaining time for a student = `exam_end_time - current_server_time`.
- Late-joining students get only the remaining time (not the full duration).
- Timer displays as `MM:SS`, turns red at 5 minutes remaining.
- At 0: auto-submit is triggered immediately.

**Server time synchronization:**

- On initial load, the client calls `get_server_time()` RPC and computes a half-RTT offset between client clock and server clock.
- All subsequent timer calculations use this offset, ensuring students with incorrect system clocks see accurate countdowns.
- The offset is computed once per session and used throughout.

### 4.6 Integrity and Proctoring Features

The platform includes a lightweight integrity model suitable for lab-based exams with a physical invigilator:

- **Answer key protection:** Questions are fetched through `get_exam_questions` RPC, which strips `correct_answer`. Students never receive the answer key.
- **Server-side scoring:** A `set_is_correct` BEFORE INSERT trigger computes correctness on the database. The `submit_exam` RPC tallies scores from stored responses. Client-computed scores are never trusted.
- **Session enforcement:** On attempt creation, a `session_token` (UUID) is generated and stored in both the database and browser `sessionStorage`. Every response save and submission validates the token via `claim_session` and `check_session` RPCs. A second browser window is blocked with "This exam is already open in another window."
- **Tab switch detection:** Uses the browser `document.visibilitychange` API. Each tab-away event is logged to the `tab_switches` table with `left_at` and `returned_at` timestamps. Tab switch count is visible in admin results.
- **Duplicate attempt prevention:** Unique constraint on `(batch_id, roll_number, attempt_number)` plus server-side enforcement in `create_attempt` RPC.
- **Access code validation:** Server-side only; code is never sent to the anonymous client.
- **CSV formula injection protection:** Export cells are sanitized before CSV generation to prevent formula injection attacks.
- **Audit logging:** All sensitive admin actions (batch creation, deletion, status changes, roster uploads, result exports) are logged with timestamp, actor, and details.

This is not a full remote proctoring suite. It provides meaningful operational safeguards for web-based exams where a physical invigilator is present.

### 4.7 Results and Retry Logic

**Result modes:**

- **Results visible** (`show_results = true`): Student sees score, percentage, pass/fail outcome (if passing percentage is configured), and grade-style presentation.
- **Results hidden** (`show_results = false`): Student sees "Your exam has been submitted successfully. Results will be announced by your institution." The `submit_exam` RPC returns NULL scores to the client; actual scores are computed and stored server-side for admin access.
- **Result visibility can be toggled at any time** (not locked when batch is active/completed), allowing admin to reveal results after grading.

**Retry support:**

- Governed by `pass_percentage`, `max_attempts`, current batch status, and student's latest attempt result.
- If student fails and retries remain and batch is still `active`: result screen shows "You did not pass. You have X attempts remaining." with a "Retry Exam" button.
- Retry creates a new attempt with incremented `attempt_number`, different question seed, no re-registration needed.
- Once batch status moves to `completed`, no more retries regardless of attempts remaining.
- `pass_percentage` and `max_attempts` are locked by the `protect_active_batch` trigger once the batch is active.
- Server-side enforcement: `create_attempt` RPC counts existing attempts and blocks when `max_attempts` is reached.

### 4.8 Admin Results Workspace

Admins can review:

- Submitted attempts for a batch (sortable table)
- Score, total questions, percentage, time taken, tab switch count per student
- Attempt number (for retry-enabled batches)
- Statistical summaries: submissions count, class average, median, standard deviation, highest score, average completion time
- Score distribution histogram and question difficulty analysis (using Recharts)
- Top 5 hardest questions (lowest correct %) and top 5 easiest questions

Available result actions:

- Download CSV export with configurable columns
- Print formatted result sheet (CSS @media print)
- Email result summaries to students via Resend integration
- Delete an individual attempt (with confirmation)
- Reset all attempts in a batch (double confirmation: type batch name to confirm)

### 4.9 CSV Specifications

**Question CSV format:**

```
question,option_a,option_b,option_c,option_d,correct
"What is the capital of France?","London","Paris","Berlin","Madrid","B"
```

Rules:
- Header row required: `question,option_a,option_b,option_c,option_d,correct`
- `correct` column accepts: A, B, C, D (case-insensitive, normalized to uppercase on parse)
- UTF-8 encoding required (supports Devanagari and diacritics)
- Standard CSV escaping (quotes around fields containing commas)
- Frontend shows preview table after parsing, before uploading
- Upload uses `replace_questions` RPC (atomic: DELETE + INSERT in one transaction)

**Roster CSV format:**

```
roll_number,student_name,email
"2024001","Priya Sharma","priya@example.com"
```

Rules:
- Header row required: `roll_number,student_name,email`
- UTF-8 encoding required
- "Download Template" button available in admin UI for correct format
- Upload uses `replace_roster` RPC (atomic)

**Results CSV export:**

Configurable columns. Default output:
- roll_number, student_name, email, score, total_questions, percentage, time_taken_mins, tab_switch_count, submitted_at
- Optional: per-question breakdown (question text, student answer, correct/incorrect)
- All cells sanitized against formula injection

### 4.10 Activity Log

All significant admin actions are recorded in the `audit_log` table:

| Action | Logged details |
|---|---|
| batch_created | Batch name |
| batch_updated | Changed fields |
| batch_deleted | Batch name (captured before cascade) |
| status_changed | New status |
| questions_uploaded | Question count |
| roster_uploaded | Record count |
| attempt_deleted | Student roll number |
| batch_reset | Attempt count deleted |
| results_exported | Export type |

Admin UI: "Activity Log" tab showing events in reverse chronological order, filterable by action type, with pagination.

---

## 5. Technical Stack

### 5.1 Frontend

| Technology | Purpose |
|---|---|
| React 19 | UI framework |
| Vite 8 | Build tool |
| React Router 7 | Client-side routing |
| Tailwind CSS 4 | Styling |
| Recharts | Analytics charts (histogram, bar charts) |
| date-fns / date-fns-tz | Date formatting and IST timezone handling |
| PapaParse | CSV parsing and export |

### 5.2 Backend

| Technology | Purpose |
|---|---|
| Supabase (PostgreSQL) | Database with RLS |
| Supabase Auth | Google OAuth for admin |
| Supabase RPC functions | Server-side business logic |
| Supabase Edge Functions | Email dispatch via Resend |

### 5.3 Hosting and Deployment

| Service | Purpose | Tier |
|---|---|---|
| Vercel | Frontend hosting, auto-deploy from GitHub | Free (Hobby) |
| Supabase | Database, auth, edge functions | Free |
| Resend | Transactional email for results | Free (100/day) |
| GitHub | Source control, CI trigger | Free (Private repo) |

### 5.4 Cost Profile

All infrastructure runs on free tiers. Estimated limits before requiring paid tier:

| Service | Free tier limit | Current usage headroom |
|---|---|---|
| Supabase | 500MB database, 50,000 monthly active users | Comfortable for 5,000+ students |
| Vercel | 100GB bandwidth, unlimited deploys | Comfortable for 10,000+ monthly visits |
| Resend | 100 emails/day, 3,000/month | Sufficient for single-batch result emails |

Estimated monthly cost at current scale: **₹0**.

---

## 6. Architecture

### 6.1 System Architecture

```
┌─────────────────────┐         ┌──────────────────────────┐
│  React Frontend     │         │  Supabase                │
│  (Vercel)           │ ←────→  │  PostgreSQL + RLS         │
│                     │  REST   │  Auth (Google OAuth)      │
│  Student flows      │         │  RPC functions            │
│  Admin flows        │         │  Edge Functions (email)   │
└─────────────────────┘         └──────────────────────────┘
         │                                  │
         │ auto-deploy                      │ email
         ▼                                  ▼
┌─────────────────────┐         ┌──────────────────────────┐
│  GitHub             │         │  Resend                  │
│  (source control)   │         │  (transactional email)   │
└─────────────────────┘         └──────────────────────────┘
```

### 6.2 Frontend Architecture

Key frontend areas:

- `src/pages/StudentPage.jsx` — orchestrates the full student journey
- `src/pages/AdminPage.jsx` — lazy-loaded admin workspace
- `src/hooks/useExamState.js` — central exam lifecycle hook (attempt creation, question loading, response submission, scoring)
- `src/hooks/useTimer.js` — countdown logic, server time sync, auto-submit on expiry
- `src/lib/supabase.js` — Supabase client initialization, admin email check (hardcoded, not from env)
- `src/lib/seed.js` — cyrb53 hash, mulberry32 PRNG, Fisher-Yates shuffle, `selectAndShuffleQuestions` pipeline
- `src/lib/csv.js` — PapaParse wrapper with validation, formula injection sanitization
- `src/lib/errors.js` — centralized error handler mapping Supabase errors to human-readable messages

The frontend is organized around flows rather than a global state framework. Critical exam behavior is concentrated in the hook layer.

### 6.3 Backend Architecture

The backend contract is centralized in `supabase/schema.sql`. This is the authoritative schema containing all tables, RLS policies, triggers, helper functions, RPCs, and explicit grants.

**Key RPC patterns:**

| RPC | Caller | Purpose |
|---|---|---|
| `get_exam_questions(batch_id)` | anon | Fetch questions without correct_answer |
| `create_attempt(batch_id, roll_number, ...)` | anon | Server-side attempt creation with all validations |
| `save_response(attempt_id, question_id, answer, session_token)` | anon | Save individual answer with session validation |
| `submit_exam(attempt_id)` | anon | Server-side score computation and submission |
| `get_my_attempt(batch_id, roll_number, name)` | anon | Exam recovery on refresh |
| `get_my_responses(attempt_id)` | anon | Fetch answered questions for resume |
| `claim_session(attempt_id, token)` | anon | Session token claim/validate |
| `check_session(attempt_id, token)` | anon | Session token check |
| `get_server_time()` | anon | Server clock for timer sync |
| `replace_questions(batch_id, questions_jsonb)` | authenticated | Atomic question upload |
| `replace_roster(batch_id, roster_jsonb)` | authenticated | Atomic roster upload |
| `delete_batch(batch_id)` | authenticated | Cascade delete with audit |

---

## 7. Data Model

### 7.1 Entity Relationship

```
batches ──┬── questions
          ├── roster
          ├── attempts ──┬── responses
          │              └── tab_switches
          └── (audit_log references batch_id in details)
```

### 7.2 Table Summary

| Table | Purpose | Key columns |
|---|---|---|
| batches | Exam configuration and lifecycle | name, scheduled_start, duration_minutes, status, questions_per_student, access_code, show_results, pass_percentage, max_attempts |
| questions | MCQ question bank per batch | batch_id, question_text, option_a/b/c/d, correct_answer, sort_order |
| roster | Allowed students per batch | batch_id, roll_number, student_name, email |
| attempts | Student exam attempts | batch_id, roll_number, student_name, email, attempt_number, session_token, started_at, submitted_at, score, total_questions |
| responses | Individual answer records | attempt_id, question_id, selected_answer, is_correct |
| tab_switches | Tab visibility change events | attempt_id, left_at, returned_at |
| audit_log | Admin action trail | action, entity, entity_id, actor, details, created_at |

---

## 8. Security Model

### 8.1 Principles

The security model is database-centric. All access control is enforced at the PostgreSQL level through RLS policies and SECURITY DEFINER RPCs, not in the frontend.

- Anonymous student clients never receive unrestricted table access.
- Correct answers are never exposed through any student-facing path.
- Scoring is computed on the server from stored responses.
- Access code validation is server-side.
- Roster checks use dedicated RPCs rather than public roster reads.
- Session token validation protects response save and submission paths.
- Admin actions require `is_admin()` (checks `auth.jwt() ->> 'email'`).
- The admin email is hardcoded in `supabase.js`, not configurable via environment variable.

### 8.2 RLS Policy Summary

| Table | Role | Operation | Condition |
|---|---|---|---|
| batches | anon | SELECT | status IN ('scheduled', 'active', 'completed') |
| batches | authenticated | SELECT/INSERT/UPDATE/DELETE | is_admin() |
| questions | anon | SELECT | batch status = 'active' (but students use RPC instead) |
| questions | authenticated | SELECT/INSERT/UPDATE/DELETE | is_admin() |
| attempts | anon | SELECT | true (needed for INSERT RETURNING) |
| attempts | anon | INSERT | via create_attempt RPC (SECURITY DEFINER) |
| attempts | authenticated | SELECT/INSERT/UPDATE/DELETE | is_admin() |
| responses | anon | INSERT | via save_response RPC (SECURITY DEFINER) |
| responses | authenticated | SELECT | is_admin() |
| roster | anon | SELECT | batch status IN ('scheduled', 'active') |
| roster | authenticated | SELECT/INSERT/UPDATE/DELETE | is_admin() |
| tab_switches | anon | INSERT/UPDATE | true (for logging) |
| tab_switches | authenticated | SELECT | is_admin() |
| audit_log | authenticated | SELECT/INSERT | is_admin() |

### 8.3 Security Posture

This product is suitable for managed institutional assessments where browser-based integrity enforcement is acceptable and a physical invigilator is present. It is significantly more robust than a typical client-trusting quiz application because all evaluation, access, and submission decisions are server-authoritative.

It is NOT suitable for unsupervised remote high-stakes examinations without additional proctoring infrastructure (webcam monitoring, browser lockdown).

---

## 9. Known Edge Cases and Resolutions

These issues were discovered during development and testing. Documenting them to prevent regressions.

| Edge case | Resolution |
|---|---|
| Student enters after exam window has closed | `initExam` throws "The exam time window has already closed" before creating an attempt. No attempt record is written. |
| Student refreshes mid-exam | Attempt recovery via `get_my_attempt` + `get_my_responses` RPCs. Student resumes at next unanswered question. Timer recalculates from server time. |
| Timer expires with unsaved answer in flight | Warning dialog appears. Student can retry save or force-submit. Timer enforcement continues during warning. |
| Score displays NaN% when total_questions = 0 | `finalizeSubmission` guards `total > 0`. `ResultScreen` uses `Number.isFinite()`. |
| Batch completed while student is mid-exam | `submit_exam` accepts both `active` and `completed` status, allowing grace-period submission. |
| Student opens exam in two browser tabs | `claim_session` / `check_session` RPCs detect duplicate sessions. Second window is blocked. |
| Roll number enumeration on refresh | `get_my_attempt` requires matching `student_name` (case-insensitive). Roll number alone is insufficient. |
| Supabase INSERT RETURNING requires SELECT | anon SELECT policy on attempts table with `USING (true)`. |
| PostgreSQL missing GRANT misreported as RLS violation | All tables have explicit GRANT statements for both `anon` and `authenticated` roles. |
| CSV formula injection | All export cells sanitized before `Papa.unparse()`. |
| Schema drift across multiple migration files | Single authoritative `schema.sql` with migration history notes. |

---

## 10. Deployment Configuration

### 10.1 Supabase

| Setting | Value |
|---|---|
| Project URL | `https://msbpnpjjigheoplfnuly.supabase.co` |
| Project name | Bharatvidya |
| Region | (as configured) |
| Auth provider | Google OAuth (Internal, matramedia.co.in org) |

Schema is applied by running `supabase/schema.sql` in SQL Editor. Subsequent patches are applied as numbered migration files.

### 10.2 Vercel

| Setting | Value |
|---|---|
| Project | bharatvidya-assessment |
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Deploy trigger | Push to `main` branch |

### 10.3 Environment Variables (Vercel)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable/anon key |
| `RESEND_API_KEY` | Resend API key for email results (used by Edge Function) |

Note: `VITE_ADMIN_EMAIL` is NOT used. Admin email is hardcoded in `supabase.js` as a security measure (P3 fix).

### 10.4 DNS (when custom domain is configured)

| Record | Type | Name | Value |
|---|---|---|---|
| CNAME | CNAME | exams | cname.vercel-dns.com |

Domain: `exams.bharatvidya.in` (GoDaddy DNS). After configuring, update Supabase Auth URL Configuration: Site URL and Redirect URLs.

### 10.5 Google OAuth

| Setting | Value |
|---|---|
| GCP Project | bharatvidya-quiz-app |
| OAuth consent screen | Internal (matramedia.co.in org) |
| Authorized redirect URI | `https://msbpnpjjigheoplfnuly.supabase.co/auth/v1/callback` |

---

## 11. Operational Workflows

### 11.1 Typical Batch Setup Flow

1. Admin creates batch: name, date/time, duration, questions per student.
2. Admin uploads question bank CSV (preview → confirm).
3. Admin uploads student roster CSV (optional, preview → confirm).
4. Admin sets access code if needed.
5. Admin configures result visibility, passing percentage, max attempts.
6. Admin marks batch as `scheduled`.
7. Admin starts batch (manually or auto-transition at scheduled time).
8. Admin monitors live submissions on dashboard.
9. Admin ends batch (manually or auto-transition at scheduled_start + duration).
10. Admin reviews results, analytics, exports CSV, emails results, prints sheets.

### 11.2 Typical Student Flow

1. Open student portal (public URL, no login required).
2. See list of available batches (filtered by roll number if rostered).
3. Select batch.
4. Enter roll number (+ access code if required).
5. Confirm identity (rostered) or enter name (open batch).
6. Wait for countdown if batch is scheduled.
7. Read instructions, confirm readiness.
8. Take exam: one question at a time, select answer, click Next.
9. Submit on last question, or auto-submit on timer expiry.
10. View result (or submission confirmation if results hidden).
11. Retry if eligible (failed + retries remaining + batch still active).

---

## 12. UI / UX Specification

### 12.1 Design Direction

Clean, utilitarian, professional. This is an operational tool, not a brand surface. No heritage aesthetic. Designed for high readability on lab monitors and mobile devices.

Characteristics: card-based layouts, strong visual hierarchy for exam state, distinct student/admin experiences, focused use of accent/success/warning/error color states, responsive for desktop and mobile.

### 12.2 Student Screens

1. **Batch Select** — lists available batches, optional roll-number filter, shows live/upcoming status and access code requirement.
2. **Registration** — roll number input, optional access code input, roster lookup or manual name entry.
3. **Confirm Identity** — displays resolved identity for rostered students, requires explicit confirmation.
4. **Waiting Room** — live countdown to exam start.
5. **Instructions** — exam rules, question count, duration, readiness checkbox, "Begin Exam" button.
6. **Exam Screen** — sticky timer header, progress indicator, question text, radio button options, Next/Submit buttons, unsaved-answer warning, duplicate-session error.
7. **Result Screen** — score card (or submission confirmation), pass/fail indicator, retry button if eligible.

### 12.3 Admin Screens

1. **Dashboard** — overview cards (active now, upcoming 7 days, recently completed), live batch monitoring.
2. **All Batches** — full batch table with status, question count, roster count, submission count, and all action buttons.
3. **Batch Form** — full configuration form with locked fields for active/completed batches.
4. **Question Upload** — CSV parse/preview/upload workflow.
5. **Roster Upload** — CSV import with template download.
6. **Results View** — submission table, summary statistics, analytics charts, export/print/email/reset actions.
7. **Activity Log** — filterable, paginated audit event list.

---

## 13. Quality and Reliability

### 13.1 Engineering Checks

- `npm run lint` — ESLint
- `npm run build` — production build verification
- `npm test` — test suite

### 13.2 Error Handling

All Supabase/PostgreSQL errors are mapped to human-readable messages via a centralized error handler. No student ever sees raw technical error strings. Every error screen includes a "Try Again" or "Go Back" action.

### 13.3 Data Integrity

- Deterministic question selection via seeded PRNG
- Unique constraints on (batch_id, roll_number, attempt_number) and (attempt_id, question_id)
- Atomic operations for question and roster uploads (transaction-wrapped RPCs)
- Server-side scoring (never trust the client)
- Audit trail for all destructive admin actions
- Modal confirmations with batch-name-typing for destructive actions (delete batch, reset batch)

---

## 14. Limitations and Future Enhancements

### Current limitations

- Single admin (hardcoded email). Multi-admin requires institution-level role management.
- No descriptive/subjective question types.
- No question sections, weighted scoring, or adaptive logic.
- No webcam/AI proctoring (tab detection only).
- Email sending limited to 100/day on Resend free tier.
- No automated end-to-end test suite (manual testing only).

### Potential future enhancements

- Multi-admin support with role-based access
- Richer reporting: retry history, best-attempt vs latest-attempt views, per-student drilldown
- Configurable grading scales beyond simple percentage
- Image-based questions
- Bulk batch creation from CSV
- Institution branding (configurable logo, header, colors)
- Stronger automated integration and E2E test coverage
- Bulk archive / data retention workflows
- Mobile app wrapper (PWA)

---

## 15. Positioning

> **BharatVidya Assessment Platform** is a secure, admin-friendly web exam system for rostered and open MCQ assessments, with timed delivery, result controls, retries, analytics, and server-authoritative exam integrity. Built for institution-managed exams where operational simplicity and exam integrity matter.

---

## 16. Repository Structure

```
bharatvidya-assessment/
├── src/
│   ├── pages/
│   │   ├── StudentPage.jsx          # Student journey orchestrator
│   │   └── AdminPage.jsx            # Admin workspace (lazy-loaded)
│   ├── hooks/
│   │   ├── useExamState.js          # Core exam lifecycle
│   │   └── useTimer.js              # Countdown + server time sync
│   ├── lib/
│   │   ├── supabase.js              # Client init + admin check
│   │   ├── seed.js                  # PRNG + shuffle pipeline
│   │   ├── csv.js                   # Parse/export with sanitization
│   │   ├── errors.js                # Error message mapping
│   │   └── audit.js                 # Audit log helper
│   └── components/
│       ├── student/                 # Student-facing UI components
│       └── admin/                   # Admin-facing UI components
├── supabase/
│   ├── schema.sql                   # Authoritative backend contract
│   ├── migrations/                  # Numbered migration patches
│   └── functions/
│       └── email-results/index.ts   # Resend email dispatch
├── .claude/
│   └── skills/                      # Claude Code skills (frontend-design)
├── README.md                        # Quick-start and developer setup
├── package.json
└── vite.config.js
```
