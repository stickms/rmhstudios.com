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

/** Resolve the current request's session once, memoized for that request. */
export function getRequestSession(): Promise<SessionResult> {
  let req: { headers: Headers } | null = null;
  try {
    req = getRequest() as unknown as { headers: Headers };
  } catch {
    req = null;
  }
  if (!req || !req.headers) return Promise.resolve(null as SessionResult);

  const key = req as unknown as object;
  const cached = sessionByRequest.get(key);
  if (cached) return cached;

  const pending = auth.api
    .getSession({ headers: req.headers })
    .catch(() => null) as Promise<SessionResult>;
  sessionByRequest.set(key, pending);
  return pending;
}
