# SSRF Security Report

## Status: N/A

## Findings
The application fetches **no user-supplied URLs**. There is no link-preview, image-proxy, URL-import, webhook-tester, or "fetch this URL" feature. All outbound requests go to fixed, code-constant endpoints: Supabase (from `VITE_SUPABASE_URL`), Google Fonts, optional Sentry, and — server-side only — Resend's API from the `email-results` edge function (a hard-coded `https://api.resend.com` host, no user input in the URL).

## What's at risk
Nothing — there is no user-controlled request target to abuse.

## What's already secure
No dynamic-URL fetch surface exists.

## Recommendations
If an import-from-URL or webhook feature is ever added, validate scheme (http/https only), resolve the hostname, and block private ranges (127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1) before requesting.

## Verification results
- [x] No user-supplied URL fetching exists (marked N/A with reason)
