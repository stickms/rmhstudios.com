/**
 * End-map calibration, the AFTER page's mirror correction and its alignment
 * with the spin (spec §4.5, §7.4). OWNER: T13. Pure, client-safe.
 *
 * ## The correctness core of the effect
 *
 * `F(·, 1) = R·p` with `R` orthogonal and `det R = −1`: the eversion ends with
 * the sphere turned inside out, so what the visitor sees from outside is the
 * BACK side (the AFTER page). But a side viewed from outside after an
 * orientation-reversing map reads MIRRORED. The AFTER page is therefore sampled
 * through a pre-composed domain transform `M_after = R⁻¹ ∘ Rot_align`, so its
 * centre lands on the camera-facing point at the end of the spin and its
 * handedness is right-reading on screen.
 *
 * - {@link fitEndIsometry} finds `R` from the oracle (`evert` at `e = 1`) by a
 *   least-squares fit over the grid (Kabsch, allowing a reflection); computed
 *   once and memoised. Residual ≤ 1e-4, `det R ≈ −1`.
 * - {@link alignAngle} is `θ_align` — the spin angle at which `M_after`'s centre
 *   faces the camera — which the timeline's spin landing aims at (spec §7.4).
 * - {@link afterDomainTransform} builds `M_after` for the shader.
 *
 * Tests: spec §11.1 tests 12–14 (outward normals flip; no mirror, page-up is
 * screen-up; alignment within 0.1°).
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T13 replaces every body, and this line with them */
import { notImplemented } from './not-implemented';
import type { EndIsometry, Mat3, Vec3 } from './types';

/** Fit the end isometry `R` to the oracle at `e = 1` (Kabsch with reflection). Memoised. */
export function fitEndIsometry(): EndIsometry {
  return notImplemented('fitEndIsometry', 'T13');
}

/**
 * The spin angle (radians, modulo 2π, in `[0, 2π)`) about `axis` after which the
 * AFTER page's centre faces the camera, given the end isometry `R`. `axis`
 * defaults to `SPIN_AXIS`.
 */
export function alignAngle(R: Mat3, axis?: Vec3): number {
  return notImplemented('alignAngle', 'T13');
}

/**
 * `M_after = R⁻¹ ∘ Rot_align` (spec §4.5): the 3×3, column-major, that the AFTER
 * side's domain lookups apply to the body-space point before the projection.
 * `thetaAlign` is {@link alignAngle}'s result. The plan lists
 * `afterDomainTransform(R, spinAxis)`; the angle is the other input to
 * `Rot_align`, so it is an explicit parameter here. Writes into `out` if given.
 */
export function afterDomainTransform(R: Mat3, axis: Vec3, thetaAlign: number, out?: Mat3): Mat3 {
  return notImplemented('afterDomainTransform', 'T13');
}
