# FRONTEND_SECRETS Security Report

## Status: PASS

## Findings
The only credentials in client code are `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (both public by Supabase design), and an optional `VITE_SENTRY_DSN` (a public ingest DSN). No secret/service key is present in any file under `src/`, `public/`, or `index.html`.

Sensitive server-only operations are **not** performed from the browser with privileged credentials — they go through:
- **SECURITY DEFINER RPCs** (the service-role key never leaves Postgres), and
- **Edge functions** (`manage-admin`, `email-results`) that hold the service-role key and the Resend API key in the Deno runtime and gate every call on `is_admin()`.

## What's at risk
Nothing. An attacker reading the bundle gains only the anon key, which grants exactly the RLS-bounded access any visitor already has.

## What's already secure
Third-party privileged calls (Resend email) are proxied through an admin-gated edge function; the browser never holds the Resend key.

## Recommendations
None.

## Verification results
- [x] No secret keys in any frontend file
- [x] Sensitive calls proxy through edge functions / SECURITY DEFINER RPCs
- [x] Only publishable/public keys in client code
- [x] No `VITE_` var holds a secret
