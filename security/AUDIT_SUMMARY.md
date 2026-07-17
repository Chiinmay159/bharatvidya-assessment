# Security Audit Summary

Date: 2026-07-16
Scope: BharatVidya / Matra Assessment Platform (React SPA on Vercel + Supabase Postgres/RLS + 2 edge functions). No custom API server.

## Results

| # | Category | Status | Report | Plan |
|---|----------|--------|--------|------|
| 1 | SECRETS_EXPOSURE | PASS | [report](reports/SECRETS_EXPOSURE_REPORT.md) | [plan](plans/SECRETS_EXPOSURE_PLAN.md) |
| 2 | DATABASE_ACCESS | PASS (1 low fixed) | [report](reports/DATABASE_ACCESS_REPORT.md) | [plan](plans/DATABASE_ACCESS_PLAN.md) |
| 3 | AUTH_MIDDLEWARE | PASS | [report](reports/AUTH_MIDDLEWARE_REPORT.md) | [plan](plans/AUTH_MIDDLEWARE_PLAN.md) |
| 4 | ACCESS_CONTROL | PASS | [report](reports/ACCESS_CONTROL_REPORT.md) | [plan](plans/ACCESS_CONTROL_PLAN.md) |
| 5 | FRONTEND_SECRETS | PASS | [report](reports/FRONTEND_SECRETS_REPORT.md) | [plan](plans/FRONTEND_SECRETS_PLAN.md) |
| 6 | SSRF | N/A | [report](reports/SSRF_REPORT.md) | [plan](plans/SSRF_PLAN.md) |
| 7 | CSRF | PASS | [report](reports/CSRF_REPORT.md) | [plan](plans/CSRF_PLAN.md) |
| 8 | SECURITY_HEADERS | FIXED (was HIGH) | [report](reports/SECURITY_HEADERS_REPORT.md) | [plan](plans/SECURITY_HEADERS_PLAN.md) |
| 9 | CORS | PASS (1 config note) | [report](reports/CORS_REPORT.md) | [plan](plans/CORS_PLAN.md) |
| 10 | RATE_LIMITING | MEDIUM (gateway pending) | [report](reports/RATE_LIMITING_REPORT.md) | [plan](plans/RATE_LIMITING_PLAN.md) |
| 11 | SQL_INJECTION | PASS | [report](reports/SQL_INJECTION_REPORT.md) | [plan](plans/SQL_INJECTION_PLAN.md) |
| 12 | XSS | PASS | [report](reports/XSS_REPORT.md) | [plan](plans/XSS_PLAN.md) |
| 13 | PAYMENT_WEBHOOKS | N/A | [report](reports/PAYMENT_WEBHOOKS_REPORT.md) | [plan](plans/PAYMENT_WEBHOOKS_PLAN.md) |
| 14 | FILE_UPLOADS | N/A | [report](reports/FILE_UPLOADS_REPORT.md) | [plan](plans/FILE_UPLOADS_PLAN.md) |
| 15 | ERROR_HANDLING | PASS | [report](reports/ERROR_HANDLING_REPORT.md) | [plan](plans/ERROR_HANDLING_PLAN.md) |
| 16 | PASSWORD_HASHING | N/A | [report](reports/PASSWORD_HASHING_REPORT.md) | [plan](plans/PASSWORD_HASHING_PLAN.md) |
| 17 | DEPENDENCIES | MEDIUM (xlsx) | [report](reports/DEPENDENCIES_REPORT.md) | [plan](plans/DEPENDENCIES_PLAN.md) |

## Headline

**No CRITICAL or HIGH-exploitable vulnerability is open.** The database-centric security model (RLS on every table, MFA-gated `is_admin()`, org-scoped ownership on every admin RPC, server-authoritative timing, answer-key stripping) is strong and independently confirmed by the June production penetration test. The one genuine HIGH gap — total absence of HTTP security headers — was **fixed this pass**. Two items remain MEDIUM (gateway rate limiting; the `xlsx` dependency advisory), both with low real-world exposure and clear owners.

## Fixed during this audit

- **SECURITY_HEADERS** — full `headers` block added to `vercel.json` (CSP + HSTS + X-Frame-Options + X-Content-Type-Options + Referrer-Policy + Permissions-Policy). CSP validated against built output.
- **DATABASE_ACCESS** — migration `030` pinned `search_path = public` on the last 8 trigger/helper functions; applied to production and re-verified (0 remain mutable).

## Critical issues

None.

## Remaining manual verification (for the human)

1. **Post-deploy header check** — `curl -sI https://exams.matramedia.co.in` shows all six headers; no CSP console violations across landing / exam / verify / check.
2. **Supabase Auth** — enable **Leaked Password Protection** (Dashboard → Authentication → Policies).
3. **email-results edge function** — set env `ALLOWED_ORIGIN=https://exams.matramedia.co.in` (stale default is the old Vercel domain).
4. **Cloudflare WAF cutover** — execute `docs/waf-cloudflare-runbook.md` before any marquee public exam (closes the gateway rate-limiting gap and X-Forwarded-For spoofing).
5. **`xlsx` dependency** — decide: replace with `exceljs` in `reportPack.ts` (recommended) or formally accept the admin-only, generation-only risk.
6. **Optional** — disable pg_graphql if unused (clears 36 informational advisories; RLS already governs it).

## Method note

Every finding is grounded in the actual codebase and the live database (schema.sql, edge functions, `npm audit`, and Supabase `get_advisors`), not assumed. Categories marked N/A state why. The two fixes were verified: CSP against the built `dist/index.html`, and the search_path migration by re-querying `pg_proc` live.
