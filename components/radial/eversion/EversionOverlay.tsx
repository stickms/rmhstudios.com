'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { holdLayerAttached, overlayAttached, overlayStore } from './overlay-store';

/**
 * The fixed layer that holds the eversion's canvas (spec §9.2 step 2, §10.4).
 * OWNER: T31.
 *
 * Renders nothing at rest. While the controller has a run on, it is one `div`
 * (`.eversion-overlay`, styled in `eversion.css` — which `radial.css` already
 * imports, so this file does not) that ADOPTS the controller's persistent canvas
 * in its ref callback, and the frozen picture's layer (`.eversion-hold-layer`,
 * see `overlay-store.ts`). The controller waits for that adoption before it lets the
 * render side present its first frame, so the canvas is never "ready" while
 * detached.
 *
 * ## Accessibility
 *
 * The overlay is `role="presentation"` and the canvas `aria-hidden`: nothing in
 * it is focusable or announced, and route announcements stay the router's. It
 * does take pointer input — a touch on it must neither scroll the page beneath
 * nor start a gesture (`touch-action: none` in the CSS) — but what a press MEANS
 * (fast-forward) is the controller's, listening on `window` in the capture phase
 * so it also catches presses that land on the fading hub above this layer.
 *
 * ## Where it goes
 *
 * Inside the hub (so it shares the shell's stacking context and sits one z-step
 * under the hub's overlay), loaded with `React.lazy`/dynamic `import()` by T32
 * so the effect adds nothing to the hub's static closure.
 */
export default function EversionOverlay() {
  const state = useSyncExternalStore(
    overlayStore.subscribe,
    overlayStore.getSnapshot,
    overlayStore.getServerSnapshot,
  );
  const ref = useCallback((el: HTMLDivElement | null) => overlayAttached(el), []);
  const holdRef = useCallback((el: HTMLDivElement | null) => holdLayerAttached(el), []);
  if (!state.mounted) return null;
  return (
    <>
      <div
        ref={ref}
        role="presentation"
        className={state.fading ? 'eversion-overlay eversion-overlay--fading' : 'eversion-overlay'}
      />
      {/* After the overlay on purpose: lifted to the overlay's level on release, it then paints over the canvas. */}
      <div ref={holdRef} className="eversion-hold-layer" aria-hidden />
    </>
  );
}

export { EversionOverlay };
