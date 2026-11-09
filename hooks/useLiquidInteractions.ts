'use client';

import { useEffect } from 'react';
import { installLazyClickArcs } from '@/lib/jelly/arc-lazy';
import { installPointerVars } from '@/lib/jelly/pointer-vars';

/**
 * Mount the Plasmatic Jelly document services once at the provider boundary, including full-screen app routes. One
 * effect, one teardown, in two steps.
 *
 * **At once:** the pointer variable (`lib/jelly/pointer-vars.ts`): `--px` / `--py` on the one jelly host under a fine
 * pointer, for the plasma wake and the dent's light dot. A static import: it is small, and the frame driver and
 * pointer hub it rides were already in the entry (OPT-01, `scripts/check-bundle-budget.ts`). On a `(hover: none)`
 * device it attaches nothing.
 *
 * **After the window `load` event, at idle:** subscribe the click arcs and stamp `html[data-jelly-ready]` so glass that
 * mounts from then on fades in (app/jelly-material.css §7). Every browser gets the same material: there is no low-end
 * tier, and nothing here probes the GPU.
 *
 * The static CSS tier (`app/liquid-glass.css`, `app/jelly-material.css`) is the material. The soft body is CSS too
 * (CSS-first jelly, PR 3: §8, springs on `scale`); the soft-body physics, the glass engine, the CSS flow carriers, the
 * governor and the fallback cursor light are deleted (their `--px` / `--py` wake is `lib/jelly/pointer-vars.ts`). The electric arc is
 * the one event-woken effect: **after the same idle step**, `installLazyClickArcs` (`lib/jelly/arc-lazy.ts`) subscribes
 * to the first `pointerdown` through the pointer hub; the arcs chunk is imported and the click-only runtime installed
 * on that press, and removed again 10 s after the last click. Ambient arcs no longer exist.
 * The page snapshot the liquid globe refracts comes from the globe's own scene feed (`lib/liquid/glass/scene-feed.ts`).
 */
export function useLiquidInteractions(enabled = true): void {
  useEffect(() => {
    // Some full-screen apps (the TF2 HUD Editor) carry their own material and install none of the jelly.
    if (!enabled) return;
    let cancelled = false;
    let stopArcs: (() => void) | null = null;
    const stopPointerVars = installPointerVars(document);

    const start = () => {
      if (cancelled) return;
      // The click arc: one `pointerdown` subscription on the shared hub and nothing else. The arcs chunk, the runtime
      // and its canvas appear on the first press and are gone ten seconds after the last (lib/jelly/arc-lazy.ts).
      stopArcs = installLazyClickArcs(document);
      // From here on, glass that mounts fades in (app/jelly-material.css §7); the first paint never did.
      document.documentElement.setAttribute('data-jelly-ready', '');
    };
    // Safari has no requestIdleCallback (the DOM typings say every browser does), so feature-detect it.
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const idle = typeof w.requestIdleCallback === 'function';
    let handle: number | null = null;
    // The window `load` event, then idle (400 ms at most): nothing here may compete with hydration.
    const schedule = () => {
      if (cancelled) return;
      handle = idle
        ? w.requestIdleCallback!(start, { timeout: 400 })
        : window.setTimeout(start, 200);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      if (handle !== null) {
        if (idle) w.cancelIdleCallback?.(handle);
        else window.clearTimeout(handle);
      }
      stopPointerVars();
      stopArcs?.();
      // The material is gone (a native-material route, or unmount): glass that mounts now must not fade in as if
      // the jelly were running.
      document.documentElement.removeAttribute('data-jelly-ready');
    };
  }, [enabled]);
}
