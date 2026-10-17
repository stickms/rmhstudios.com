/**
 * Whether the eversion may run for a navigation, as a pure function (spec §1.1-1,
 * T30).
 *
 * ## Why this is a plain module
 *
 * The four things that make a visitor ineligible live in four different places —
 * the rollout flag, two reduced-motion sources (OS media query and the account
 * toggle), the WebGL2 detection that T25 caches, and whether the eversion chunk
 * has finished loading. Reading them needs a `window`, a Zustand store and a
 * lazily-loaded host. Deciding what they MEAN needs none of that, and it is the
 * part with the order-of-precedence rules worth testing: so the readers are
 * injected, the decision is here, and `__tests__/eligibility.test.ts` covers
 * every row of the fallback matrix with plain objects.
 *
 * ## Order
 *
 * The first failing row wins, and the order is the order of the cheapest and
 * most definitive answer: a flag that is off says nothing else matters (and is
 * the only reason a visitor ever sees today); reduced motion is a preference we
 * must honour before anything technical; WebGL2 is a capability that does not
 * change within a page-load; the chunk is the only one that can flip to ready
 * later in the same session, so it goes last.
 *
 * "Unknown" is ineligible. T25's detection can throw (before it lands, and in a
 * sandboxed frame), and an effect we cannot prove will render must fall back to
 * today's navigation rather than gamble on it.
 */

import type { FallbackReason } from './types';

/** Everything the decision reads, already resolved to booleans. */
export interface EligibilityInputs {
  /** `isEversionEnabled()`. */
  flagEnabled: boolean;
  /** OS `prefers-reduced-motion` OR the account toggle. */
  reducedMotion: boolean;
  /** Cached WebGL2 detection; `null` when it could not be determined. */
  webgl2: boolean | null;
  /** `isEversionReady()` — the eversion chunk (and its dependencies) is loaded. */
  chunkReady: boolean;
}

/** The ineligibility reasons, in precedence order (also the order the tests walk). */
export const INELIGIBILITY_ORDER: readonly FallbackReason[] = [
  'flag-off',
  'reduced-motion',
  'no-webgl2',
  'chunk-not-ready',
];

/** Why the effect cannot run now; `null` when it can. */
export function evaluateEligibility(inputs: EligibilityInputs): FallbackReason | null {
  if (!inputs.flagEnabled) return 'flag-off';
  if (inputs.reducedMotion) return 'reduced-motion';
  if (inputs.webgl2 !== true) return 'no-webgl2';
  if (!inputs.chunkReady) return 'chunk-not-ready';
  return null;
}

/** Convenience: `evaluateEligibility(inputs) === null`. */
export function isEligibleFor(inputs: EligibilityInputs): boolean {
  return evaluateEligibility(inputs) === null;
}

/**
 * Whether a BEFORE capture is worth taking now. Everything except
 * `chunk-not-ready`: the chunk is prefetched at idle (T29) and routinely lands
 * after the hub's first open, and by the time the visitor picks a destination
 * the capture has to already exist — waiting for the chunk to be ready before
 * starting it would make the first run of every page-load miss its grace window.
 */
export function shouldCaptureBefore(inputs: EligibilityInputs): boolean {
  const reason = evaluateEligibility(inputs);
  return reason === null || reason === 'chunk-not-ready';
}
