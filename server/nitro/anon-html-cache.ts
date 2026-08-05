// Nitro startup plugin — makes ANONYMOUS, default-locale HTML edge-cacheable so
// Cloudflare can serve signed-out traffic without a full origin SSR render each
// time (perf audit §1.2 / §5.4, optimization ideas OPT-43), and keeps
// AUTHENTICATED HTML out of every shared cache without costing those visitors
// the back/forward cache (OPT-30). Registered in vite.config.ts under
// nitro({ plugins: [...] }), same mechanism as security-headers.ts.
//
// SAFETY MODEL — this plugin only sets response headers; it never caches
// anything by itself:
//   * Cloudflare does NOT cache text/html by default, so these headers are
//     INERT until the matching Cache Rule is created (deploy/apply-cloudflare-
//     cache-rules.sh). Shipping the plugin alone changes nothing observable —
//     and that script's HTML rule is currently scoped to `/`, so widening the
//     allowlist here is a no-op at the edge until the rule is widened to match.
//     The origin is still the final gate on what may be stored, so the two lists
//     failing open (edge narrower than origin) is the safe direction.
//   * It marks a response `public` (shared-cacheable) ONLY when the request is
//     unambiguously an anonymous, default-locale document GET for an allowlisted
//     path — no session cookie AND no locale-preference cookie. Everything else
//     that could be personalized is force-marked private (when authenticated) or
//     simply left untouched (origin-rendered every time).
//   * `max-age=0` keeps BROWSERS from caching it (so a user who signs in never
//     sees their own stale anon copy); only `s-maxage` (shared caches = the CF
//     edge) applies. The client's live SSE stream backfills new posts, so a few
//     seconds of edge staleness is invisible.
//
// The Cloudflare rule (see the deploy script) must ALSO bypass cache when a
// session or `rmh-lang` cookie is present and RESPECT the origin's Cache-Control
// — so the narrow gate below is what actually decides what the edge stores.
//
// KNOWN TRADEOFF (unchanged by OPT-43, but it now applies to more pages): a
// cookie-less visitor whose browser prefers a non-English language can be served
// the cached English render on first paint, because the edge cache key cannot
// vary on Accept-Language without an Enterprise custom cache key. Choosing a
// language sets `rmh-lang` and bypasses the cache thereafter. Both parties are
// anonymous, so this is a language mismatch, never a data leak.

/**
 * AUTHENTICATED HTML — never shared, never stale, still bfcache-eligible.
 *
 * This used to be `private, no-store`, which was correct about privacy and
 * catastrophic for navigation. `no-store` and `no-cache` sound like synonyms and
 * are not:
 *
 *   * `no-store` — "do not write this response to ANY storage." Chrome and
 *     Firefox additionally treat it, on a MAIN DOCUMENT response, as an opt-out
 *     of the back/forward cache: the whole live page (DOM + JS heap + scroll
 *     position) is thrown away on navigation, so every Back press by a signed-in
 *     user pays a full round trip and a full re-render. It is the single most
 *     cited bfcache disqualifier.
 *   * `no-cache` — "you may store it, but you must REVALIDATE with the origin
 *     before reusing it." Nothing is served without the origin agreeing to it.
 *
 * So `private, no-cache, max-age=0, must-revalidate` keeps every privacy
 * property the old header had:
 *   * `private` — a SHARED cache (the Cloudflare edge, any corporate proxy) is
 *     forbidden from storing the response at all. That is the property that
 *     actually protects one user's personalized shell from another user, and it
 *     is untouched.
 *   * `no-cache` + `max-age=0` — the browser's own HTTP cache may hold a copy but
 *     may never reuse it without revalidating, so a signed-out (or signed-in-as-
 *     someone-else) request can't be answered from a previous user's document.
 *   * `must-revalidate` — belt and braces: forbids serving a stale entry even if
 *     the origin is unreachable.
 *
 * What it gives back is bfcache eligibility. bfcache is not an HTTP cache: it is
 * an in-memory snapshot of the live page, scoped to one tab's session history,
 * torn down on same-tab logout navigation and never shared with another origin,
 * user, or process. Nothing here is written to disk for a shared cache to find,
 * so the exposure surface is the same one the tab already has while the page is
 * simply open in it.
 *
 * Verify with DevTools → Application → Back/forward cache → "Test back/forward
 * cache" while signed in; it must report the page was restored, and a `curl -I`
 * on an authenticated document must show this string and no `no-store`.
 */
const AUTHENTICATED_CACHE_CONTROL = 'private, no-cache, max-age=0, must-revalidate';

