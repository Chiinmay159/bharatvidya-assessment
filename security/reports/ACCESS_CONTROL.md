# ACCESS_CONTROL Security Report

## Status: PASS

## Findings
Ownership is checked separately from authentication, on both read and write paths:

- **Students** never address resources by raw ID alone. `get_my_attempt`, `get_my_responses`, `get_my_series_standing`, `claim_session` require `roll_number` + `email` matched against the roster/attempt row; `save_response`, `save_responses_batch`, `submit_exam`, `submit_late_buffer` require the per-attempt **session token**; `save_response` additionally verifies the question belongs to the exam ("Question does not belong to this exam"). Deadlines are server-authoritative.
- **Admins** pass both `is_admin()` (authentication + role) **and** an org-ownership check (`batch_in_my_org`/`attempt_in_my_org`/`series_in_my_org`) inside every admin RPC that takes a resource ID — so a College-A admin cannot read or mutate College-B resources even with a valid admin session. `review_late_response` re-checks `attempt_in_my_org` before applying a late answer.

Auth and ownership are genuinely distinct: holding an admin session does not imply owning a given batch; holding a student session does not imply owning a given attempt.

## What's at risk
Nothing. Cross-tenant IDOR was specifically attacked in the pentest and refused.

## What's already secure
Row-level ownership enforced on GET/INSERT/UPDATE/DELETE equivalents via SECURITY DEFINER guards + RLS; org isolation on every admin surface.

## Recommendations
Keep org-scope checks mandatory on any new admin RPC that accepts an ID.

## Verification results
- [x] Resource-ID routes verify ownership (student identity/token; admin org-scope)
- [x] Checks present on read and write paths
- [x] Ownership failure is refused server-side
- [x] Auth and ownership are separate checks
