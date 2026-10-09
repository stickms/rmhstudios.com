/**
 * The cookie notice's pre-paint contract — shared by the notice
 * (`components/site/CookieConsent.tsx`) and the document head
 * (`app/routes/__root.tsx`), so the key, the class and the script can't drift.
 *
 * ## Why the notice is server-rendered and hidden by a script
 *
 * Consent lives in `localStorage`, which the server can't read, so the notice
 * used to mount after hydration — from a lazy chunk, behind an effect. On a
 * first visit (and every lab run is a first visit) that late paint was the
 * page's **Largest Contentful Paint**: Lighthouse measured `/` at 9.4s LCP on
 * simulated mobile against a 6.0s FCP, and named the notice's paragraph as the
 * element (perf audit 2026-10-08).
 *
 * The server can't render it *conditionally* either: anonymous HTML is cached
 * and shared (CDN `s-maxage`), so it must not vary per visitor. So the notice
 * is in every server-rendered `_site` page, identical for everyone, and this
 * script — run in `<head>` before first paint, like the theme/locale scripts —
 * stamps `html.cookie-consented` for a visitor who has already answered. CSS
 * keeps the notice (and the floating-stack lift it causes) out of their first
 * frame; hydration then unmounts it. A first-time visitor sees it in the very
 * first paint instead of seconds later.
 */
export const COOKIE_CONSENT_STORAGE_KEY = 'rmh-cookie-consent';
export const COOKIE_CONSENTED_CLASS = 'cookie-consented';

export const COOKIE_CONSENT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(
  COOKIE_CONSENT_STORAGE_KEY,
)});if(v==="all"||v==="essential")document.documentElement.classList.add(${JSON.stringify(
  COOKIE_CONSENTED_CLASS,
)})}catch(e){}})()`;
