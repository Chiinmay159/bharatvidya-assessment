# PASSWORD_HASHING Security Report

## Status: N/A (managed by Supabase Auth)

## Findings
The application does **not** hash or store passwords itself. All authentication is delegated to **Supabase Auth** (GoTrue): Google OAuth and email+password for institutional admins. Password hashing, storage, and verification happen inside Supabase's managed auth service (bcrypt), never in application code. `manage-admin` sets passwords via `admin.auth.admin.createUser/updateUserById` — it hands the password to Supabase Auth and never touches a hash. There is **no** MD5/SHA-1/SHA-256-on-password code anywhere.

## What's at risk
Nothing in-scope — password handling is outside the application boundary, in a managed provider.

## What's already secure
Delegated auth with provider-managed bcrypt; MFA (TOTP, `aal2`) now enforced on top (migration 027).

## Recommendations
Enable **Leaked Password Protection** in Supabase Auth (also noted in DATABASE_ACCESS) so breached passwords are rejected at set-time.

## Verification results
- [x] No application-side password hashing (managed by Supabase Auth — N/A)
- [x] No MD5/SHA-1/SHA-256 used on passwords anywhere
