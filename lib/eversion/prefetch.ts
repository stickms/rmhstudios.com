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
 * 4. **Warms program compilation without touching the overlay's canvas.** A
 *    canvas element's control transfers to an `OffscreenCanvas` exactly once
 *    (see `gl/host.ts`), and the overlay's canvas does not exist yet. So the
 *    compile happens on a throwaway 1 × 1 `OffscreenCanvas` sent in an ordinary
 *    `init`; the render side replies `ready` once the programs are built, and
 *    that same reply is the WebGL2 probe (no context is created on this thread
 *    in worker mode). The overlay's own `init` later disposes the throwaway
 *    renderer (the core handles a second `init`) and builds a new one.
 *
 *    What this does and does not buy: a different context cannot reuse the
 *    first one's `WebGLProgram` objects, so the overlay's first `init` still
 *    links its programs. What the warm-up removes is everything around that —
 *    fetching and parsing the chunks and the worker script, starting the worker
 *    thread, creating the first GL context in the process (the driver's
 *    one-time initialisation is the slowest part) — and GPU drivers cache
 *    compiled shaders by source, so the second compile in the same process is
 *    far cheaper than the first. The remaining first-`init` cost is a link, not
 *    a cold start; T31 may keep the overlay canvas mounted-but-hidden between
 *    runs if it wants even that gone.
 *
 *    Where there is no `OffscreenCanvas` (older Safari) the compile is skipped
 *    and WebGL2 is probed on a detached `<canvas>` instead, lost immediately.
 *
 * It starts NO frame loop and posts nothing but `init` (idle at rest ≤ 2
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
 * TODO(T31): the controller module (`components/radial/eversion/
 * useEversionController.ts`) is written concurrently and is not on this branch.
 * When it lands, add its lazy entry to {@link loadChunks} so it is fetched here
 * too — and ONLY here: it must stay behind a dynamic import so it is in no
 * static closure (S#39 lists it).
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

/** Give up waiting for the first compile after this long; the chunks are still ready. */
const WARM_TIMEOUT_MS = 15_000;

const NO: PrefetchResult = { webgl2: false, tier: 'low', host: 'main' };

let started: Promise<PrefetchResult> | null = null;
let ready = false;

/** Resolves once the document has fired `load` AND the load event has finished dispatching. */
function afterLoad(): Promise<void> {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') setTimeout(resolve, 0);
    else window.addEventListener('load', () => setTimeout(resolve, 0), { once: true });
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
    // TODO(T31): import('@/components/radial/eversion/useEversionController')
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

async function warm(): Promise<PrefetchResult> {
  await afterLoad();
  performance.mark(EVERSION_MARKS.prefetch);

  const [{ getEversionHost, detectHostMode }] = await loadChunks();
  const [{ detectRuntimeQuality }, { pickTier }, { TIERS }, { isPerfLite }] = await Promise.all([
    import('@/lib/render/runtime'),
    import('./gl/governor-tiers'),
    import('./constants'),
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

  const host = getEversionHost();
  if (typeof OffscreenCanvas === 'undefined') {
    return { webgl2: probeWebgl2(), tier, host: host.mode };
  }

  const webgl2 = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => finish(false), WARM_TIMEOUT_MS);
    const unsubscribe = host.subscribe((message) => {
      if (message.type === 'ready') finish(true);
      else if (message.type === 'error' && message.fatal) finish(false);
      else if (message.type === 'context-lost') finish(false);
    });
    function finish(ok: boolean) {
      clearTimeout(timer);
      unsubscribe();
      resolve(ok);
    }
    host.post({
      type: 'init',
      canvas: new OffscreenCanvas(1, 1),
      tier,
      dprCap: TIERS[tier].canvasDprCap,
    });
  });
  // A worker that failed to start demotes the cached mode; report what the next host will be.
  return { webgl2, tier, host: detectHostMode() };
}

/**
 * Begin (or join) the warm-up. Waits for `window` `load` first. Resolves with
 * what was learned; never rejects — a failed warm-up resolves with
 * `webgl2: false` so eligibility simply says no.
 */
export function prefetchEversion(): Promise<PrefetchResult> {
  if (typeof window === 'undefined' || !isEversionEnabled()) return Promise.resolve(NO);
  started ??= warm().catch((error: unknown) => {
    console.error('eversion: prefetch failed', error);
    return NO;
  });
  return started;
}

/** Whether the warm-up has completed successfully (synchronous; for `isEligible`). */
export function isEversionReady(): boolean {
  return ready;
}
