'use client';

import type { AnyRouter } from '@tanstack/react-router';

/**
 * OPT-33 — viewport prefetch for the first on-screen links, connection-aware.
 *
 * `app/router.tsx` sets `defaultPreload: 'intent'`, which warms a route on
 * hover/focus. A phone has neither: the first signal a touch device produces is
 * the tap itself, by which point the navigation has already started. So intent
 * preloading — the site's entire prefetch strategy — is inert for mobile users.
 * This is the touch-device counterpart: warm the routes the user is *looking
 * at*, cheaply, and stop early.
 *
 * "Cheaply" is the whole design. Prefetching what is on screen is only a win
 * while it stays small, so four independent brakes apply, each for a different
 * reason (see `shouldSpeculate`, `MAX_PREFETCH`, `DWELL_MS`, and the `load`
 * gate in `startViewportPrefetch`). Remove any one of them and this becomes a
 * bandwidth regression on exactly the devices it is meant to help.
 */

/**
 * Hard cap on speculative prefetches per page view.
 *
 * A scrolled feed has hundreds of links on screen; prefetching all of them is
 * worse than prefetching none, because every one competes with the content the
 * user is currently reading and with the navigation they eventually pick. Four
 * covers "the first few posts", which is where the click actually lands.
 */
const MAX_PREFETCH = 4;

/**
 * How long a link must stay on screen before it counts as "looked at".
 *
 * Without this, flicking through a feed fires a prefetch for every link that
 * crosses the viewport — the touch equivalent of preloading on `mousemove`.
 * 200 ms is long enough that a fast scroll past costs nothing and short enough
 * that a link the user has stopped on is warm before they can reach it.
 */
const DWELL_MS = 200;

/**
 * Upper bound on how many anchors we hand to the IntersectionObserver.
 *
 * Observing every `<a>` on a long feed page is a real cost (element bookkeeping
 * on every scroll) for no benefit — we stop after `MAX_PREFETCH` hits anyway,
 * and those come from the top of the document. Bounding the scan keeps the
 * setup O(1)-ish regardless of page length.
 */
const SCAN_LIMIT = 40;

/**
 * How long to wait after a client-side navigation resolves before re-scanning.
 * The router's `onResolved` fires before React commits the new page, so an
 * immediate re-scan would observe the outgoing document's links.
 */
const REARM_DELAY_MS = 100;

/**
 * Paths that must never be speculatively fetched, mirroring the `where.not`
 * list in OPT-04's speculation rules:
 *   - `/api/*`   — data endpoints, not routes; some GETs write.
 *   - `/login`, `/logout` — session transitions; a prefetch is a side effect.
 *   - `/checkout` — money.
 *   - `/admin/*`  — expensive to render and never the "next post" a reader taps.
 */
const NEVER_PREFETCH = [/^\/api(\/|$)/, /^\/login/, /^\/logout/, /^\/checkout/, /^\/admin(\/|$)/];

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

function getConnection(): NetworkInformation | undefined {
  const nav = (globalThis as { navigator?: Navigator & { connection?: NetworkInformation } })
    .navigator;
  return nav?.connection;
}

/**
 * `@media (prefers-reduced-data: reduce)` — the CSS-level expression of the same
 * intent as Save-Data, exposed by browsers that dropped the `Save-Data` header.
 * A browser that doesn't know the feature evaluates the query to `not all`, so
 * an unknown feature reads as `false` (= no preference), which is correct.
 */
function prefersReducedData(): boolean {
  const mm = (globalThis as { matchMedia?: (query: string) => { matches: boolean } }).matchMedia;
  if (typeof mm !== 'function') return false;
  try {
    return mm.call(globalThis, '(prefers-reduced-data: reduce)').matches === true;
  } catch {
    return false;
  }
}

