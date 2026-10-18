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
 * ## "Always evert globe" (spec amendment 2026-10-18)
 *
 * The visitor can ask for the effect even where it would be skipped to keep
 * navigation fast. That override reaches exactly ONE row here: a host that is
 * not up yet (`host-not-ready`) stops being a reason to fall back (the run waits
 * for it, bounded, in the runner). It never reaches the flag, reduced motion
 * (accessibility wins), WebGL2 (cannot run), the chunk (nothing to run with) or a
 * host that has FAILED. The other performance reasons (BEFORE missing or late,
 * a slow host or overlay) are not eligibility rows at all: they happen inside
 * the run, and the runner lengthens their waits on the same preference.
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
  /**
   * Where the render host is in its life; omitted by callers that only decide
   * the hub-side rows (the hub has no host). `idle` = never started,
   * `failed` = written off after repeated init failures.
   */
  hostState?: HostLifeState;
  /** The visitor's "Always evert globe" preference; absent means off. */
  alwaysEvert?: boolean;
}

/** Where the render host is in its life (`useEversionController`'s `HostState`). */
export type HostLifeState = 'idle' | 'initialising' | 'ready' | 'failed';

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
  if (inputs.hostState !== undefined) {
    return evaluateHostEligibility(inputs.hostState, inputs.alwaysEvert === true);
  }
  return null;
}

/**
 * The host row on its own (the controller composes it after the hub's rows).
 * A host still starting is "not yet": today's navigation runs now, unless the
 * visitor asked for "Always evert globe", in which case the run waits for it. A
 * written-off host cannot run the effect whatever the preference says.
 */
export function evaluateHostEligibility(
  hostState: HostLifeState,
  alwaysEvert: boolean,
): FallbackReason | null {
  if (hostState === 'ready') return null;
  if (hostState === 'failed') return 'host-error';
  return alwaysEvert ? null : 'host-not-ready';
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
