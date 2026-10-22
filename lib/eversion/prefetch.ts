/**
 * Idle-time warm-up of everything the effect needs — and nothing before the
 * page has loaded (spec §8.1, Q24). OWNER: T29. Client-only.
 *
 * ## The constraint it exists to honour
 *
 * Prefetching before a navigation is fine; **affecting page content load time
 * is not.** So no byte of the effect is on the critical path (the bundle budget
 * delta must be zero — spec §11.3 test 39, asserted by
 * `scripts/check-bundle-budget.ts`) and nothing starts before `window` `load`
 * (test 40, `testing/e2e/eversion-load.mjs`). This runs from the idle race
 * `RadialHub` already has for preloading `LiquidGlobe` (800 ms idle/timer), as a
 * dynamic `import()` of THIS module behind the flag, so the hub's static
 * closure gains nothing.
 *
 * ## What it does, after `load`
 *
 * 1. Waits for `load`, then one more task, then emits the
 *    {@link EVERSION_MARKS.prefetch} mark. The extra task matters: `load`
 *    listeners run INSIDE the load event, and the e2e check compares the mark to
 *    the navigation entry's `loadEventStart`, so the mark is unambiguously after.
 * 2. Dynamically imports, in parallel, the host (and with it the core, renderer
 *    and shaders), the capture module and `modern-screenshot`. The browser
 *    fetches dynamic-import chunks at low priority and the idle callback that
 *    called us is the rest of "low priority".
 * 3. Constructs the host — which, in worker mode, constructs the worker (cheap)
 *    and so fetches the worker script.
 * 4. **Probes WebGL2 and stops there** (amended 2026-10-18). It used to compile
 *    the programs on a throwaway 1 x 1 `OffscreenCanvas` "to warm the driver",
 *    and the overlay's own `init` then compiled them all again on the real
 *    canvas: two cold compiles, on the main thread wherever the host runs in-thread
 *    (every WebKit browser, i.e. every iPhone) - the costliest thing the effect did
 *    at rest, on exactly the devices least able to afford it. Now the bridge
 *    initialises the host on the page's real, persistent canvas as soon as it
 *    mounts (`EversionBridge`), once, and the answer here is a detached-canvas
 *    probe: a context created and lost at once, no program.
 *
 * It starts NO frame loop and posts nothing to the host (idle at rest ≤ 2
 * frames/s — test 42).
 *
 * ## Idempotent, never rejects, no-op when off
 *
 * Every call after the first returns the same promise. When the feature is off
 * (`isEversionEnabled()`), or on the server, nothing is imported, no mark is
 * emitted and the result is the "no" answer; that answer is not cached, so a
 * call after the flag turns on still works. A failure anywhere resolves
 * `webgl2: false` so eligibility simply says no.
 *
 * ## T31 hook
 *
 * The hub's lazy bridge (`components/radial/eversion/EversionBridge.tsx`, which
 * pulls in the controller and overlay) is fetched here too — and ONLY here and
 * by the hub's `React.lazy`: it must stay behind a dynamic import so it is in no
 * static closure (S#39 lists the controller).
 */

import { isEversionEnabled } from './flags';
import { EVERSION_MARKS } from './marks';
import type { HostMode, Tier } from './types';

/** What the warm-up learned, for the eligibility check (`isEligible`). */
export interface PrefetchResult {
  /** Whether WebGL2 is usable at all; `false` makes every navigation fall back. */
  webgl2: boolean;
  tier: Tier;
  host: HostMode;
}

const NO: PrefetchResult = { webgl2: false, tier: 'low', host: 'main' };

let started: Promise<PrefetchResult> | null = null;
let ready = false;
/** Ends a pending {@link afterLoad} wait now: the visitor's intent (see `prefetchEversion`). */
let hurryLoad: (() => void) | null = null;

/**
 * Resolves once the document has fired `load` AND the load event has finished
 * dispatching, or at once when hurried.
 */
function afterLoad(urgent: boolean): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      hurryLoad = null;
      resolve();
    };
    if (urgent) return done();
    hurryLoad = done;
    if (document.readyState === 'complete') setTimeout(done, 0);
    else window.addEventListener('load', () => setTimeout(done, 0), { once: true });
  });
}

/** The chunks the effect needs, fetched together. Everything here is a dynamic import. */
function loadChunks() {
  return Promise.all([
    import('./gl/host'),
    import('./capture'),
    // The library `capture.ts` itself imports on demand; fetching it here puts it
    // in the HTTP cache so the first BEFORE capture does not pay a round trip.
    import('modern-screenshot'),
    // `?eversion-debug=1` only; a no-op (and a tiny leaf) otherwise.
    import('./debug').then((m) => m.maybeLoadEversionDebug()),
    // The hub's lazy half: bridge + controller + overlay (T32). Fetched here so
    // the first confirm after load does not pay a cold chunk round trip, and
    // still only ever through a dynamic import — it is in no static closure.
    import('@/components/radial/eversion/EversionBridge'),
  ]);
}

/** WebGL2 probe for browsers with no `OffscreenCanvas`: a detached canvas, lost at once. */
function probeWebgl2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

async function warm(urgent: boolean): Promise<PrefetchResult> {
  await afterLoad(urgent);
  performance.mark(EVERSION_MARKS.prefetch);

  const [{ getEversionHost, detectHostMode }] = await loadChunks();
  const [{ detectRuntimeQuality }, { pickTier }, { isPerfLite }] = await Promise.all([
    import('@/lib/render/runtime'),
    import('./gl/governor-tiers'),
    import('@/lib/perf-tier'),
  ]);
  const tier = pickTier({
    renderTier: detectRuntimeQuality().tier,
    perfLite: isPerfLite(),
    isMobile: window.matchMedia?.('(max-width: 767px)').matches ?? false,
  });
  // The imports are in: from here on the chunk is "ready" for eligibility,
  // whatever the compile below says about WebGL2.
  ready = true;

  // Constructing the host spawns the worker (in worker mode), which fetches its
  // script and answers the capability probe; nothing is compiled until the bridge
  // initialises the real canvas. The controller's host init is the authority on
  // whether the effect can render; this answer only decides whether the bridge mounts.
  getEversionHost();
  return { webgl2: probeWebgl2(), tier, host: detectHostMode() };
}

/**
 * Begin (or join) the warm-up. Waits for `window` `load` first, unless `urgent`:
 * the hub passes that only once the visitor has opened it or picked a destination,
 * so the effect is about to be needed (a call that joins a warm-up still waiting
 * for `load` hurries it). Resolves with what was learned; never rejects — a failed
 * warm-up resolves with `webgl2: false` so eligibility simply says no.
 */
export function prefetchEversion(options: { urgent?: boolean } = {}): Promise<PrefetchResult> {
  if (typeof window === 'undefined' || !isEversionEnabled()) return Promise.resolve(NO);
  const urgent = options.urgent === true;
  if (urgent) hurryLoad?.();
  started ??= warm(urgent).catch((error: unknown) => {
    console.error('eversion: prefetch failed', error);
    return NO;
  });
  return started;
}

/** Whether the warm-up has completed successfully (synchronous; for `isEligible`). */
export function isEversionReady(): boolean {
  return ready;
}
