# FILE_UPLOADS Security Report

## Status: N/A (no server-side file storage; client-side CSV parsing only)

## Findings
There are three `<input type="file" accept=".csv">` controls — [QuestionUpload](../../src/components/admin/QuestionUpload.jsx), [RosterUpload](../../src/components/admin/RosterUpload.jsx), [BulkBatchCreate](../../src/components/admin/BulkBatchCreate.jsx). Crucially, **no file is uploaded to or stored on a server/bucket.** Each file is read in the admin's browser, parsed with PapaParse, and the resulting **rows** are sent as structured data through admin-gated RPCs (`replace_questions`, `replace_roster`) or batch-create logic. There is no object storage, no server-side file naming, no served user files.

So the classic upload risks (magic-byte validation, UUID renaming, separate-domain storage, executable content served back) do not apply — there is no stored/served file. The relevant residual is **CSV content handling**, which is covered: exports are sanitized against spreadsheet formula injection (`sanitizeCell` in [src/lib/csv.ts](../../src/lib/csv.ts)), and imports become typed row data validated by the RPCs, not executable content.

## What's at risk
Minimal. A malformed CSV yields a parse error or rejected rows in the admin's own session, not code execution or a stored malicious file.

## What's already secure
No file storage surface; admin-only, gated import RPCs; formula-injection sanitization on CSV export.

## Recommendations
If server-side file storage (e.g., logo uploads to a bucket) is ever added: validate by magic bytes, rename to UUIDs, store on a separate origin, enforce size limits server-side. Optionally cap client CSV size before parse to avoid a large-file tab hang.

## Verification results
- [x] No server-side file upload/storage exists (marked N/A with reason)
- [x] CSV import flows through admin-gated, typed RPCs
- [x] CSV export sanitized against formula injection
