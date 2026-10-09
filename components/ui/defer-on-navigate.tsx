'use client';

import { startTransition, useEffect, useState, type ReactNode } from 'react';

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
 *    when it is applied. `BackNavAnimation` flags `<html>.nav-pop` synchronously
 *    on `popstate`, before the router renders, which is what is read here.
 *
 * Use it only for content that is below the fold on arrival. `minHeight` is a
 * reservation so the page does not visibly end and then grow while the subtree
 * builds; it never shifts anything the reader can see, because nothing above a
 * below-the-fold block moves when the block fills in.
 */

let documentHydrated = false;

/** Called once by the root route, after the hydration commit. */
export function markDocumentHydrated() {
  documentHydrated = true;
}

function shouldDeferNow(): boolean {
  if (!documentHydrated || typeof document === 'undefined') return false;
  return !document.documentElement.classList.contains('nav-pop');
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
  const [ready, setReady] = useState(() => !(enabled && shouldDeferNow()));

  useEffect(() => {
    if (ready) return;
    startTransition(() => setReady(true));
  }, [ready]);

  if (!ready) {
    return <div aria-hidden data-slot="defer-placeholder" style={{ minHeight }} />;
  }
  return <>{children}</>;
}
