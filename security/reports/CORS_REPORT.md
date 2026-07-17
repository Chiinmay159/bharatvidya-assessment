# CORS Security Report

## Status: PASS (1 cosmetic note)

## Findings
CORS matters only for the two edge functions (the static site and PostgREST use Supabase's own CORS).
- `manage-admin`: `Access-Control-Allow-Origin: 'https://exams.matramedia.co.in'` — an explicit single origin, **no wildcard**.
- `email-results`: `Access-Control-Allow-Origin` from `Deno.env.get('ALLOWED_ORIGIN')` defaulting to `'https://bharatvidya-assessment.vercel.app'` — also explicit, no wildcard. The default is the old Vercel domain; the `ALLOWED_ORIGIN` env should be set to `https://exams.matramedia.co.in` in the function's config so the fallback is never relied upon.
- Neither function pairs a wildcard with credentials; both authenticate via bearer JWT, not cookies.

## What's at risk
Nothing security-relevant. Worst case of the stale default is that a legitimate call from the custom domain is CORS-blocked (a functional annoyance), not a cross-origin data leak.

## What's already secure
Explicit-origin allowlists on both functions; no `*`; no wildcard+credentials combination.

## Recommendations
Set `ALLOWED_ORIGIN=https://exams.matramedia.co.in` on the `email-results` edge function (Supabase Dashboard → Edge Functions → env). Cosmetic/functional, not a vulnerability.

## Verification results
- [x] CORS origin is an explicit allowlist, no wildcard
- [x] `credentials: true` never paired with `*` (bearer-token auth, not cookies)
- [ ] `email-results` `ALLOWED_ORIGIN` env set to the custom domain — human dashboard step
