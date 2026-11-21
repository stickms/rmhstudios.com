import type { AnyRouter } from '@tanstack/react-router';
import { shouldSpeculate } from '@/lib/network-quality';
import { prefetchTarget } from '@/lib/viewport-prefetch';

/**
 * Predictive link prefetch, built on ForesightJS (https://foresightjs.com).
 *
 * The router's `defaultPreload: 'intent'` (app/router.tsx) warms a route once a
 * hover or focus has lasted 50 ms. ForesightJS starts earlier: it extrapolates
 * the pointer's path (`trajectoryPredictionTime`), counts Tab stops towards a
 * link, follows the scroll direction, and on touch devices fires on
 * `touchstart`, roughly 100 ms before the click. Each prediction calls the same
 * `router.preloadRoute`, so the router's cache and in-flight dedupe still apply
 * and a hover after a prediction costs nothing.
 *
 * It does not replace either existing mechanism:
 *   - intent preload still covers links this module did not register;
 *   - `lib/viewport-prefetch.ts` still warms the first few on-screen links on
 *     touch devices, before any input happens at all.
 *
 * Steel B3 names this module as the one allowed exception (plan section 13):
 * ForesightJS keeps a `MutationObserver` on the document and tracks link
 * positions with IntersectionObserver/ResizeObserver. Its only animation frame
 * is scheduled from `pointermove`, so nothing is pending at rest (R5,
 * `testing/e2e/steel-rest.mjs`).
 *
 * Cost control, in the same spirit as OPT-33:
 *   - the library is a separate chunk loaded at idle after `load`, so the
 *     critical path (B5, scripts/check-bundle-budget.ts) only carries this file;
 *   - nothing starts when {@link shouldSpeculate} says no (Save-Data, 2G);
 *   - only links `prefetchTarget` accepts are registered (no `/api`, `/login`,
 *     `/checkout`, query strings, files, `data-no-prefetch` …);
 *   - at most {@link MAX_REGISTERED} links are tracked at once.
 */

/** The slice of the router this needs, kept narrow so tests can stub it. */
export type ForesightRouter = Pick<AnyRouter, 'preloadRoute' | 'subscribe'>;

/** The slice of `ForesightManager` this uses, so tests can stub the library. */
export interface ForesightManagerLike {
  register(options: {
    element: HTMLElement;
    callback: () => void | Promise<void>;
    name?: string;
    reactivateAfter?: number;
    hitSlop?: number;
  }): {
    unregister: () => void;
  };
}

export type LoadForesight = () => Promise<ForesightManagerLike>;

/**
 * How many links are tracked at once. A long feed has hundreds of anchors, and
 * each tracked one is an IntersectionObserver target. The ones near the top
 * (navigation, the first posts) are where the pointer actually goes.
 */
export const MAX_REGISTERED = 200;

/**
 * Same as the router's `defaultPreloadStaleTime`: a link can predict again once
 * the data it warmed has gone stale, and not before.
 */
export const REACTIVATE_AFTER_MS = 30_000;

/**
 * Fitts's law (Paul Fitts, 1954): the time to reach a target grows with its
 * distance and shrinks with its width. A small text link is a narrow target, so
 * the pointer's approach is slow and late. Widening the *prediction* target by a
 * few pixels on every side (not the visible link) lets a trajectory that is
 * heading for the link count as a hit a little earlier. 8px is about half a
 * line of `t-body` text: wide enough to help a 14px link, narrow enough that
 * two stacked links do not both fire.
 */
export const HIT_SLOP_PX = 8;

/**
 * After a client-side navigation, wait for the new page to commit and settle
 * before scanning it. `onResolved` fires before React commits (see
 * `REARM_DELAY_MS` in lib/viewport-prefetch.ts for the measurement).
 */
export const RESCAN_DELAY_MS = 1200;

/**
 * Links added after the scan (a feed loading more rows) are picked up on the
 * next scroll or pointer move, at most once per this interval. Input-driven on
 * purpose: no observer or timer runs to find them (R5).
 */
export const INPUT_RESCAN_INTERVAL_MS = 1000;

/** Loads the library and configures its one global manager. */
const loadForesight: LoadForesight = async () => {
  const { ForesightManager } = await import('js.foresight');
  return ForesightManager.initialize({
    touchDeviceStrategy: 'onTouchStart',
  });
};

