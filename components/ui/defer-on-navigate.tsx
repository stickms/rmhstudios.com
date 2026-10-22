'use client';

import { startTransition, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

/**
 * Paint the top of a page first, the rest a moment later — on page switches only.
 *
 * A client navigation mounts the whole incoming page in ONE synchronous React
 * commit: the router publishes its new matches through `useSyncExternalStore`,
 * and an external-store update can never be a time-sliced transition. So a hub
 * page with a catalog, a storefront and an Arcade Pass panel under the fold was
 * rendered, inserted, styled and laid out in full before the first pixel of it
 * could paint — 600ms+ of one long task on a 4×-throttled CPU for `/games`
 * (docs/ui-perf-audit-2026-10-09.md, NAV-5). The click felt dead for that long.
 *
 * Wrapping the below-the-fold part of such a page in this component splits that
 * commit in two. On a page switch the wrapped subtree first renders as an empty
 * block of `minHeight`, the page above it paints, and the subtree is then
 * rendered inside `startTransition` — which React DOES time-slice, yielding to
 * the browser every few milliseconds, so input and the entrance animation keep
 * running while it builds.
 *
 * Never deferred:
 *  - **During SSR and hydration.** The server HTML must match the first client
 *    render, and a first load already paints from that HTML — there is nothing
 *    to win and a hydration mismatch to lose. `markDocumentHydrated()` (called
 *    once from the root route after hydration commits) is what flips this.
 *  - **On back/forward.** Scroll restoration puts the reader back at a saved
 *    offset that is usually INSIDE the deferred part; that offset has to exist
 *    when it is applied. This reads the router history's own record of the last
 *    navigation (`trackHistoryActions`, subscribed from the root route).
 *
 *    It used to read `<html>.nav-pop`, which `BackNavAnimation` sets from its
 *    own `popstate` listener — and that listener runs AFTER the router's: the
 *    router's handler notifies synchronously, React renders the restored page
 *    in the microtask between the two listeners, and only then is the class
 *    set. So every back/forward arrival deferred anyway and the router restored
 *    the scroll offset against a page that was still a placeholder short
 *    (`/games` from 1800px came back at 1335px; docs/performance-audit-2026-10-21.md
 *    §Navigation commit). History subscribers are notified inside the router's
 *    handler, before that microtask.
 *
 * Use it only for content that is below the fold on arrival. `minHeight` is a
 * reservation so the page does not visibly end and then grow while the subtree
 * builds; it never shifts anything the reader can see, because nothing above a
 * below-the-fold block moves when the block fills in.
 */

let documentHydrated = false;
/** The router history's last action type: PUSH / REPLACE, or BACK / FORWARD / GO. */
let lastHistoryAction = 'PUSH';

/** Called once by the root route, after the hydration commit. */
export function markDocumentHydrated() {
  documentHydrated = true;
}

/**
 * Record each history action as it happens. Called once by the root route with
 * `router.history`; returns the unsubscribe.
 */
export function trackHistoryActions(history: {
  subscribe: (cb: (event: { action: { type: string } }) => void) => () => void;
}): () => void {
  return history.subscribe(({ action }) => {
    lastHistoryAction = action.type;
  });
}

function shouldDeferNow(): boolean {
  if (!documentHydrated || typeof document === 'undefined') return false;
  if (
    lastHistoryAction === 'BACK' ||
    lastHistoryAction === 'FORWARD' ||
    lastHistoryAction === 'GO'
  ) {
    return false;
  }
  return !document.documentElement.classList.contains('nav-pop');
}

/**
 * The same split as {@link DeferOnNavigate}, for a caller that defers PART of
 * what it renders rather than a whole subtree — the home feed builds its first
 * screen of cards in the navigation commit and the rest of the page of results
 * in the follow-up transition. Returns `false` for the first render of a
 * page-switch mount and `true` from then on (always `true` under SSR, during
 * hydration and on back/forward, for the reasons above). `enabled` is read once,
 * at mount.
 */
/**
 * True while THIS component is rendering on the server or hydrating, false on a
 * client-only mount. React reads `getServerSnapshot` for every hydrating render
 * — including the separate, later pass in which a dehydrated Suspense boundary
 * hydrates — so this is per-component, where `markDocumentHydrated` is per
 * document. The difference is not academic: the home feed sits inside the
 * `<Suspense>` around `<Await>`, which hydrates AFTER the root's commit has
 * already flipped `documentHydrated`; reading only the flag, the wheel rendered
 * its first four cards against fifteen server-rendered ones, hydration failed
 * (#418), and React client-rendered the whole first feed over the server HTML
 * (docs/performance-audit-2026-10-21.md §Home LCP).
 */
const noopSubscribe = () => () => {};
function useIsHydrating(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => false,
    () => true,
  );
}

export function useDeferOnNavigate(enabled = true): boolean {
  const hydrating = useIsHydrating();
  const [ready, setReady] = useState(() => hydrating || !(enabled && shouldDeferNow()));

  useEffect(() => {
    if (ready) return;
    startTransition(() => setReady(true));
  }, [ready]);

  return ready;
}

export function DeferOnNavigate({
  children,
  minHeight = '50vh',
  enabled = true,
}: {
  children: ReactNode;
  /** Reserved block size while the subtree builds. Any CSS length. */
  minHeight?: string;
  /**
   * Whether this mount may defer — read once, at mount. Pass `false` when the
   * wrapped content is the top of the page in this particular state (e.g. a
   * grid that only sits below the fold when a hero is shown above it). The
   * wrapper stays in the tree either way, so toggling it never remounts the
   * content.
   */
  enabled?: boolean;
}) {
  const ready = useDeferOnNavigate(enabled);

  if (!ready) {
    return <div aria-hidden data-slot="defer-placeholder" style={{ minHeight }} />;
  }
  return <>{children}</>;
}
