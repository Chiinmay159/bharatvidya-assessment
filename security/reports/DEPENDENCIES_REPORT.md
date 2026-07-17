# DEPENDENCIES Security Report

## Status: MEDIUM (1 runtime dep with unfixable advisory, admin-only surface)

## Findings

`npm audit` reports **9 vulnerabilities (1 low, 2 moderate, 6 high)**. Triaged against actual usage:

- **`xlsx` (SheetJS) — HIGH ×2, no fix available.** Prototype Pollution ([GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)) and ReDoS ([GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)). The npm-published version is abandoned; SheetJS ships fixes only via their own CDN. Used in exactly one place: [src/lib/reportPack.ts](../../src/lib/reportPack.ts) (`XLSX.writeFile`), invoked from the admin "Report pack (.xlsx)" button. It **writes** a workbook from the admin's own database rows; it does not **parse** untrusted `.xlsx` input. Both advisories require crafted malicious input, so the practical exposure is low — but it is a HIGH advisory with no in-place fix.
- **`vite` — moderate, dev-only.** `server.fs.deny` bypass on Windows ([GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)). Affects the dev server only; never runs in production (Vercel serves static `dist/`). Not exploitable in the shipped product.

Version pinning: `package.json` uses `^`/`~` ranges (34 occurrences), but **`package-lock.json` is committed and tracked**, so installs are deterministic. Every dependency is a well-known package on the npm registry with substantial history (react, @supabase/supabase-js, recharts, papaparse, date-fns, qrcode, xlsx). No typosquats or suspiciously new/low-download packages.

## What's at risk

An attacker who could get malicious data into the cells of an admin's report pack could attempt prototype pollution / ReDoS during `.xlsx` generation. The data originates from the institution's own exam records, so this requires a malicious admin or poisoned exam content, and the blast radius is the admin's own browser tab.

## What's already secure

- Lock file committed; no unknown or malicious packages; no evidence of dependency confusion.
- The vulnerable `xlsx` path is admin-only and generation-only, not an untrusted-input parser.
- Vite advisory is dev-tooling, absent from production.

## Recommendations (flagged for human decision — not auto-changed)

1. **`xlsx` (do one of):** (a) migrate to the SheetJS CDN build (`https://cdn.sheetjs.com/xlsx-latest/…`, the maintained line) — but that violates the app's self-contained/no-external-runtime posture; (b) replace with `exceljs` (maintained on npm) in `reportPack.ts` — a contained refactor of one file plus a test; (c) formally accept the risk given the admin-only, generation-only surface, and document it. Recommendation: **(b) exceljs** when convenient; **(c) acceptable interim** given low real exposure. Not changed here because it touches report generation and warrants its own test pass.
2. **Production pinning (optional):** consider exact-pinning runtime deps for reproducibility; the committed lock file already delivers deterministic installs, so this is minor.

## Verification results

- [x] Every dependency verified legitimate on npm with real history.
- [x] Lock file committed.
- [x] Vulnerable paths triaged: `xlsx` admin-only/write-only; `vite` dev-only.
- [ ] `npm audit` clean — **blocked**: `xlsx` has no npm fix; requires the dependency decision above.
