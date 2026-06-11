# Platform Re-Audit — 11 June 2026
Security · Database · UX · Accessibility · Workflows. Findings verified against the live production database.

## Headline
The Bundle-1 exam-runtime hardening (answer-key protection, server-side scoring, session tokens on writes, column grants, search_path hygiene, encrypted-paper timing) remains **solid** — re-verified, no regressions. Every new finding lives in the **newer layers (migrations 013–019): multi-tenancy, the code gate, and identity** — where the security model was written into comments and client code but **not enforced in the server-side write paths.** Two are CRITICAL and confirmed exploitable.

---

## CRITICAL (fix before any real exam, especially before a second org onboards)

### C1 — Roster identity is enforced only in JavaScript; `create_attempt` never checks the roster
*Confirmed: `create_attempt` contains no reference to the roster table.*

The migration-019 promise — "roll number + email must both match the roster" — lives entirely in `Registration.jsx` calling `verify_roster_identity`. But the actual write path, `create_attempt`, takes `roll_number`/`name`/`email` verbatim and never joins `roster`. An attacker holding the public anon key + the exam code calls `create_attempt` directly with any identity and is in. **Impersonation and sitting un-rostered exams are trivially possible.** The client-side check is decorative.

**Fix:** enforce roster membership inside `create_attempt`: when a roster exists for the batch, require a row matching `roll_number AND lower(email)`, else `RAISE EXCEPTION`. (Same for `claim_session`.)

### C2 — The exam code *is* the access code → one 6-char string is the entire credential
*Confirmed: `batches_autocode` writes into the same `access_code` column that gates entry.*

The code a student types to *discover* an exam is byte-identical to the secret that *authorizes* entry. There's one secret, not two. Combined with C1, a single guessable 6-character string lets anyone sit any rostered exam as anyone. Entropy is 32⁶ ≈ 1.07×10⁹ with **no rate limiting** on `find_batch_by_code` — brute-forceable for a determined attacker, and each hit returns full batch metadata (org, series) as an oracle.

**Fix:** (a) lengthen the discovery code to 8–10 chars *or* separate discovery code from access secret; (b) rate-limit `find_batch_by_code` and `verify_access_code`; (c) C1 is the real backstop — fix it first.

---

## HIGH

### H1 — Org-scoping is on exactly one policy; every child table and admin RPC leaks across institutions
*Confirmed: `attempts_select_admin` and `mission_control` contain no `admin_org` check.*

Migration 015 scoped only `batches_select_admin`. Every other admin surface — `attempts/responses/questions/roster/certificates/students` table policies, and the RPCs `mission_control`, `item_analysis`, `anomaly_report`, `series_results`, `grant_time_extension`, `issue_certificates`, `delete_batch`, `compose_batch_from_bank`, `replace_questions/roster` — gates on bare `is_admin()`, true for *any* admin in *any* org. **A College A admin can read College B's students' answers, scores, emails — and call `delete_batch` / `grant_time_extension` on College B's exams.** Latent today (only your org exists); becomes a full cross-tenant breach the moment a partner college gets an admin account.

**Fix:** add `(admin_org() IS NULL OR organization_id = admin_org())` to every admin table policy, and resolve+check the target's org inside every admin RPC. Decide whether `bank_questions` and `students` are global or per-org (they have no `organization_id` today).

### H2 — Student-data RPCs authenticate on roll + name, both discoverable
`get_my_attempt`, `get_my_responses`, `get_my_series_standing`, `claim_session` check only `roll_number + student_name` — neither is secret. A classmate who knows a victim's roll + name can read their email/score/answers, or `claim_session` to **knock the victim out of their own live exam** (DoS) — the very impersonation 019 was meant to stop, through a different door.

**Fix:** require email on all four and verify against the attempt/roster row, matching the 019 model.

### H3 — Exam deadline is enforced only in the client
Server RPCs (`save_response*`, `submit_exam`, `create_attempt`) check `status='active'` but never compare `now()` to `scheduled_start + duration + extra_time`. A batch stays active until an admin ends it, so a student calling RPCs directly can **keep answering and submit past their deadline**. Per-attempt time extensions are also client-timer-only.

**Fix:** compute the authoritative deadline server-side and reject late writes.

---

## MEDIUM

- **M1 — Response inserts don't verify the question belongs to the batch.** `save_response`/`save_responses_batch` insert any `question_id`; `set_is_correct` scores it globally. A student can inject foreign correct answers to **inflate their score**. Fix: `WHERE EXISTS(... questions q WHERE q.id=question_id AND q.batch_id = attempt's batch)`.
- **M2 — `claim_session` re-seizure** (consequence of H2): re-claimable with non-secret credentials; single-session is advisory. Fix with H2 + log re-claims.
- **M3 — Code-gate oracle**: `find_batch_by_code` returns full org/series metadata on a hit. Rate-limit + return minimum.

## UX / Accessibility — exam-day blockers

- **U1 (HIGH) — The exam code is nearly undiscoverable for admins.** It appears only inside Edit-Batch and the downloaded summary — never in the batch list or Mission Control. On exam morning an invigilator can't quickly read it out. Fix: show the code (monospace + copy button) in the batch row and Mission Control header.
- **U2 (HIGH) — `ConfirmIdentity` is now a redundant dead step.** After 019, identity is already proven in Registration and the name is the authoritative roster value — "Is this you? / Not me" is meaningless and adds a full screen on the flaky-4G critical path. Fix: drop `confirm` for rostered students (keep only as a typo-check on the no-roster branch).
- **U3 (HIGH) — White-on-gold buttons fail WCAG AA (~1.9:1).** Six admin components and the exam-screen badges hard-code `#fff` on gold instead of the design system's dark-ink-on-gold (~7:1). Fix: use `var(--text-1)` / the shared `.btn-primary` class everywhere.
- **U4 (MED) — Back from Registration discards the entered code**; student must re-type it. Lift code into page state.
- **U5 (MED) — No-roster exams collect email but ignore it, and the "anyone can enter" warning is buried in a downloaded file.** Surface it on-screen in BatchForm/BatchList/Mission Control.
- **U6 (MED) — Mobile leftovers:** the `@media` rule targets `.batch-card-inner`, a class that no longer exists (dead); admin action links are below the 44px touch target.
- **U7 (LOW) — `VerifyPage` still hard-codes "BharatVidya"** though certificates can belong to any tenant; admin login logo `alt="BharatVidya"` under a "Matra" heading. Make tenant-driven/neutral.
- **U8 (LOW) — Toggle switches** (`role="switch"`) lack an accessible name; mixed admin button radii (8px vs 4px).

## What's solid (re-verified — don't touch)
Answer-key stripping and key-release timing; `access_code`/`paper_key` excluded from anon grants; all SECURITY DEFINER funcs set `search_path`; no dynamic SQL; certificate verification exposes only face fields; RLS enabled on all 16 tables; FocusTrapModal, monotonic timer, offline queue, skip-link, reduced-motion, Devanagari `lang` tags.

---

## Recommended fix order (one focused session)
1. **C1 + C2** — enforce roster in `create_attempt`/`claim_session`; lengthen code + rate-limit. *The headline break.*
2. **H1** — org-scope every child policy and admin RPC. *Before any partner-college admin exists.*
3. **H2 + H3 + M1** — email on `get_my_*`/`claim_session`; server-side deadline; question-belongs-to-batch check.
4. **U1, U2, U3** — code visibility, kill redundant ConfirmIdentity, fix button contrast.
5. The rest (U4–U8, M2–M3) as polish.

All findings were confirmed against the live database where claimed; none are speculative at CRITICAL/HIGH.
