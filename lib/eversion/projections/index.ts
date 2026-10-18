/**
 * The projection registry (spec §5.1) and the allocation-friendly-but-handy
 * wrappers that tests and one-off callers use.
 *
 * The registry is the ONLY place a `ProjectionId` becomes a {@link Projection};
 * the LUT baker, the worker and the harness all go through {@link getProjection}
 * so adding a sixth projection is one file and one line here.
 *
 * Owned by T01 (the registry is a contract); each projection file is owned by
 * its own task (tasks §3).
 */

import type { FitParams, Projection, ProjectionId } from '../types';
import { equirect } from './equirect';
import { lambert } from './lambert';
import { mercator } from './mercator';
import { peirce } from './peirce';
import { stereographic } from './stereographic';

/** Every projection, keyed by id. Exactly `PROJECTION_IDS`, in any order. */
export const PROJECTIONS: Record<ProjectionId, Projection> = {
  mercator,
  peirce,
  stereographic,
  lambert,
  equirect,
};

/** The projection for `id`. */
export function getProjection(id: ProjectionId): Projection {
  return PROJECTIONS[id];
}

/**
 * `forward` with a tuple result — the form spec §5.2 writes
 * (`forward(θ, φ) → (u, v) | null`). Allocates; for tests and one-off calls
 * only. Hot paths (the LUT bake) use `Projection.forward` with an out buffer.
 */
export function forwardUV(
  projection: Projection,
  theta: number,
  phi: number,
  fit: FitParams,
): [number, number] | null {
  const out = new Float64Array(2);
  return projection.forward(theta, phi, fit, out) ? [out[0]!, out[1]!] : null;
}

/** `inverse` with a tuple result: `[θ, φ]`, or `null` when `(u, v)` has no preimage. Allocates. */
export function inverseThetaPhi(
  projection: Projection,
  u: number,
  v: number,
  fit: FitParams,
): [number, number] | null {
  const out = new Float64Array(2);
  return projection.inverse(u, v, fit, out) ? [out[0]!, out[1]!] : null;
}
