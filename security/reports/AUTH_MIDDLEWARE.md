# AUTH_MIDDLEWARE Security Report

## Status: PASS

## Findings
There is no custom API server, so "middleware" maps to two enforcement layers, both server-side:

**1. Postgres RPCs / RLS.** Every data path is a `SECURITY DEFINER` function or RLS-governed table. Admin RPCs (`mission_control`, `item_analysis`, `delete_batch`, `replace_questions`, `replace_roster`, `issue_certificates`, `grant_time_extension`, `review_late_response`, `batch_similarity_matrix`, …) call `is_admin()` **and** an org-scope check (`batch_in_my_org` / `attempt_in_my_org`) at the top of the function body — before any work. `is_admin()` itself now requires an `aal2` (MFA) session (migration 027). Student RPCs enforce roster identity + session-token + deadline.

**2. Edge functions.** Both `manage-admin` and `email-results` validate the JWT (`auth.getUser`) and re-check `is_admin()` / owner role before executing; `manage-admin` additionally requires `aal2`.

**Client-side routing** (`/admin`) is UX only and self-describes as such; it calls `is_admin()` and signs out non-admins, but the real boundary is server-side and holds even if the client is bypassed (confirmed by the production pentest calling RPCs directly with the raw anon key).

## What's at risk
Nothing exploitable. The check-before-handler property holds because the guard is the first statement inside each SECURITY DEFINER function.

## What's already secure
Auth is enforced at the database, not the frontend; admin RPCs are gated on MFA-backed `is_admin()`; edge functions independently verify.

## Recommendations
Maintain the pattern: any new admin RPC must open with `is_admin()` + org check; any new table must ship RLS policies (the `ensure_rls` trigger enforces the enable).

## Verification results
- [x] Every data-returning/modifying path validates auth server-side before work
- [x] Guard runs before the handler body (first statements in each function)
- [x] Unauthenticated RPC calls are refused (pentest-confirmed)
- [x] Admin routes require admin role (+ MFA)
