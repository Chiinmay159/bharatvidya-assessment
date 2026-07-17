# SECURITY_HEADERS Security Report

## Status: FIXED (was HIGH)

## Findings

Before this audit, [vercel.json](../../vercel.json) contained only a SPA rewrite and **no `headers` block**. The application therefore shipped with none of the five baseline security headers on any response:

- No `Content-Security-Policy`
- No `Strict-Transport-Security`
- No `X-Frame-Options`
- No `X-Content-Type-Options`
- No `Referrer-Policy`

This is the highest-impact gap the audit found. The app is a static SPA served by Vercel, so headers are set once at the edge for every response — there was simply no configuration doing it.

## What's at risk

- **Clickjacking**: with no `X-Frame-Options`/`frame-ancestors`, the exam or admin portal could be embedded in a hostile iframe and overlaid to trick an authenticated admin into clicking destructive controls.
- **MIME sniffing**: without `nosniff`, a file served with the wrong content type could be interpreted as executable script.
- **Protocol downgrade**: without HSTS, a first-visit man-in-the-middle on a hostile network (exactly the low-trust connectivity this platform targets) could strip TLS.
- **Injected script / exfiltration**: without CSP, any XSS foothold (none found today, but defense-in-depth) could load remote scripts or beacon data to an attacker origin.

## What's already secure

- The app has **no inline executable scripts** — the built `index.html` contains only an external module bundle and a non-executed `application/ld+json` block, so a strict `script-src 'self'` does not break it (verified against `dist/index.html`).
- All runtime network egress is to a small, known set of origins (Supabase REST/Realtime, Google Fonts, optional Sentry), which makes a tight `connect-src` feasible without breakage.

## Recommendations (implemented)

Added a `headers` block to [vercel.json](../../vercel.json) applying to `/(.*)`:

- **Content-Security-Policy** — `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` (`'unsafe-inline'` is required by the app's pervasive inline styles); `font-src 'self' https://fonts.gstatic.com data:`; `img-src 'self' data: blob:`; `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io …`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; `object-src 'none'`; `upgrade-insecure-requests`.
- **Strict-Transport-Security** — `max-age=31536000; includeSubDomains` (no `preload` — deliberately reversible).
- **X-Frame-Options** — `DENY`.
- **X-Content-Type-Options** — `nosniff`.
- **Referrer-Policy** — `strict-origin-when-cross-origin`.
- **Permissions-Policy** — `camera=(), microphone=(), geolocation=(), payment=()` (the platform does no video proctoring, so these are all denied).

## Verification results

- [x] All five (six with Permissions-Policy) headers configured via a single global `headers` entry, not per-route.
- [x] CSP validated against built output: no inline executable script, every runtime origin allowlisted, inline styles permitted.
- [ ] **Owed (post-deploy):** `curl -sI https://exams.matramedia.co.in | grep -iE 'content-security|strict-transport|x-frame|x-content-type|referrer|permissions'` returns all headers, and the deployed app shows zero CSP violations in the browser console across landing / exam entry / verify / check.
