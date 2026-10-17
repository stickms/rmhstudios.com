/**
 * Idle-time warm-up of everything the effect needs — and nothing before the
 * page has loaded (spec §8.1, Q24). OWNER: T29. Client-only.
 *
 * ## The constraint it exists to honour
 *
 * Prefetching before a navigation is fine; **affecting page content load time
 * is not.** So no byte of the effect is on the critical path (the bundle budget
 * delta must be zero — spec §11.3 test 39) and nothing starts before `window`
 * `load` (test 40). This runs from the idle race `RadialHub` already has for
 * preloading `LiquidGlobe` (800 ms idle/timer), one call, low priority.
 *
 * After `load` it: imports the eversion chunk, `modern-screenshot` and the
 * worker script; constructs the worker (cheap); and compiles the GL programs in
 * the hub's rehearsal window — compiling is the expensive first-use cost. It
 * starts NO frame loop and does no GPU work beyond compilation (idle at rest ≤ 2
 * frames/s — test 42).
 *
 * Idempotent: every call after the first returns the same promise.
 */

import { notImplemented } from './not-implemented';
import type { HostMode, Tier } from './types';

/** What the warm-up learned, for the eligibility check (`isEligible`). */
export interface PrefetchResult {
  /** Whether WebGL2 is usable at all; `false` makes every navigation fall back. */
  webgl2: boolean;
  tier: Tier;
  host: HostMode;
}

/**
 * Begin (or join) the warm-up. Waits for `window` `load` first. Resolves with
 * what was learned; never rejects — a failed warm-up resolves with
 * `webgl2: false` so eligibility simply says no.
 */
export function prefetchEversion(): Promise<PrefetchResult> {
  return notImplemented('prefetchEversion', 'T29');
}

/** Whether the warm-up has completed successfully (synchronous; for `isEligible`). */
export function isEversionReady(): boolean {
  return notImplemented('isEversionReady', 'T29');
}
