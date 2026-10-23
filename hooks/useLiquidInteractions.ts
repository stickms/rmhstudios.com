'use client';

import { useEffect } from 'react';
import { installLiquidInteractions } from '@/lib/liquid/runtime';
import { jellyBudget } from '@/lib/jelly/tiers';

/**
 * Mount the Plasmatic Jelly document services once at the provider boundary, including full-screen app routes. One
 * effect, one teardown, in two steps:
 *
 * **At once** (press feedback must never wait for the browser to go idle):
 * 1. the fallback cursor light (`lib/liquid/runtime.ts`);
 * 2. the jelly registry (`lib/jelly/registry.ts`) — observers only, no DOM writes; every service below reads it;
 * 3. the soft-body physics (`lib/jelly/physics.ts`, a lazy chunk requested immediately, not at idle). Hosts DO move
 *    now, but only within the bounded squash/wobble and the ≤ 1.5 px neighbour nudge (`MOTION_BOUNDS`): hover plumps,
 *    press squashes, release wobbles. Text, hit areas and layout never move. Until the chunk lands, the CSS `:active`
 *    states are the press feedback.
 *
 * **At idle** (they cost nothing on the first paint; the static haze floor and CSS rim are the complete material until
 * they arrive):
 * 4. the CSS flow carriers (`lib/jelly/flow-carriers.ts`) — after hydration, so no foreign child lands in a subtree
 *    React is still hydrating;
 * 5. the electric arcs (`lib/jelly/arcs`, lazy);
 * 6. the glass engine (`lib/liquid/glass/engine.ts`, lazy): rim slabs, haze canvases, cursor light.
 *
 * Every service is its own chunk, not entry weight: nothing above has to run before hydration, and the entry is
 * budgeted (scripts/check-bundle-budget.ts). Each reader waits for the registry's chunk, so the order holds.
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
    const registry = import('@/lib/jelly/registry').then((m) => keep(m.installJellyRegistry(document)));
    void Promise.all([import('@/lib/jelly/physics'), registry])
      .then(([m]) => keep(m.installJellyPhysics(document)))
      .catch(failSoft);

    const start = () => {
      if (cancelled) return;
      // The engine's governor sheds carriers too (step 3); until its chunk loads the step is 0.
      let governorStep = () => 0;
      void Promise.all([import('@/lib/jelly/flow-carriers'), import('@/lib/jelly/governor'), registry])
        .then(([flow, governor]) =>
          keep(
            flow.installJellyFlow(document, {
              budget: () => governor.governBudget(jellyBudget(), governorStep()),
            }),
          ),
        )
        .catch(failSoft);
      void Promise.all([import('@/lib/jelly/arcs'), registry])
        .then(([m]) => keep(m.installElectricArcs(document)))
        .catch(failSoft);
      void Promise.all([import('@/lib/liquid/glass/engine'), registry])
        .then(([m]) => {
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
    const handle = idle
      ? w.requestIdleCallback!(start, { timeout: 2500 })
      : window.setTimeout(start, 600);
    return () => {
      cancelled = true;
      if (idle) w.cancelIdleCallback?.(handle);
      else window.clearTimeout(handle);
      // Reverse order: consumers before the registry they read.
      for (const stop of stops.reverse()) stop();
      stops.length = 0;
    };
  }, []);
}
