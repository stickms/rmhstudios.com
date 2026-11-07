'use client';

import { useEffect } from 'react';
import { installLiquidInteractions } from '@/lib/liquid/runtime';
import { reconcileSoftRender } from '@/lib/perf-tier';

/**
 * Mount the Plasmatic Jelly document services once at the provider boundary, including full-screen app routes. One
 * effect, one teardown, in two steps. Only the fallback light is a static import: every other service is a dynamic
 * import, because this hook is in the client entry and the entry has a byte budget (OPT-01,
 * `scripts/check-bundle-budget.ts`).
 *
 * **At once** (press feedback must never wait for the browser to go idle):
 * 1. the fallback cursor light (`lib/liquid/runtime.ts`);
 * 2. the jelly registry (`lib/jelly/registry.ts`) — observers only, no DOM writes. Requested together with physics,
 *    its consumer, and installed before it;
 * 3. the soft-body physics (`lib/jelly/physics.ts`, a lazy chunk requested immediately, not at idle). Hosts DO move
 *    now, but only within the bounded squash/wobble and the ≤ 1.5 px neighbour nudge (`MOTION_BOUNDS`): hover plumps,
 *    press squashes, release wobbles. Text, hit areas and layout never move. Until the chunk lands, the CSS `:active`
 *    states are the press feedback.
 *
 * **After the window `load` event, at idle:** settle whether this browser draws in software (`reconcileSoftRender`,
 * which puts the page on `perf-lite`), and otherwise stamp `html[data-jelly-ready]` so glass that mounts from then on
 * fades in (app/jelly-material.css §7).
 *
 * The static CSS tier (`app/liquid-glass.css`, `app/jelly-material.css`) is the material: the glass engine, the CSS
 * flow carriers, the governor and the electric arcs are no longer installed here (CSS-first jelly, PR 1). The page
 * snapshot the liquid globe refracts comes from the globe's own scene feed (`lib/liquid/glass/scene-feed.ts`).
 *
 * Every optional chunk fails soft: the CSS material is the fallback for each.
 */
export function useLiquidInteractions(enabled = true): void {
  useEffect(() => {
    // Some full-screen apps (the TF2 HUD Editor) carry their own material and install none of the jelly.
    if (!enabled) return;
    const stops: (() => void)[] = [];
    let cancelled = false;
    const keep = (stop: () => void) => {
      if (cancelled) stop();
      else stops.push(stop);
    };
    const failSoft = () => {
      /* The CSS material is the complete fallback if an optional chunk fails. */
    };

    keep(installLiquidInteractions());
    // The registry is installed the moment its chunk lands, before physics reads it.
    const registry = import('@/lib/jelly/registry').then((m) =>
      keep(m.installJellyRegistry(document)),
    );
    void Promise.all([registry, import('@/lib/jelly/physics')])
      .then(([, m]) => keep(m.installJellyPhysics(document)))
      .catch(failSoft);

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
      // Reverse order: consumers before the registry they read.
      for (const stop of stops.reverse()) stop();
      stops.length = 0;
      // The material is gone (a native-material route, or unmount): glass that mounts now must not fade in as if
      // the jelly were running.
      document.documentElement.removeAttribute('data-jelly-ready');
    };
  }, [enabled]);
}
