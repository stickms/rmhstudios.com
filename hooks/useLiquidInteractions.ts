'use client';

import { useEffect } from 'react';
import { installPointerVars } from '@/lib/jelly/pointer-vars';
import { reconcileSoftRender } from '@/lib/perf-tier';

/**
 * Mount the Plasmatic Jelly document services once at the provider boundary, including full-screen app routes. One
 * effect, one teardown, in two steps.
 *
 * **At once:** the pointer variable (`lib/jelly/pointer-vars.ts`): `--px` / `--py` on the one jelly host under a fine
 * pointer, for the plasma wake and the dent's light dot. A static import: it is small, and the frame driver and
 * pointer hub it rides were already in the entry (OPT-01, `scripts/check-bundle-budget.ts`). On a `(hover: none)`
 * device it attaches nothing.
 *
 * **After the window `load` event, at idle:** settle whether this browser draws in software (`reconcileSoftRender`,
 * which puts the page on `perf-lite`), and otherwise stamp `html[data-jelly-ready]` so glass that mounts from then on
 * fades in (app/jelly-material.css §7).
 *
 * The static CSS tier (`app/liquid-glass.css`, `app/jelly-material.css`) is the material. The soft body is CSS too
 * (CSS-first jelly, PR 3: §8, springs on `scale`), so the soft-body physics, the jelly registry (whose observers had
 * no consumer left) and the fallback cursor light (`lib/liquid/runtime.ts`, replaced by the `--px` / `--py` wake) are
 * no longer installed; neither are the glass engine, the CSS flow carriers, the governor or the electric arcs (PR 1).
 * The page snapshot the liquid globe refracts comes from the globe's own scene feed (`lib/liquid/glass/scene-feed.ts`).
 */
export function useLiquidInteractions(enabled = true): void {
  useEffect(() => {
    // Some full-screen apps (the TF2 HUD Editor) carry their own material and install none of the jelly.
    if (!enabled) return;
    let cancelled = false;
    const stopPointerVars = installPointerVars(document);

    const start = () => {
      if (cancelled) return;
      // Settle whether this browser draws in software. If it does, the page is on the low tier (`perf-lite`: the
      // static CSS material, nothing moving on its own, press still works) and the entrance fade stays off.
      if (reconcileSoftRender()) return;
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
    // The window `load` event, then idle (400 ms at most): the soft-render probe is not free, and nothing here may
    // compete with hydration.
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
      // The material is gone (a native-material route, or unmount): glass that mounts now must not fade in as if
      // the jelly were running.
      document.documentElement.removeAttribute('data-jelly-ready');
    };
  }, [enabled]);
}