/**
 * Exact paths whose HTML is byte-identical for every signed-out, default-locale
 * visitor and therefore safe to share at the edge. Keep this list audited —
 * never add a path you have not read the route file for, and never add one that
 * varies per anon visitor.
 *
 * Each entry below, with the route file that justifies it:
 *
 *   `/`             app/routes/_site/index.tsx — the shared For-You feed for
 *                   anon (the origin already caches that assembly).
 *   `/games`        app/routes/_site/games/index.tsx — renders the pure
 *                   `listCuratedBuilds()` catalog with a fixed `seed={0}`; no
 *                   session read, no randomness, no loader.
 *   `/apps`         app/routes/_site/apps/index.tsx — the sibling of `/games`,
 *                   same catalog, same fixed seed.
 *   `/news`         app/routes/_site/news/index.tsx — its loader is
 *                   `getAllNewsArticles()` + `getFeaturedNewsArticles()`, both
 *                   viewer-independent (the route says so and takes no session).
 *   `/library`      app/routes/_site/library/index.tsx — five parallel loaders,
 *                   three of which DO resolve a session. Every one collapses to
 *                   the public variant when there isn't one: `listAllBooks()`
 *                   filters `hidden: false` (the admin view is a separate
 *                   `listAllBooksForAdmin()` fetched client-side),
 *                   `listCollectionsView(null)` filters `hidden: false` and
 *                   resolves no per-viewer edit rights, and `fetchPlaylists`
 *                   returns `null` outright for a signed-out visitor. This is
 *                   the entry to re-audit first if this list ever goes wrong.
 *   `/optimization` app/routes/optimization.tsx — static `OptimizationPage`.
 *   `/security`     app/routes/security.tsx — static `SecurityPage`.
 *   `/privacy`      app/routes/privacy.tsx      ┐ all four are `LegalLayout` +
 *   `/terms`        app/routes/terms.tsx        │ literal `t()` strings, no
 *   `/cookies`      app/routes/cookies.tsx      │ loader and no session.
 *   `/copyright`    app/routes/copyright.tsx    ┘
 *
 * Deliberately NOT here:
 *   `/blog`  — app/routes/_site/blog/index.tsx throws `redirect({ to:
 *              '/library' })` in `beforeLoad`. It is a 3xx with no HTML body, so
 *              the content-type gate below would skip it anyway.
 *   `/about` — no such route exists.
 *
 * Ad units are not a hazard here even though several of these pages mount one:
 * `hooks/useAdsEnabled` returns `enabled: false` on the server and on the first
 * client render by design, so an `<AdSlot>` contributes nothing to the SSR HTML.
 *
 * Exported so `lib/__tests__/anon-html-cache.test.ts` can hold every entry to a
 * real, non-redirect route file — the `/blog` trap above, caught automatically.
 */
export const CACHEABLE_ANON_PATHS = new Set<string>([
  '/',
  '/games',
  '/apps',
  '/news',
  '/library',
  '/optimization',
  '/security',
  '/privacy',
  '/terms',
  '/cookies',
  '/copyright',
]);

/**
 * Prefixes whose CONTENT pages are equally invariant. Kept separate from the
 * exact set because a prefix match is a much bigger promise: every current AND
 * FUTURE path under it must be anon-invariant, and nobody adding a route thinks
 * about this file. Only add a prefix whose entire route subtree you have read.
 *
 *   `/blog/` subtree, in full:
 *     app/routes/_site/blog/$slug.tsx     — `getPostBySlug()`, no session read;
 *                                           the only client-side fetch is
 *                                           `<ArticleTakeaways>`, which is not
 *                                           part of the SSR HTML.
 *     app/routes/blog.rss[.]xml.ts        — `/blog/rss.xml`, served as XML, so
 *                                           the text/html gate skips it.
 *
 *   `/news/` subtree, in full:
 *     app/routes/news.$slug.tsx           — `getNewsArticleBySlug()`, no session
 *                                           read anywhere in the route.
 *     app/routes/news.rss[.]xml.ts        — `/news/rss.xml`, XML, skipped.
 *
 * Deliberately NOT here: `/games/`. Its subtree (`_site/games/$gameId.tsx` and
 * `_site/games/$gameId_.guides.$guideId.tsx`) IS anon-invariant today — every
 * query takes a `viewerId` that is `null` for anon, and `listGuides`/`getGuide`
 * then return published rows only. But the pages are built out of live
 * user-generated reviews and guides rather than article content, so the long
 * article TTL below is the wrong shape for them, and `/games/$gameId/guides/new`
 * is a session-gated editor sitting inside the same prefix. Cache those only
 * with a deliberate, separately-tuned rule.
 */
export const CACHEABLE_ANON_PREFIXES: readonly string[] = ['/blog/', '/news/'];

/** Shared-cache freshness (s) — matches the anon feed assembly TTL. */
const S_MAXAGE = 30;
/** Serve-stale-while-revalidating window (s) at the shared cache. */
const SWR = 120;

