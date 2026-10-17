/**
 * The Thurston corrugated-sphere eversion — the TypeScript ORACLE (spec §4).
 * OWNER: T08, from the derivation T03 writes. Pure, client-safe.
 *
 * ## Why an oracle
 *
 * The eversion has to run in a vertex shader, where it cannot be unit-tested.
 * So it is written FIRST here, in plain TypeScript, and tested exhaustively in
 * node (spec §11.1 tests 6–11 — start, end, immersion, time continuity,
 * boundedness, symmetry). The GLSL in `gl/shaders.ts` is then a port that is
 * checked against this file at 64 values of `e` (test 27), which proves the
 * shader is the eversion the unit tests verified. Nothing in the shader may be
 * "fixed up" without changing this file first.
 *
 * ## Contract
 *
 * `F(θ, φ, e)` maps the sphere point `(θ, φ)` (the chart of `domain.ts`) to a
 * position in body space at eversion progress `e ∈ [0, 1]`:
 *
 * - `F(·, 0)` is the unit sphere (`spherePoint`) to 1e-9;
 * - `F(·, 1) = R·p` for an orthogonal `R` with `det R = −1`;
 * - the surface is an IMMERSION at every `e` (no crease, no pinch) — the
 *   property the smoothed stage windows of spec §4.3 are tuned against;
 * - `max ‖F‖ ≤ MAX_EVERSION_EXTENT` for all `e`.
 *
 * ## Licence
 *
 * Re-derived from the published construction (Levy, *Making Waves*, 1995), not
 * from the Geometry Center `evert` sources (spec §4.1). Do not paste code.
 *
 * All three functions write into caller buffers and never allocate.
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T08 replaces every body, and this line with them */
import { notImplemented } from './not-implemented';
import type { EvertFn, EvertNormalFn, StageParamsFn } from './types';

/**
 * `F(θ, φ, e)` → `out[offset..offset+2]`, body space (spec §4.2). The mesh's
 * polar fans pass `φ = ±π/2` exactly; the poles are fixed points of the
 * corrugation stage and move only under push/unpush.
 */
export const evert: EvertFn = (theta, phi, e, out, offset) => {
  return notImplemented('evert', 'T08');
};

/**
 * The smoothed stage parameters at progress `e` (spec §4.3): the quintic
 * smoothstep of each of `STAGE_WINDOWS` (which overlap by `STAGE_OVERLAP`),
 * written in `EVERT_STAGES` order into the first five of `STAGE_PARAM_COUNT`
 * slots, the rest zero. This is what the CPU hands the shader as a uniform array
 * (the GPU does no window math), and what `evert` itself calls — so the two can
 * never disagree about where a stage starts.
 */
export const stageParams: StageParamsFn = (e, out, offset) => {
  return notImplemented('stageParams', 'T08');
};

/**
 * The unit normal at `(θ, φ, e)`, oriented by the winding (outward at `e = 0`,
 * inward at `e = 1`) — finite differences of {@link evert} away from the poles
 * and the analytic pole normal within `POLE_EPS` of them (spec §4.4).
 */
export const normal: EvertNormalFn = (theta, phi, e, out, offset) => {
  return notImplemented('normal', 'T08');
};
