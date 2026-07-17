# XSS Security Report

## Status: PASS

## Findings
- **No `dangerouslySetInnerHTML`** anywhere in `src/`. React auto-escapes all interpolated content.
- The only `innerHTML` assignment is in [src/lib/supabase.ts](../../src/lib/supabase.ts): a **static** configuration-error message with no user input.
- The static `public/students.html` renders only hard-coded copy; no user content is injected.
- User-derived strings (student names, exam names on the verify page and certificates; CSV cell values) are rendered as React text nodes, not HTML.
- No `eval` / `new Function` in the codebase.

## What's at risk
Nothing today. The single `innerHTML` sink is developer-controlled and constant.

## What's already secure
React's default escaping across every user-facing string; no raw-HTML rendering path exists.

## Recommendations
If raw HTML rendering is ever introduced, route it through DOMPurify. The CSP added in SECURITY_HEADERS (`script-src 'self'`, `object-src 'none'`) is a second line of defense.

## Verification results
- [x] No `dangerouslySetInnerHTML`/`v-html` with unsanitized content
- [x] The one `innerHTML` is a static string
- [x] React autoescaping in effect throughout
