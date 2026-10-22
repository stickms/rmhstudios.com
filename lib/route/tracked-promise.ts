/**
 * `trackPromise` — let `<Await>` read a deferred loader value that is already there.
 *
 * A loader that returns a promise UNAWAITED (so the page can paint before the
 * data) hands it to `<Await>`, which on React 19 is `React.use(promise)`. `use`
 * can only return synchronously from a thenable whose `status` says it settled;
 * a plain promise it has never seen has no `status`, so `use` instruments it and
 * suspends — even when the value resolved long ago, because a native promise's
 * `then` callbacks never run synchronously.
 *
 * Two places that bites, both on `/` (docs/performance-audit-2026-10-21.md):
 *
 * - **Client navigations** (§Navigation commit). The render is synchronous, so
 *   the suspension commits the Suspense fallback, and React then holds the real
 *   content back until ≥300ms after that fallback appeared (its fallback
 *   throttle) — a skeleton with no long task and no network behind it.
 * - **Hydration** (§Home LCP). The router's copy of a streamed promise is
 *   deserialized from the SSR payload, so the loader never ran on the client and
 *   nothing tracked it. Hydrating `<Await>` suspended on it, which left the
 *   server-rendered boundary dehydrated; the next update to reach it (the root's
 *   session and store hydration land a moment later) made React give up on the
 *   server HTML and client-render the boundary from its fallback — the whole
 *   first feed deleted, a skeleton, and a fresh copy, seconds after first paint.
 *
 * This writes the same `status`/`value`/`reason` fields React itself writes
 * when it instruments a thenable. A promise deserialized by seroval (the SSR
 * serializer under TanStack Start) already records its own settlement
 * synchronously — `s` is 1 (fulfilled) or 2 (rejected) and `v` holds the value —
 * so that is translated in the same call, before React ever reads it; any other
 * promise is marked as soon as it settles. Client-only: the server's promise is
 * serialized for streaming and is left exactly as it was. Idempotent.
 */
type Tracked<T> = Promise<T> & {
  status?: string;
  value?: T;
  reason?: unknown;
  /** seroval's settlement marker on a deserialized promise: 1 fulfilled, 2 rejected. */
  s?: unknown;
  /** seroval's settled value (or rejection reason). */
  v?: unknown;
};

export function trackPromise<T>(promise: Promise<T>): Promise<T> {
  if (typeof window === 'undefined') return promise;
  const p = promise as Tracked<T>;
  // Already instrumented — by React, or by an earlier call.
  if (typeof p.status === 'string') return promise;
  if (p.s === 1 && 'v' in p) {
    p.status = 'fulfilled';
    p.value = p.v as T;
    return promise;
  }
  if (p.s === 2 && 'v' in p) {
    p.status = 'rejected';
    p.reason = p.v;
    return promise;
  }
  p.status = 'pending';
  p.then(
    (value) => {
      p.status = 'fulfilled';
      p.value = value;
    },
    (reason: unknown) => {
      p.status = 'rejected';
      p.reason = reason;
    },
  );
  return promise;
}