/**
 * Article-type content changes on publish, not on a timer, so it gets a much
 * longer edge TTL — and a full day of `stale-while-revalidate` so a cold PoP
 * still answers instantly and refreshes in the background.
 *
 * The cost of the longer window is that publishing a post can take up to
 * `ARTICLE_S_MAXAGE` to appear for signed-out readers at an already-warm PoP;
 * a purge-by-URL on publish is the fix (OPT-43 gotcha 3), not a shorter TTL.
 */
const ARTICLE_S_MAXAGE = 300;
const ARTICLE_SWR = 86_400;

/**
 * True if the Cookie header carries a Better Auth session. Better Auth names its
 * cookies `better-auth.session_token` / `better-auth.session_data` (plus
 * `__Secure-`/`__Host-` prefixes under HTTPS), so a `session_token` /
 * `session_data` substring is a reliable "this request may be authenticated"
 * signal. When in doubt we treat the request as authenticated (never cache).
 */
function isAuthenticated(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.includes('session_token') || cookieHeader.includes('session_data');
}

/**
 * True if the visitor has an explicit locale preference cookie (`rmh-lang`).
 * These pages SSR in that locale, so a locale-preference request must NOT share
 * the default-locale edge entry.
 */
function hasLocalePreference(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.includes('rmh-lang=');
}

/**
 * The shared-cache policy for an allowlisted anonymous path, or `null` when the
 * path is not allowlisted at all. Exact matches win; prefixes are the fallback,
 * so a future exact entry can always override a prefix's TTL.
 */
export function anonCachePolicy(pathname: string): string | null {
  if (CACHEABLE_ANON_PATHS.has(pathname)) {
    return `public, max-age=0, s-maxage=${S_MAXAGE}, stale-while-revalidate=${SWR}`;
  }
  if (CACHEABLE_ANON_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return `public, max-age=0, s-maxage=${ARTICLE_S_MAXAGE}, stale-while-revalidate=${ARTICLE_SWR}`;
  }
  return null;
}

export interface CacheDecision {
  /** The `Cache-Control` value to apply. */
  value: string;
  /**
   * `true` when the value opens the response to a SHARED cache. Only a shared
   * decision defers to a policy a route already set for itself; the private one
   * always overwrites, because nothing downstream may weaken it.
   */
  shared: boolean;
}

/**
 * The full header decision for one document response, exported so the safety
 * model is testable without a Nitro app (lib/__tests__/anon-html-cache.test.ts).
 * `null` means "leave the response alone" — origin-rendered every time.
 */
export function decideCacheControl(
  pathname: string,
  cookieHeader: string | null | undefined,
): CacheDecision | null {
  // Authenticated → guarantee no shared cache ever stores this personalized
  // HTML. Defense-in-depth beneath the edge rule's cookie bypass. Checked first
  // so no allowlist entry can ever be reached with a session present.
  if (isAuthenticated(cookieHeader)) return { value: AUTHENTICATED_CACHE_CONTROL, shared: false };
  // A locale-preference anon visitor is left origin-rendered so they get their
  // language rather than the default-locale edge entry.
  if (hasLocalePreference(cookieHeader)) return null;
  const policy = anonCachePolicy(pathname);
  return policy ? { value: policy, shared: true } : null;
}

export default function anonHtmlCachePlugin(nitroApp: {
  hooks: { hook: (name: string, fn: (res: unknown, event: unknown) => void) => void };
}): void {
  nitroApp.hooks.hook('response', (res: unknown, event: unknown) => {
    try {
      const req = (event as { req?: { url?: string; method?: string; headers?: Headers } })?.req;
      const headers =
        (event as { res?: { headers?: Headers } })?.res?.headers ??
        (res as { headers?: Headers })?.headers;
      if (
        !req ||
        !headers ||
        typeof headers.set !== 'function' ||
        typeof headers.get !== 'function'
      ) {
        return;
      }

      // Only ever touch document (HTML) responses — never assets/API/JSON. This
      // is also what keeps the RSS feeds under the `/blog/` and `/news/`
      // prefixes out of the allowlist.
      const contentType = headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return;

      // Document renders are GETs; treat a missing method as GET, never cache
      // non-GET/HEAD.
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') return;

      let pathname = '';
      try {
        pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      } catch {
        return;
      }

      const cookie = req.headers?.get?.('cookie') ?? null;
      const decision = decideCacheControl(pathname, cookie);
      if (!decision) return;

      if (!decision.shared) {
        headers.set('Cache-Control', decision.value);
        return;
      }

      // Anonymous, default-locale, allowlisted path — and only if the route
      // didn't already set its own policy, which always wins.
      if (!headers.get('Cache-Control')) {
        headers.set('Cache-Control', decision.value);
        // Backstop for compliant shared caches that key on it; the edge rule's
        // cookie bypass is the primary language/identity separator.
        if (!headers.get('Vary')) headers.set('Vary', 'Accept-Language');
      }
    } catch {
      // Never let cache logic break a response.
    }
  });
}