/**
 * Has the user (or their OS/browser) asked us to use less data?
 *
 * This is the *user-preference* half of the policy and is deliberately separate
 * from `shouldSpeculate`'s network-quality half: an explicit "use less data"
 * must suppress every speculative fetch we make, including the media warming in
 * `hooks/useIntentPreload`, which fires on a much stronger signal (a real
 * hover) and is otherwise happy to run on a slow connection.
 */
export function prefersLessData(): boolean {
  return getConnection()?.saveData === true || prefersReducedData();
}

/**
 * Is speculative prefetching appropriate right now?
 *
 * Three guards, each for a different failure:
 *  - `saveData` / `prefers-reduced-data` — the user explicitly asked for less
 *    data. Speculation is the first thing that should go.
 *  - `effectiveType` — on 2g/slow-2g/3g a speculative request does not arrive
 *    "for free"; it queues ahead of the content the user is actually looking at
 *    and makes the current page slower to win a navigation that may not happen.
 *  - a missing `navigator.connection` (Safari, Firefox) means "no signal", which
 *    must read as *yes*, not as a crash and not as a blanket opt-out — those
 *    browsers are a large share of the mobile traffic this exists for.
 */
export function shouldSpeculate(): boolean {
  const connection = getConnection();
  if (!connection) return !prefersReducedData();
  if (connection.saveData === true) return false;
  if (prefersReducedData()) return false;
  // `effectiveType` is absent on some implementations even when `connection`
  // exists; absent is "unknown", which follows the same assume-yes rule.
  return connection.effectiveType === undefined || connection.effectiveType === '4g';
}

/**
 * Resolve an anchor to a route path we are allowed to prefetch, or `null`.
 *
 * Deliberately conservative — a prefetch of the wrong URL is a wasted download
 * plus origin CPU, so anything ambiguous is skipped rather than guessed:
 *  - only root-relative in-app paths (`/foo`), never `//host` or absolute URLs;
 *  - never a query string: the router takes `to` as a *path* and derives search
 *    separately, so `?tab=x` would have to be parsed with the router's own
 *    search parser to warm the right loader deps. Warming the wrong deps is
 *    worse than warming nothing;
 *  - never a file (`/robots.txt`, `/sitemap.xml`) — not a route;
 *  - never a link the author opted out of, opened elsewhere, or marked
 *    `nofollow`/`download`.
 */
export function prefetchTarget(el: Element, currentPathname: string): string | null {
  if (el.hasAttribute('download')) return null;
  if (el.hasAttribute('data-no-prefetch') || el.hasAttribute('data-no-speculate')) return null;

  const target = el.getAttribute('target');
  if (target && target !== '_self') return null;

  const rel = el.getAttribute('rel');
  if (rel && rel.split(/\s+/).includes('nofollow')) return null;

  const href = el.getAttribute('href');
  if (!href || href[0] !== '/' || href[1] === '/') return null;

  const path = href.split('#')[0];
  if (!path || path.includes('?')) return null;
  if (path === currentPathname) return null;
  if (NEVER_PREFETCH.some((pattern) => pattern.test(path))) return null;

  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) return null;

  return path;
}

export interface ViewportPrefetchOptions {
  /** Hard cap on prefetches per page view. Defaults to {@link MAX_PREFETCH}. */
  max?: number;
  /** Dwell time before an on-screen link counts. Defaults to {@link DWELL_MS}. */
  dwellMs?: number;
  /** How many anchors to observe. Defaults to {@link SCAN_LIMIT}. */
  scanLimit?: number;
}

/** The slice of the router this needs — kept narrow so tests can stub it. */
export type PrefetchRouter = Pick<AnyRouter, 'preloadRoute' | 'subscribe'>;

/**
 * Start observing on-screen links and warming their routes. Returns a `stop()`.
 *
 * No-ops (returning a no-op `stop()`) on the server, without an
 * `IntersectionObserver`, and whenever {@link shouldSpeculate} says no.
 */
