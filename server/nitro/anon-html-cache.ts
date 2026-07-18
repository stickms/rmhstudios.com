// Nitro startup plugin — makes the ANONYMOUS homepage HTML edge-cacheable so
// Cloudflare can serve signed-out landing traffic without a full origin SSR
// render each time (perf audit §1.2 / §5.4). Registered in vite.config.ts under
// nitro({ plugins: [...] }), same mechanism as security-headers.ts.
//
// SAFETY MODEL — this plugin only sets response headers; it never caches
// anything by itself:
//   * Cloudflare does NOT cache text/html by default, so these headers are
//     INERT until the matching Cache Rule is created (deploy/apply-cloudflare-
//     cache-rules.sh). Shipping the plugin alone changes nothing observable.
//   * It marks a response `public` (shared-cacheable) ONLY when the request is
//     unambiguously an anonymous, default-locale document GET for an allowlisted
//     path — no session cookie AND no locale-preference cookie. Everything else
//     that could be personalized is force-marked `private, no-store` (when
//     authenticated) or simply left untouched (origin-rendered every time).
//   * `max-age=0` keeps BROWSERS from caching it (so a user who signs in never
//     sees their own stale anon copy); only `s-maxage` (shared caches = the CF
//     edge) applies. The client's live SSE stream backfills new posts, so a few
//     seconds of edge staleness is invisible.
//
// The Cloudflare rule (see the deploy script) must ALSO bypass cache when a
// session or `rmh-lang` cookie is present and RESPECT the origin's Cache-Control
// — so the narrow gate below is what actually decides what the edge stores.

/**
 * Paths whose HTML is byte-identical for every signed-out, default-locale
 * visitor and therefore safe to share at the edge. `/` renders the shared
 * For-You feed for anon (the origin already caches that assembly). Keep this
 * list tiny and audited — never add a path that varies per anon visitor.
 */
const CACHEABLE_ANON_PATHS = new Set<string>(["/"]);

/** Shared-cache freshness (s) — matches the anon feed assembly TTL. */
const S_MAXAGE = 30;
/** Serve-stale-while-revalidating window (s) at the shared cache. */
const SWR = 120;

/**
 * True if the Cookie header carries a Better Auth session. Better Auth names its
 * cookies `better-auth.session_token` / `better-auth.session_data` (plus
 * `__Secure-`/`__Host-` prefixes under HTTPS), so a `session_token` /
 * `session_data` substring is a reliable "this request may be authenticated"
 * signal. When in doubt we treat the request as authenticated (never cache).
 */
function isAuthenticated(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.includes("session_token") || cookieHeader.includes("session_data");
}

/**
 * True if the visitor has an explicit locale preference cookie (`rmh-lang`).
 * The homepage SSRs in that locale, so a locale-preference request must NOT
 * share the default-locale edge entry.
 */
function hasLocalePreference(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.includes("rmh-lang=");
}

export default function anonHtmlCachePlugin(nitroApp: {
  hooks: { hook: (name: string, fn: (res: unknown, event: unknown) => void) => void };
}): void {
  nitroApp.hooks.hook("response", (res: unknown, event: unknown) => {
    try {
      const req = (event as { req?: { url?: string; method?: string; headers?: Headers } })?.req;
      const headers =
        (event as { res?: { headers?: Headers } })?.res?.headers ??
        (res as { headers?: Headers })?.headers;
      if (
        !req ||
        !headers ||
        typeof headers.set !== "function" ||
        typeof headers.get !== "function"
      ) {
        return;
      }

      // Only ever touch document (HTML) responses — never assets/API/JSON.
      const contentType = headers.get("content-type") || "";
      if (!contentType.includes("text/html")) return;

      // Document renders are GETs; treat a missing method as GET, never cache
      // non-GET/HEAD.
      const method = (req.method || "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") return;

      let pathname = "";
      try {
        pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      } catch {
        return;
      }

      const cookie = req.headers?.get?.("cookie") ?? null;

      // Authenticated → guarantee no shared cache ever stores this personalized
      // HTML. Defense-in-depth beneath the edge rule's cookie bypass.
      if (isAuthenticated(cookie)) {
        headers.set("Cache-Control", "private, no-store");
        return;
      }

      // Anonymous, default-locale, allowlisted path, and the route didn't set
      // its own policy → let the shared edge cache store it. A locale-preference
      // anon visitor is left origin-rendered so they get their language.
      if (
        CACHEABLE_ANON_PATHS.has(pathname) &&
        !hasLocalePreference(cookie) &&
        !headers.get("Cache-Control")
      ) {
        headers.set(
          "Cache-Control",
          `public, max-age=0, s-maxage=${S_MAXAGE}, stale-while-revalidate=${SWR}`,
        );
        // Backstop for compliant shared caches that key on it; the edge rule's
        // cookie bypass is the primary language/identity separator.
        if (!headers.get("Vary")) headers.set("Vary", "Accept-Language");
      }
    } catch {
      // Never let cache logic break a response.
    }
  });
}
