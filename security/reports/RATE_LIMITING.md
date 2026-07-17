# RATE_LIMITING Security Report

## Status: MEDIUM (DB-layer present; gateway layer pending — already tracked)

## Findings
- **Auth endpoints** (login, password, admin provisioning) are handled by **Supabase Auth** and the `manage-admin` edge function, which sit behind Supabase's platform-level rate limiting. The app does not roll its own login.
- **Anti-enumeration RPCs** carry app-level, **failure-only** throttling (migration 026): `find_batch_by_code` and `verify_roster_identity` use `client_ip()` + `bump_rate()` against the `rate_limits` table, so brute-forcing exam codes or probing roster identity is throttled while legitimate traffic is never penalized.
- **Gap:** there is no edge/gateway (WAF) rate limit in front of the Supabase API. `client_ip()` derives the IP from request headers, which a determined attacker could rotate/spoof; DB-layer throttling is a backstop, not a substitute for edge enforcement. This is a known residual from the June pentest and is already documented in [docs/waf-cloudflare-runbook.md](../../docs/waf-cloudflare-runbook.md) (Cloudflare in front of a Supabase custom domain), pending DNS cutover.

## What's at risk
High-volume brute force of `find_batch_by_code` (8-char code space) or `verify_roster_identity` from rotating IPs. Each hit still grants nothing without full roster identity, but the traffic is not hard-capped at the edge.

## What's already secure
Failure-based DB throttling on exactly the two enumeration surfaces; auth flows inherit Supabase platform limits; a written WAF runbook exists.

## Recommendations
Execute the Cloudflare cutover in the runbook before any marquee public exam: per-path rate limits on `/rest/v1/rpc/find_batch_by_code`, `verify_roster_identity`, `create_attempt`, and `/auth/v1/token`. Note the runbook's classroom-NAT caveat (per-IP limits vs. many students behind one IP).

## Verification results
- [x] Auth flows rate-limited (Supabase platform)
- [x] Enumeration RPCs failure-throttled (migration 026)
- [ ] Edge/gateway rate limiting — pending Cloudflare cutover (runbook ready)
- [ ] X-Forwarded-For spoof resistance — achieved only once behind the WAF
