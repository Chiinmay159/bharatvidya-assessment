# MFA recovery runbook

Admin surfaces require an aal2 (TOTP-verified) session since migration 027.
This is every way back in when an authenticator is lost, ordered cheapest first.

## 1. Another admin is locked out

Any owner: **Admin portal → Team → Reset MFA** on their row. Their factors are
removed and their sessions revoked; they enroll a fresh authenticator at next
sign-in. (Edge function `manage-admin`, action `reset_mfa` — owner-gated, org-scoped.)

## 2. The owner lost their phone but has a backup factor

Sign in and verify with the backup authenticator (Team → "Your sign-in
security" is where backups are added — keep one in 1Password or Apple
Passwords on a desktop). Then remove the lost phone's factor from the same card.

An owner with any live aal2 session can also call Reset MFA on their own row.

## 3. Break-glass: the owner has no backup factor and no live session

Nobody can reach aal2, so the portal cannot help. Run this in the Supabase SQL
editor (dashboard login is independent of app MFA):

```sql
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = 'chinmay@matramedia.co.in');
```

Next sign-in lands on the enrollment gate with a fresh QR. This is safe: the
account still authenticates via Google/password first; deleting factors only
returns it to the "not yet enrolled" state.

## Enrollment gotchas (what the gate's copy already warns about)

- A secret is minted once and never re-shown. The gate keeps a pending QR alive
  across reloads in the same tab; "Start over" (and only that) invalidates it.
- Codes rejected repeatedly with a freshly scanned QR → the device clock is
  off. Phone: enable automatic date & time; Google Authenticator:
  Settings → Time correction for codes → Sync now.
- Multiple BharatVidya entries in an authenticator app: only the newest
  enrollment works — delete the rest.
