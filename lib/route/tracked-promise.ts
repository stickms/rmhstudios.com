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
 * On a client navigation that render is synchronous (the router's store update),
 * so the suspension commits the Suspense fallback, and React then holds the real
 * content back until at least 300ms after that fallback appeared (its fallback
 * throttle). The result on `/`: every page switch home showed the skeleton for
 * ≥300ms, including when the hover preload had already fetched the feed — no
 * long task, no network, just a skeleton (docs/performance-audit-2026-10-21.md
 * §Navigation commit).
 *
 * This writes the same `status`/`value`/`reason` fields React itself writes
 * when it instruments a thenable, as soon as the promise settles — so by the
 * time a preloaded or cached loader value is rendered, `use` returns it in the
 * same render. Client-only: the server's copy of the promise is serialized for
 * streaming and is left exactly as it was.
 */
type Tracked<T> = Promise<T> & { status?: string; value?: T; reason?: unknown };

export function trackPromise<T>(promise: Promise<T>): Promise<T> {
  if (typeof window === 'undefined') return promise;
  const p = promise as Tracked<T>;
  // Already instrumented — by React, or by an earlier call.
  if (typeof p.status === 'string') return promise;
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
