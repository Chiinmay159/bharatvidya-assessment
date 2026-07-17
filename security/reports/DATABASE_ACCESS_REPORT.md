# DATABASE_ACCESS Security Report

## Status: PASS (2 low hardening items, 1 fixed here)

## Findings

The entire backend is Supabase Postgres. There is no custom API server; the browser talks to Postgres through PostgREST/RPC with the public `anon` key, and **Row Level Security is the security boundary**. Verified against [supabase/schema.sql](../../supabase/schema.sql) and the live project (`msbpnpjjigheoplfnuly`).

- **RLS coverage**: 19 `ENABLE ROW LEVEL SECURITY` statements for 18 tables — every table is covered. Additionally, an `ensure_rls` **event trigger** (`rls_auto_enable`) auto-enables RLS on any future table, so a forgotten `ENABLE` fails closed.
- **No blanket policies**: `grep` for `USING (true)` / `WITH CHECK (true)` returns **nothing**. No policy grants unconditional access.
- **Anon surface is deliberate and column-scoped**: anon can `SELECT` only specific columns of `organizations` (`id, name, display_name, logo_url`) and `batches` (routing metadata; column grants block `access_code`/`paper_key`), and `INSERT` to `attempts`/`responses`/`tab_switches` only through the exam-write path. Everything else is reached through `SECURITY DEFINER` RPCs that carry their own `is_admin()` / ownership / roster / deadline checks and explicit `REVOKE ALL` + `GRANT EXECUTE`.
- **Live advisors**: `get_advisors(security)` returns **148 findings, zero ERROR/CRITICAL**. The bulk (102) are `*_security_definer_function_executable` — Supabase flagging that SECURITY DEFINER RPCs are callable by anon/authenticated, which is precisely this app's intended, penetration-tested design. 36 are `pg_graphql_*_table_exposed` (GraphQL endpoint governed by the same RLS). 1 is `rls_enabled_no_policy` on `rate_limits` — **intentional**: the table is reachable only by SECURITY DEFINER functions, so "RLS on, no policy" = deny-all-by-default, which is correct.

## What's at risk

Effectively nothing at the table level today. The residual risk is structural, not present: because RLS is the whole boundary, any *future* table or RPC that ships without org/role/identity checks becomes a hole. The event trigger mitigates the table case; the RPC case depends on maintaining the established pattern (see the "six silent registries" discipline in the repo).

## What's already secure

- Every table RLS-enabled, no permissive policies, cross-tenant isolation via `admin_org()`/`batch_in_my_org()` on admin surfaces.
- The 11 June production penetration test (24 attacks with the anon key) confirmed no answer-key extraction, no impersonation, no cross-tenant reads.
- Answer keys are stripped server-side in both the direct and encrypted-prefetch delivery paths.

## Recommendations

1. **FIXED — mutable search_path (LOW):** 8 trigger/helper functions lacked a pinned `search_path`. Migration `030_pin_function_search_path.sql` sets `search_path = public` on all 8; re-query confirms **0 remain**.
2. **Owed (human, LOW):** enable **Leaked Password Protection** in Supabase Auth (advisor `auth_leaked_password_protection`) — Dashboard → Authentication → Policies. Protects password-based admin accounts against known-breached passwords.
3. **Optional (human, INFO):** if the pg_graphql endpoint is unused (the app uses PostgREST/RPC only), disabling `pg_graphql` removes 36 advisories and shrinks surface. RLS already governs it, so this is hygiene, not a hole.

## Verification results

- [x] Every table has RLS enabled (19 enables / 18 tables + auto-enable trigger).
- [x] No policy uses `USING (true)`.
- [x] Live security advisors contain zero ERROR/CRITICAL.
- [x] Mutable search_path closed (0 remain, verified live).
- [ ] Leaked-password protection — human dashboard toggle.
