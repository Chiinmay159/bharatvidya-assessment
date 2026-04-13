# BharatVidya Assessment Platform

Online exam tool for BharatVidya. Supports rostered/open batches, timed MCQ exams, live proctoring signals (tab-switch tracking), admin dashboard with results analytics, and roster-gated entry.

## Stack

- **Frontend:** React 19 + Vite + TailwindCSS 4
- **Backend:** Supabase (Postgres + RLS + Edge Functions)
- **Hosting:** Vercel (auto-deploys from `main`)

## Quick start

```bash
npm install
cp .env.example .env          # fill in Supabase URL + anon key
npm run dev                    # http://localhost:5173
```

## Environment variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable anon key |
| `VITE_ADMIN_EMAIL` | Email address allowed to access `/admin` |

## Database setup

Apply `supabase/schema.sql` to a fresh Supabase project. This is the single authoritative schema file containing all tables, RLS policies, triggers, RPCs, and execute grants.

**Do not use** any other `.sql` files in the repo root (they are historical and may be removed).

See the migration history comment at the top of `schema.sql` for the ordered list of migrations applied to the live project.

## Project structure

```
src/
  pages/
    StudentPage.jsx       # Student flow orchestrator
    AdminPage.jsx         # Admin flow (lazy-loaded)
  components/
    student/              # BatchSelect, Registration, ConfirmIdentity,
                          # WaitingRoom, Instructions, ExamScreen, ResultScreen
    admin/                # AdminLayout, AdminDashboard, BatchList, BatchForm,
                          # QuestionUpload, RosterUpload, ResultsView,
                          # BulkBatchCreate, ActivityLog
  hooks/
    useExamState.js       # Exam session lifecycle (attempt, questions, submit)
    useTimer.js           # Countdown timer with server-time sync
  lib/
    supabase.js           # Supabase client init
    seed.js               # Deterministic question shuffle
    errors.js             # Postgres error code mapping
    auditLog.js           # Client-side audit log helper
supabase/
  schema.sql              # Authoritative DB schema (apply to fresh project)
  functions/
    email-results/        # Edge function for emailing results (requires RESEND_API_KEY)
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm test` | Run unit tests (vitest) |
| `npm run preview` | Preview production build locally |

## Security model

- **Students** connect as Supabase `anon` role. RLS policies restrict access to active/scheduled batch data only. Roster data is never exposed directly; students verify identity via `verify_roster_entry` RPC.
- **Admin** authenticates via Google OAuth. All admin operations require `is_admin()` (checks JWT email). Admin-only RPCs (`replace_questions`, `replace_roster`) include server-side `is_admin()` guards inside SECURITY DEFINER functions.
- **Edge functions** verify JWT + admin status before executing.
- All RPCs have explicit `REVOKE ALL / GRANT EXECUTE` to prevent unintended access.

## Deployment

Push to `main` triggers auto-deploy on Vercel. For database changes, apply new migrations via the Supabase dashboard SQL editor, then update `schema.sql` to keep it authoritative.
