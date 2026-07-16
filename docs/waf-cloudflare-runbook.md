# WAF Runbook — Cloudflare in front of Supabase (custom domain)

**Why:** the exam client calls Supabase directly (`VITE_SUPABASE_URL`), so Vercel's WAF never sees exam traffic. The pentest's residual — no gateway rate limiting on `find_batch_by_code` / `create_attempt` — can only be closed in front of the Supabase API itself. Migration 026's failure-based DB throttling stays as the inner layer; this adds the outer layer, and all future testing then exercises the production topology.

## One-time setup

1. **Supabase custom domain** (paid add-on, ~$10/mo): Dashboard → Settings → Custom Domains → e.g. `api.matramedia.co.in` (or a bharatvidya domain). Supabase walks through the required DNS records (CNAME + TXT validations).
2. **Cloudflare**: the domain's DNS must be on Cloudflare. Create the CNAME per Supabase's instructions and set it to **Proxied** (orange cloud) once Supabase has validated (validate first with grey cloud — validation can fail behind the proxy).
3. **Google OAuth**: Google Cloud Console → the OAuth client → add the new callback `https://api.<domain>/auth/v1/callback` to Authorized redirect URIs. Also update the Site URL / redirect allowlist in Supabase Auth settings if it references the old `*.supabase.co` host.
4. **Client env**: set `VITE_SUPABASE_URL=https://api.<domain>` in Vercel project env + local `.env`, redeploy. The anon key is unchanged.
5. **Edge functions**: called via the same host (`https://api.<domain>/functions/v1/...`) — the `manage-admin` CORS allowlist and any hardcoded function URLs in the client don't change (they use the supabase-js client base URL).

## Cloudflare rules (Security → WAF → Rate limiting rules)

| Rule | Expression (URI path contains) | Limit | Action |
|---|---|---|---|
| Code lookup brute force | `/rest/v1/rpc/find_batch_by_code` | 30 req / 1 min per IP | Block 10 min |
| Attempt creation abuse | `/rest/v1/rpc/create_attempt` | 10 req / 1 min per IP | Block 10 min |
| Identity probing | `/rest/v1/rpc/verify_roster_identity` | 15 req / 1 min per IP | Block 10 min |
| Auth endpoint abuse | `/auth/v1/token` | 20 req / 5 min per IP | Managed challenge |

Notes:
- Limits are per-IP; a classroom NAT can put 60 students behind one IP. Before a large exam, raise the `create_attempt` and `verify_roster_identity` limits (or scope the rules to exclude known institution IPs) — students legitimately hit these ~1-3× each in the entry window.
- Keep **Bot Fight Mode off** for the API host (it challenges programmatic fetch, which is every request the app makes).
- Add a Cloudflare **Cache Rule: bypass** for the API host — never cache `/rest/*` or `/auth/*`.

## Verification checklist (after cutover)
1. Student flow end-to-end on the new host: batch lookup → register → exam → submit → result.
2. Admin login incl. TOTP MFA + Google OAuth redirect (this exercises the updated callback).
3. Rate limit fires: hammer `find_batch_by_code` with a bogus code >30×/min from one IP → expect HTTP 429/block page; confirm a normal client is unaffected afterwards from a different IP.
4. `manage-admin` edge function call from the Team tab still passes CORS.
5. Realtime/websockets if used (mission control presence): confirm `wss://api.<domain>/realtime/v1` connects through the proxy.

## Rollback
Set `VITE_SUPABASE_URL` back to `https://msbpnpjjigheoplfnuly.supabase.co` and redeploy — the direct host keeps working regardless of the custom domain, so rollback is a client env change only.
