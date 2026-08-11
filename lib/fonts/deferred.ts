/**
 * Idle-deferred Google Fonts loading — one implementation, used by every route
 * that wants a display family without gating first paint on a third party.
 *
 * ## The problem this exists to stop
 *
 * A `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` is
 * **render-blocking**, and in two shapes that are both worse than they look:
 *
 *  * **In a component body.** React 19 hoists `<link rel="stylesheet">` into the
 *    head and *suspends rendering until it loads*. So the route paints nothing —
 *    not a fallback, nothing — until `fonts.googleapis.com` answers.
 *  * **As `@import url(...)` inside a bundled stylesheet.** The remote sheet
 *    isn't even discoverable until the parent sheet has downloaded, so it is a
 *    serial second round trip *and* render-blocking.
 *
 * Nine routes did one of those, so their first paint was gated on an origin this
 * project does not control, with no fallback. A visitor behind a blocked,
 * throttled or slow Google Fonts — corporate proxies, some content blockers,
 * mainland China — got a blank page for as long as that took. Measured on
 * 2026-08-09 with the font origin unreachable: FCP went from ~0.39 s to the
 * harness timeout on every one of them, while a control route with no font link
 * was unmoved.
 *
 * ## Why deferring is the right fix and not a downgrade
 *
 * Every one of those URLs already carried `display=swap`, i.e. the pages had
 * *already* accepted "render fallback text first, swap when the face arrives".
 * Blocking the whole document to get a font that is going to swap in anyway buys
 * nothing. This helper keeps the identical families and the identical swap
 * behaviour, and only stops the *document* from waiting — which is exactly what
 * `__root.tsx` has always done for the site-wide decorative families.
 *
 * The site's body font (Inter) is self-hosted via `@fontsource-variable/inter`
 * in `globals.css` and is unaffected by any of this — it never was a Google
 * Fonts request.
 *
 * ## Usage
 *
 * In a route's `head()`, as a script rather than a link:
 *
 * ```ts
 * head: () => ({
 *   links: [...preconnectGoogleFonts()],
 *   scripts: [{ children: deferredFontScript(GOOGLE_FONTS_URL) }],
 * })
 * ```
 *
 * The `preconnect` pair is still worth emitting: it warms DNS/TLS to both font
 * origins while the page renders, so the deferred fetch is fast when it fires.
 * A preconnect never blocks rendering.
 */

/**
 * The two origins a Google Fonts stylesheet needs (CSS, then the font files).
 *
 * The literal types matter: TanStack's `head().links` is typed as React's
 * `LinkHTMLAttributes`, whose `crossOrigin` is the union
 * `'anonymous' | 'use-credentials' | ''`, not `string`. Hence `as const`.
 */
export function preconnectGoogleFonts() {
  return [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    // `crossOrigin` is required on the gstatic preconnect: font files are
    // fetched in CORS mode, and a preconnect whose credentials mode doesn't
    // match the eventual request opens a second, unused connection.
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  ] as const;
}

/**
 * An inline script that appends `url` as a stylesheet once the browser is idle.
 *
 * Mirrors `deferredFontsScript` in `app/routes/__root.tsx` — deliberately the
 * same three lines, because this is the shape that has to stay small enough to
 * inline: it runs before hydration, so it cannot be a module.
 *
 * `requestIdleCallback` where available, a 200 ms timer otherwise (Safari still
 * lacks it). Both run after first paint, which is the entire point.
 *
 * @param url an absolute `https://fonts.googleapis.com/css2?...` URL. Keep
 *   `display=swap` on it so text renders in the fallback face immediately and
 *   swaps when the real one lands.
 */
export function deferredFontScript(url: string): string {
  // JSON.stringify, not a template hole: this string is injected into an inline
  // <script>, and a quote or a `</script>` in the URL would otherwise break out
  // of it. The URLs are all literals in this repo, so this is belt-and-braces
  // rather than a live hole — but an inline script is the wrong place to rely on
  // that staying true.
  return `(function(){var u=${JSON.stringify(url)};function l(){var k=document.createElement("link");k.rel="stylesheet";k.href=u;document.head.appendChild(k)}if("requestIdleCallback"in window)requestIdleCallback(l);else setTimeout(l,200)})()`;
}