function atIdle(fn: () => void): void {
  const idle = (
    window as {
      requestIdleCallback?: Window['requestIdleCallback'];
    }
  ).requestIdleCallback;
  if (idle)
    idle.call(window, fn, {
      timeout: 2000,
    });
  else setTimeout(fn, 200);
}

/**
 * Start predictive prefetching. Returns a `stop()` that unregisters every link
 * and removes every listener this module added.
 *
 * No-ops on the server and whenever {@link shouldSpeculate} says no.
 */
export function startForesightPrefetch(router: ForesightRouter, load: LoadForesight = loadForesight): () => void {
  const noop = () => {};
  if (typeof document === 'undefined' || typeof window === 'undefined') return noop;
  if (!shouldSpeculate()) return noop;

  let stopped = false;
  let manager: ForesightManagerLike | null = null;
  const registered = new Map<HTMLAnchorElement, () => void>();
  let lastScan = 0;
  let rescanTimer: ReturnType<typeof setTimeout> | null = null;

  function preload(el: HTMLAnchorElement) {
    // Re-checked at fire time: the page may have changed since registration.
    const to = prefetchTarget(el, window.location.pathname);
    if (to === null) return;
    try {
      // Speculative: a 404 or an auth redirect is expected and stays silent.
      void Promise.resolve(
        router.preloadRoute({
          to,
        }),
      ).catch(() => {});
    } catch {
      /* a synchronous throw from route matching is not the user's problem */
    }
  }

  function scan() {
    if (stopped || manager === null) return;
    lastScan = Date.now();

    // Drop links the last page left behind. ForesightJS parks a detached
    // element instead of forgetting it, so without this a long session would
    // keep every page's links alive.
    for (const [el, unregister] of registered) {
      if (!el.isConnected || prefetchTarget(el, window.location.pathname) === null) {
        unregister();
        registered.delete(el);
      }
    }

    const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href]');
    for (let i = 0; i < anchors.length && registered.size < MAX_REGISTERED; i += 1) {
      const el = anchors[i];
      if (!el || registered.has(el)) continue;
      if (prefetchTarget(el, window.location.pathname) === null) continue;
      try {
        const result = manager.register({
          element: el,
          callback: () => preload(el),
          reactivateAfter: REACTIVATE_AFTER_MS,
          hitSlop: HIT_SLOP_PX,
        });
        registered.set(el, result.unregister);
      } catch {
        /* an element the library refuses is simply not predicted */
      }
    }
  }

  function onInput() {
    if (Date.now() - lastScan >= INPUT_RESCAN_INTERVAL_MS) scan();
  }

  function start() {
    atIdle(() => {
      if (stopped) return;
      load()
        .then((m) => {
          if (stopped) return;
          manager = m;
          scan();
          window.addEventListener('scroll', onInput, {
            passive: true,
          });
          window.addEventListener('pointermove', onInput, {
            passive: true,
          });
        })
        .catch(() => {
          /* the chunk failed to load: intent preload still works */
        });
    });
  }

  // Never before `load`: the library chunk and the first predictions must not
  // compete with the landing page's own resources (same rule as OPT-33).
  let removeLoadListener = noop;
  if (document.readyState === 'complete') {
    start();
  } else {
    const onLoad = () => start();
    window.addEventListener('load', onLoad, {
      once: true,
    });
    removeLoadListener = () => window.removeEventListener('load', onLoad);
  }

  let unsubscribe: () => void = noop;
  if (typeof router.subscribe === 'function') {
    unsubscribe = router.subscribe('onResolved', () => {
      if (stopped) return;
      if (rescanTimer !== null) clearTimeout(rescanTimer);
      rescanTimer = setTimeout(() => {
        rescanTimer = null;
        scan();
      }, RESCAN_DELAY_MS);
    });
  }

  return () => {
    stopped = true;
    removeLoadListener();
    unsubscribe();
    if (rescanTimer !== null) clearTimeout(rescanTimer);
    window.removeEventListener('scroll', onInput);
    window.removeEventListener('pointermove', onInput);
    for (const unregister of registered.values()) unregister();
    registered.clear();
  };
}
