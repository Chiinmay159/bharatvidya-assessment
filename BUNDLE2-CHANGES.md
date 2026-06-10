# Bundle 2 — "Build the Brain" — Change Log
**Completed:** 11 June 2026 · All changes validated on staging (`bharatvidya-staging`)

## Database (migrations 013–014 — applied to staging; apply to production before next exam)

### 013 — Question bank, student identity, admin roles
- `bank_questions`: reusable questions with topic/subtopic, difficulty, Bloom's level, language (en/hi/sa/mr/mixed), tags, explanation, versioning, usage tracking.
- Review workflow enforced by trigger: draft → in_review → approved → retired; **no self-approval** (four-eyes); content edits to approved questions revert to draft + bump version.
- `compose_batch_from_bank(batch_id, blueprint)`: copies approved questions into a frozen batch paper by topic/difficulty rules, LRU rotation, no in-paper duplicates, fails loudly on shortfall, audit-logged. The per-batch `questions` table is unchanged — all Bundle-1 mechanisms intact. Lineage via `questions.bank_question_id`.
- `students`: persistent identity keyed by email; `create_attempt` links automatically; historical attempts backfilled.
- `admin_users` (owner/examiner/viewer) replaces hardcoded admin email in `is_admin()`; `admin_role()` helper; owner-only admin management. chinmay@matramedia.co.in seeded as owner.

### 014 — Item analysis & anomaly detection (admin-only RPCs)
- `item_analysis(batch_id)`: difficulty index, U-L discrimination (27% bands), avg time per question, distractor distribution.
- `anomaly_report(batch_id)`: fast finishers (<25% of median duration), answer twins (identical wrong-answer signatures — O(n); an O(n²) pairwise design was tested and rejected after blowing temp disk at 1,800 attempts), aggregated integrity signals.
- `bank_item_performance()`: cross-exam stats per bank question.
- Validated against the 1,837-attempt load-test corpus: random bots showed difficulty ≈ 0.25 (chance) — math confirmed.

## Frontend
- **Question Bank** admin tab: filters, status workflow actions, four-eyes-aware approve button, version/usage display. `QuestionBank.jsx`, `QuestionBankForm.jsx`.
- **Compose paper** from bank on the batch questions screen with live availability counts. `ComposePaperModal.jsx`. CSV upload unchanged.
- **Item analysis & integrity report** view from batch results, with interpretation guidance and automatic flagging (too easy/hard, weak/negative discrimination → "check the answer key"). `BatchAnalytics.jsx`.
- **Role-based admin login**: client asks server `is_admin()`; hardcoded email removed everywhere. Adding an admin = one row in `admin_users`.
- **TypeScript migration**: all of `src/lib/` and `src/hooks/` converted with strict types; `tsconfig.json`; `npm run typecheck` added locally and to CI. Components remain JSX (typed incrementally later).
- **Component splits** (extraction-only, behavior identical): ExamScreen 499→391, BatchList 482→321, AdminDashboard 316→254, ResultScreen 326→280 lines; icons/status screens/modals in sibling files.

## Verification
typecheck ✓ · eslint ✓ · 26 tests ✓ · build ✓ (after every step)

## Deployment notes
1. `npm install` (new deps: typescript, typescript-eslint, @types/papaparse)
2. Apply migrations 013, 014 to production when restored (013 changes `is_admin()` — apply 013+014 together with 011–012 in order)
3. Supabase Auth → enable MFA for admin accounts (dashboard toggle, recommended)
4. Bundle 2 exit criterion (exam composed from bank → identified students → item analysis) was demonstrated on staging via SQL simulation; repeat through the UI at leisure.

## Remaining (moved to Bundle 3)
- "Students" admin browsing view (cross-exam history)
- Multi-organization, mission control, certificates, report packs, PWA, i18n
