# RATE_LIMITING Fix Plan

## Changes
None in code this pass. DB-layer failure throttling (migration 026) already covers the enumeration RPCs; auth flows inherit Supabase platform limits.

## New files
None (the Cloudflare runbook already exists at `docs/waf-cloudflare-runbook.md`).

## Verification goals
- [x] Auth + enumeration surfaces have some rate limiting today
- [ ] Edge/gateway (WAF) rate limiting live in front of the Supabase API
- [ ] X-Forwarded-For spoofing neutralized (only true once behind the WAF)

## Manual verification (for the human)
- Execute the Cloudflare cutover in `docs/waf-cloudflare-runbook.md` before any large public exam: per-path limits on `find_batch_by_code`, `verify_roster_identity`, `create_attempt`, `/auth/v1/token`. Mind the classroom-NAT caveat (raise limits for known institution IPs).
