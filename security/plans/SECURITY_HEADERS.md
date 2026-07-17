# SECURITY_HEADERS Fix Plan

## Changes
- `vercel.json` — add a `headers` block on `/(.*)` setting Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. **DONE.**

## New files
None.

## Verification goals
After deploy, ALL must be true:
- [x] Six headers configured via a single global `headers` entry
- [x] CSP allows every runtime origin (Supabase https+wss, Google Fonts, Sentry) and inline styles; blocks framing, objects, foreign scripts
- [x] Built `index.html` has no inline executable script that `script-src 'self'` would break
- [ ] `curl -sI https://exams.matramedia.co.in` shows all six headers on the response
- [ ] Deployed app: zero CSP violations in console across landing / exam entry / verify / check

## Manual verification (for the human)
- After Vercel deploys, load the site and open DevTools console; confirm no `Refused to … because it violates the Content Security Policy` errors while navigating landing → exam entry → verify → device check.
- Optionally run the URL through securityheaders.com for an external grade.
