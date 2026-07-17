# DATABASE_ACCESS Fix Plan

## Changes
- `supabase/migrations/030_pin_function_search_path.sql` — `ALTER FUNCTION … SET search_path = public` on the 8 flagged trigger/helper functions. **DONE + applied to production.**
- `supabase/schema.sql` — history entry 30 + the 8 ALTER statements appended for bootstrap parity. **DONE.**

## New files
- `supabase/migrations/030_pin_function_search_path.sql` (created).

## Verification goals
- [x] No policy uses `USING (true)`
- [x] Every table RLS-enabled (+ `ensure_rls` auto-enable trigger)
- [x] Zero ERROR/CRITICAL live security advisors
- [x] 0 functions with mutable search_path (re-queried live after migration)
- [ ] Leaked Password Protection enabled in Supabase Auth

## Manual verification (for the human)
- Supabase Dashboard → Authentication → Policies → enable **Leaked Password Protection** (closes advisor `auth_leaked_password_protection`).
- Optional: if pg_graphql is unused, disable it to clear 36 `pg_graphql_*_table_exposed` advisories (RLS already governs it; hygiene only).