export function startViewportPrefetch(
  router: PrefetchRouter,
  options: ViewportPrefetchOptions = {},
): () => void {
  const noop = () => {};

  if (typeof document === 'undefined' || typeof window === 'undefined') return noop;
  if (typeof IntersectionObserver === 'undefined') return noop;
  if (!shouldSpeculate()) return noop;

  const max = options.max ?? MAX_PREFETCH;
  const dwellMs = options.dwellMs ?? DWELL_MS;
  const scanLimit = options.scanLimit ?? SCAN_LIMIT;

  // Deduped for the page's lifetime, not per page view: a link that appears in
  // the nav on every page must not be re-warmed on every page.
  const prefetched = new Set<string>();
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();
  let observer: IntersectionObserver | null = null;
  let budget = max;
  let stopped = false;

  function disarm() {
    observer?.disconnect();
    observer = null;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  }

  function commit(el: Element) {
    timers.delete(el);
    if (stopped || budget <= 0) return;

    const to = prefetchTarget(el, window.location.pathname);
    observer?.unobserve(el);
    if (to === null || prefetched.has(to)) return;

    prefetched.add(to);
    budget -= 1;
    // `preloadRoute` warms both the loader data and — via the route's lazy
    // component `.preload()` — the route's JS chunk. Failures are expected
    // (a 404, an auth redirect) and must stay silent: this is speculative.
    try {
      void Promise.resolve(router.preloadRoute({ to })).catch(() => {});
    } catch {
      /* a synchronous throw from route matching is not the user's problem */
    }

    if (budget <= 0) disarm();
  }

  function onIntersect(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      const el = entry.target;
      if (!entry.isIntersecting) {
        const timer = timers.get(el);
        if (timer !== undefined) {
          clearTimeout(timer);
          timers.delete(el);
        }
        continue;
      }
      if (timers.has(el)) continue;
      timers.set(
        el,
        setTimeout(() => commit(el), dwellMs),
      );
    }
  }

  function arm() {
    if (stopped) return;
    disarm();
    budget = max;
    observer = new IntersectionObserver(onIntersect, { rootMargin: '0px' });
    const anchors = document.querySelectorAll('a[href]');
    const limit = Math.min(anchors.length, scanLimit);
    for (let i = 0; i < limit; i += 1) observer.observe(anchors[i]);
  }

  // Never before `load`. A speculative fetch started during the initial load
  // competes with the LCP image for the same connection — it would make the
  // page the user is looking at slower in order to speed up one they might
  // never visit.
  let removeLoadListener = noop;
  if (document.readyState === 'complete') {
    arm();
  } else {
    const onLoad = () => arm();
    window.addEventListener('load', onLoad, { once: true });
    removeLoadListener = () => window.removeEventListener('load', onLoad);
  }

  // Re-arm after a client-side navigation, with a fresh budget: without this
  // the feature only ever helps the landing page, and the landing page is the
  // one place a touch user is least likely to still be.
  //
  // `onResolved` fires before React has committed the new page, so re-scanning
  // synchronously would observe the OUTGOING document's links. The short delay
  // lets the new DOM land and — combined with the dwell — keeps the first
  // speculative byte at least `REARM_DELAY_MS + dwellMs` after the navigation,
  // well clear of the arriving page's own render work.
  let unsubscribe = noop;
  let rearmTimer: ReturnType<typeof setTimeout> | null = null;
  if (typeof router.subscribe === 'function') {
    unsubscribe = router.subscribe('onResolved', () => {
      if (stopped) return;
      if (rearmTimer !== null) clearTimeout(rearmTimer);
      rearmTimer = setTimeout(() => {
        rearmTimer = null;
        if (!stopped) arm();
      }, REARM_DELAY_MS);
    });
  }

  return () => {
    stopped = true;
    disarm();
    removeLoadListener();
    unsubscribe();
    if (rearmTimer !== null) clearTimeout(rearmTimer);
  };
}
