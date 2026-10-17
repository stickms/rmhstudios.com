/**
 * The sphere's chart — the one coordinate convention every eversion module
 * shares. Pure, client-safe.
 *
 * ## Why this is frozen in T01
 *
 * Projections, the Thurston oracle, the mesh, the LUT, the morph and the
 * shaders all speak `(θ, φ)`, and they are written by different people at the
 * same time. If "θ = 0" meant the front to one of them and the seam to another,
 * every one of their unit tests would still pass and the first integration would
 * show a page wrapped around the wrong side of the globe. So the convention is
 * written down once, here, and the contracts test checks it.
 *
 * ## The convention
 *
 * It is the navigation globe's own, `anchorAt` in `lib/globe.ts`, with radians
 * in place of degrees — so the WebGL sphere and the 2D cage it takes over from
 * are the same object by construction:
 *
 * - Body space is screen-handed: **x right, y DOWN, z toward the viewer.**
 * - `θ` is longitude, **`θ = 0` faces the viewer**, increasing to the right.
 * - `φ` is latitude, `+π/2` is NORTH, which is *up the screen* (−y).
 * - `p(θ, φ) = (cos φ · sin θ, −sin φ, cos φ · cos θ)`.
 *
 * The domain is `θ ∈ [−π, π]`, `φ ∈ [−π/2, π/2]`. Spec §4.2 writes `[0, 2π)`;
 * the two are the same sphere, but with the front at `θ = 0` the seam (where the
 * mesh duplicates its first column) belongs at `θ = ±π`, the back meridian —
 * which is where every projection's page edge already is, so the one place the
 * surface parametrisation is discontinuous coincides with the one place the
 * page's texture coordinates are. A seam through the front would put it in the
 * middle of the page.
 *
 * ## The page UV convention
 *
 * `(u, v) ∈ [0, 1]²`, `v` DOWN, matching the capture bitmap (spec §5.2). The
 * page centre `(0.5, 0.5)` is the front point `(θ, φ) = (0, 0)`.
 */

export const THETA_MIN = -Math.PI;
export const THETA_MAX = Math.PI;
export const PHI_MIN = -Math.PI / 2;
export const PHI_MAX = Math.PI / 2;
export const TAU = Math.PI * 2;

/**
 * The eversion's axis of symmetry in body space: the polar axis (φ = ±π/2).
 * Body y points DOWN, so this is the vertical axis of the screen at rest. The
 * spin is a rotation about it, applied BEFORE the tilt (`R = Rx(tilt)·Ry(spin)`,
 * the same order as `viewOf` in `lib/globe.ts`).
 */
export const SPIN_AXIS = [0, 1, 0] as const;

/**
 * The point `p(θ, φ)` on the unit sphere, written to `out[offset..offset+2]`.
 *
 * Allocation-free by design (the oracle, the mesh and the tests call it millions
 * of times). `out` may be a `Float32Array` or `Float64Array`.
 */
export function spherePoint(
  theta: number,
  phi: number,
  out: Float32Array | Float64Array,
  offset = 0,
): void {
  const cp = Math.cos(phi);
  out[offset] = cp * Math.sin(theta);
  out[offset + 1] = -Math.sin(phi);
  out[offset + 2] = cp * Math.cos(theta);
}

/** Wrap a longitude into `(−π, π]`. */
export function wrapTheta(theta: number): number {
  const t = (((theta + Math.PI) % TAU) + TAU) % TAU;
  // `t === 0` is the seam itself: −π and +π are the same meridian, and the half-open
  // interval says it is +π.
  return t === 0 ? Math.PI : t - Math.PI;
}

/**
 * Where `(θ, φ)` sits in a LUT of the given size, as continuous texel
 * coordinates (texel centres at integer + 0.5, so `x` runs 0…width).
 *
 * Row 0 is the SOUTH pole (`φ = −π/2`), column 0 is the back meridian
 * (`θ = −π`). That is the layout `bakeLut` writes and the shaders read: the
 * texture's `s` is `(θ + π)/2π` and `t` is `(φ + π/2)/π`, with `REPEAT` on `s`.
 */
export function lutTexel(
  theta: number,
  phi: number,
  width: number,
  height: number,
  out: Float64Array,
  offset = 0,
): void {
  out[offset] = ((theta - THETA_MIN) / TAU) * width;
  out[offset + 1] = ((phi - PHI_MIN) / Math.PI) * height;
}
