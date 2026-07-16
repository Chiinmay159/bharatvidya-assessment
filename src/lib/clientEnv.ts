/**
 * clientEnv — detect hostile browsing environments before the exam starts.
 *
 * In-app webviews (WhatsApp, Instagram, Facebook, etc.) are a real hazard
 * for exams on iOS: non-browser WebKit apps get ~15% of disk per origin vs
 * ~60% in Safari proper (verified against WebKit docs, 2026), and their
 * storage is more aggressively evicted — so the answer buffer and cached
 * paper are both at risk. We advise (never block) opening in a real browser.
 */

const IN_APP_PATTERNS: Array<[RegExp, string]> = [
  [/WhatsApp/i, 'WhatsApp'],
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
  [/Snapchat/i, 'Snapchat'],
  [/Line\//i, 'LINE'],
  [/Twitter|X11;.*TwitterAndroid/i, 'Twitter/X'],
  [/GSA\//i, 'the Google app'],
  [/; wv\)/, 'an in-app browser'], // generic Android WebView marker
]

/** Name of the wrapping app if this looks like an in-app webview, else null. */
export function inAppBrowserName(ua: string = navigator.userAgent): string | null {
  for (const [re, name] of IN_APP_PATTERNS) {
    if (re.test(ua)) return name
  }
  return null
}
