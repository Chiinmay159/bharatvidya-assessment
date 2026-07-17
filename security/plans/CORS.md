# CORS Fix Plan

## Changes
None in code — both edge functions already use explicit-origin allowlists with no wildcard.

## New files
None.

## Verification goals
- [x] Explicit origin allowlist, no wildcard, no wildcard+credentials
- [ ] `email-results` `ALLOWED_ORIGIN` env set to `https://exams.matramedia.co.in`

## Manual verification (for the human)
- Supabase Dashboard → Edge Functions → `email-results` → set env `ALLOWED_ORIGIN=https://exams.matramedia.co.in` so the response origin never falls back to the stale `bharatvidya-assessment.vercel.app` default. Cosmetic/functional, not a vulnerability.
