# DEPENDENCIES Fix Plan

## Changes
None auto-applied — the one material advisory (`xlsx`) needs a dependency decision and a test pass, so it is flagged rather than swapped mid-audit.

## New files
None yet.

## Verification goals
- [x] All deps legitimate; lock file committed; vulnerable paths triaged (xlsx admin-only/write-only, vite dev-only)
- [ ] `npm audit` clean for runtime deps (blocked on the xlsx decision below)

## Manual verification / decision (for the human)
- **Choose the `xlsx` path:** (a) replace with `exceljs` in `src/lib/reportPack.ts` (recommended, one-file refactor + test), or (b) formally accept the risk (admin-only, generation-only, low real exposure) and note it. The npm `xlsx` has no in-place fix.
- `vite` advisory is dev-only (Windows dev-server `fs.deny` bypass); it never ships to production. No action needed beyond keeping Vite current.
