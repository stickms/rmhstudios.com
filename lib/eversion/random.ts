/**
 * Which projection this navigation uses (spec §5.1, §1.1-4). OWNER: T11.
 *
 * A fixed setting resolves to itself. `random` draws uniformly from the five
 * projections EXCLUDING the previous draw, which is kept in `sessionStorage`
 * under `LAST_PROJECTION_KEY` (read and write wrapped in try/catch; a throwing
 * or absent storage falls back to a module variable, so the "never the same
 * twice" rule holds within a page-load even in a private window).
 *
 * The same projection serves wrap and unwrap of one navigation.
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T11 replaces every body, and this line with them */
import { notImplemented } from './not-implemented';
import type { NavTransition, ProjectionId } from './types';

/**
 * Resolve the visitor's setting to the projection to draw. `rng` returns
 * `[0, 1)` and is injectable so the χ² uniformity test (spec §11.1 test 23)
 * can be deterministic.
 */
export function resolveProjection(
  setting: NavTransition,
  rng: () => number = Math.random,
): ProjectionId {
  return notImplemented('resolveProjection', 'T11');
}

/** Forget the previous draw (tests only). */
export function resetLastProjection(): void {
  notImplemented('resetLastProjection', 'T11');
}
