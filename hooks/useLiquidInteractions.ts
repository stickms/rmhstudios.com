'use client';

import { useEffect } from 'react';
import { installLiquidInteractions } from '@/lib/liquid/runtime';

/**
 * Mount the Plasmatic Jelly document services once at the provider boundary, including full-screen app routes. One
 * effect, one teardown, in two steps. Only the fallback light is a static import: every other service is a dynamic
 * import, because this hook is in the client entry and the entry has a byte budget (OPT-01,
 * `scripts/check-bundle-budget.ts`) that the registry, carriers and governor alone put 3.8 KB over.
 *
 * **At once** (press feedback must never wait for the browser to go idle):
 * 1. the fallback cursor light (`lib/liquid/runtime.ts`);
 * 2. the jelly registry (`lib/jelly/registry.ts`) — observers only, no DOM writes; every service below reads it.
 *    Requested together with physics, its first consumer, and installed before it;
 * 3. the soft-body physics (`lib/jelly/physics.ts`, a lazy chunk requested immediately, not at idle). Hosts DO move
 *    now, but only within the bounded squash/wobble and the ≤ 1.5 px neighbour nudge (`MOTION_BOUNDS`): hover plumps,
 *    press squashes, release wobbles. Text, hit areas and layout never move. Until the chunk lands, the CSS `:active`
 *    states are the press feedback.
 *
 * **After hydration, at idle** (they cost nothing on the first paint; the static haze floor and CSS rim are the
 * complete material until they arrive). These three INSERT nodes into hosts — a `.jelly-flow` first child, a rim
 * canvas last child, haze canvases — and a foreign child in a subtree React has not hydrated yet is a hydration
 * mismatch (#418) that throws the server markup away. This effect runs after the root's hydration commit, but a
 * Suspense boundary can still be dehydrated then, and a `requestIdleCallback` timeout fires on a busy main thread, so
 * they wait for the window `load` event (every script the page hydrates with has run) and then for idle:
 * 4. the CSS flow carriers (`lib/jelly/flow-carriers.ts`, lazy);
 * 5. the electric arcs (`lib/jelly/arcs`, lazy);
 * 6. the glass engine (`lib/liquid/glass/engine.ts`, lazy): rim slabs, haze canvases, cursor light.
 *
 * Every optional chunk fails soft: the CSS material is the fallback for each.
 */
export function useLiquidInteractions(): void {
  useEffect(() => {
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
    // The registry is installed the moment its chunk lands, before physics and before anything at idle reads it.
    const registry = import('@/lib/jelly/registry').then((m) =>
      keep(m.installJellyRegistry(document)),
    );
    void Promise.all([registry, import('@/lib/jelly/physics')])
      .then(([, m]) => keep(m.installJellyPhysics(document)))
      .catch(failSoft);

    const start = () => {
      if (cancelled) return;
      // The engine's governor sheds carriers too (step 3); until its chunk loads the step is 0.
      let governorStep = () => 0;
      void Promise.all([
        import('@/lib/jelly/flow-carriers'),
        import('@/lib/jelly/governor'),
        import('@/lib/jelly/tiers'),
        registry,
      ])
        .then(([flow, governor, tiers]) =>
          keep(
            flow.installJellyFlow(document, {
              budget: () => governor.governBudget(tiers.jellyBudget(), governorStep()),
            }),
          ),
        )
        .catch(failSoft);
      void registry
        .then(() => import('@/lib/jelly/arcs'))
        .then((m) => keep(m.installElectricArcs(document)))
        .catch(failSoft);
      void registry
        .then(() => import('@/lib/liquid/glass/engine'))
        .then((m) => {
          governorStep = m.jellyGovernorStep;
          keep(m.installLiquidGlass());
        })
        .catch(failSoft);
    };
    // Safari has no requestIdleCallback (the DOM typings say every browser does), so feature-detect it.
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const idle = typeof w.requestIdleCallback === 'function';
    let handle: number | null = null;
    const schedule = () => {
      if (cancelled) return;
      handle = idle
        ? w.requestIdleCallback!(start, { timeout: 2500 })
        : window.setTimeout(start, 600);
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
    };
  }, []);
}
