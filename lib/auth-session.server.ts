/**
 * Request-scoped session resolution.
 *
 * A single SSR render fans out to several server functions — the root loader's
 * `getInitialUser`, the feed's `fetchInitialFeed`, `getSidebarData`, a page's own
 * loader — that each independently call `auth.api.getSession`. Every call runs
 * Better Auth's session + user lookups AND the `customSession` tier resolution
 * (`getUserTier`), so the homepage alone resolved the session ~3× per render.
 *
 * The session cannot change within one request, so `getRequestSession()` memoizes
 * the in-flight promise keyed on the current request object. Client-invoked server
 * functions arrive as distinct requests (each its own HTTP call), so this scopes
 * naturally per request with no cross-request leakage. If `getRequest()` is
 * unavailable — or ever returns a non-stable object — it simply resolves again:
 * correct, just not deduped, so this is a pure optimization with no behavioral
 * risk. Pair with the short-TTL `getUserTier` cache (lib/entitlements.ts), which
 * removes the entitlement queries even on the paths this can't dedupe.
 */
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

const sessionByRequest = new WeakMap<object, Promise<SessionResult>>();

/**
 * Better Auth names its session cookies `*session_token` / `*session_data` (plus
 * `__Secure-`/`__Host-` prefixes under HTTPS — see server/nitro/anon-html-cache.ts,
 * which keys the edge cache on the same signal). A request that carries neither
 * cannot be authenticated, so we can skip Better Auth entirely for it.
 */
function hasSessionCookie(headers: Headers): boolean {
  const cookie = headers.get("cookie");
  if (!cookie) return false;
  return cookie.includes("session_token") || cookie.includes("session_data");
}

/** Resolve the current request's session once, memoized for that request. */
export function getRequestSession(): Promise<SessionResult> {
  let req: { headers: Headers } | null = null;
  try {
    req = getRequest() as unknown as { headers: Headers };
  } catch {
    req = null;
  }
  if (!req || !req.headers) return Promise.resolve(null as SessionResult);

  // Anonymous fast path (perf audit §6.4): no session cookie → definitely signed
  // out, so skip the whole Better Auth resolution — no session/user lookup, no
  // signed-cookie decode, no customSession tier resolution. This takes auth work
  // off every anonymous request, which is the common case for landing / first-visit
  // traffic (root loader + feed + sidebar all resolve the session on that path).
  // "When in doubt, resolve": any session cookie present still goes through the
  // full check below, so logged-in users are unaffected.
  if (!hasSessionCookie(req.headers)) return Promise.resolve(null as SessionResult);

  const key = req as unknown as object;
  const cached = sessionByRequest.get(key);
  if (cached) return cached;

  const pending = auth.api
    .getSession({ headers: req.headers })
    .catch(() => null) as Promise<SessionResult>;
  sessionByRequest.set(key, pending);
  return pending;
}
