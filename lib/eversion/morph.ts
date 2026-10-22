/**
 * The wrap/unwrap morph and the camera that makes its endpoints pixel-exact
 * (spec §5.5, §7.3). OWNER: T12. Pure, client-safe.
 *
 * ## Why this is TypeScript first
 *
 * This is the TS reference for the vertex shader's morph, written term for term
 * so it ports to GLSL without JS-only tricks (no recursion, no objects in the
 * hot path, no array methods). The tests (spec §11.1 tests 15–16) run on this;
 * T23 mirrors it in GLSL.
 *
 * ## Space
 *
 * All positions here are in **camera space in CSS px: origin at the VIEWPORT
 * CENTRE, x right, y DOWN, z toward the viewer**. (The renderer adds nothing:
 * the globe's centre offset is part of the sphere position.)
 *
 * ## The model
 *
 * Each vertex has two positions (spec §5.5):
 *
 * - `flat(p)` — the page pixel `P(p)` placed in the screen plane `z = 0`, sized
 *   so the page exactly fills the viewport. Vertices the page does not cover
 *   (glass) take the NEAREST PAGE-EDGE pixel — the clamp of the extended UV, see
 *   {@link Projection} — so the caps start collapsed on the border and grow out
 *   of it; nothing flies in from infinity.
 * - `sphere(p)` — the eversion surface times the radius, rotated by the spin and
 *   tilt, translated to the globe's centre.
 *
 * blended by `pos = mix(flat, sphere, w)` with the per-vertex wrap wave
 * `w = smootherstep(0, 1, s·(1 + k) − k·d)`, `k = WRAP_WAVE`, `d ∈ [0, 1]` the
 * angular distance from the front point over π: the centre curls onto the globe
 * first, the edges follow. UNWRAP is the same morph run backwards with the
 * AFTER side's domain transform `M_after` applied (spec §4.5), which is why the
 * snapshot carries `wrap` and `unwrap` as separate channels.
 *
 * **Pixel-exact endpoints.** The plane `z = 0` is where the perspective scale is
 * exactly 1, so at `s = 0` a flat vertex projects to precisely its page pixel.
 * The camera distance is `2·GLOBE_PERSP·radius` — the distance at which
 * `globeK(z) = GLOBE_PERSP/(GLOBE_PERSP − z/2)` is the perspective division, so
 * the WebGL sphere has the 2D cage's own bulge — and the `z = 0` plane is at
 * unit scale for ANY radius.
 *
 * ## The camera, for T23 to replicate
 *
 * The eye sits on the +z axis at `D = 2·GLOBE_PERSP·radius`, looking down −z
 * at the viewport centre. A camera-space point `(x, y, z)` lands at
 * `(w/2 + x·D/(D − z), h/2 + y·D/(D − z))` CSS px. At `z = 0` the factor is
 * exactly 1 whatever `D` is, so the page needs no per-frame correction, and
 * for a body point at depth `z·r` the factor is `GLOBE_PERSP/(GLOBE_PERSP −
 * z/2)` = `globeK(z)` — the navigation globe's own foreshortening. In GLSL
 * that is a hand-built projection (clip `x = 2·X/w · …`, `w_clip = D − z`), not
 * `perspective()`+`lookAt`, so no near-plane or fov rounding can move `z = 0`.
 */

import { GLOBE_PERSP } from '../globe';
import { WRAP_WAVE } from './constants';
import { THETA_MIN } from './domain';
import type { FitParams, Projection, Viewport } from './types';

/** The perspective camera for one frame. */
export interface Camera {
  /** Camera-to-origin distance in CSS px: `2 · GLOBE_PERSP · radius`. */
  distance: number;
  /** Viewport size in CSS px. */
  width: number;
  height: number;
}

/**
 * The camera for `viewport` and a globe of `radius` CSS px (spec §5.5). The
 * plan lists `cameraFor(viewport)`; the radius is needed because the camera
 * distance is a multiple of it. Writes into `out` when given.
 *
 * `GLOBE_PERSP` is read from `lib/globe.ts` so the WebGL sphere and the hub's
 * cage can never disagree about how much the sphere bulges. The device-pixel
 * ratio does not enter: positions are CSS px, the canvas backing store scales.
 */
export function cameraFor(viewport: Viewport, radius: number, out?: Camera): Camera {
  const cam = out ?? { distance: 0, width: 0, height: 0 };
  cam.distance = 2 * GLOBE_PERSP * radius;
  cam.width = viewport.w;
  cam.height = viewport.h;
  return cam;
}

/** How far inside the domain the seam-left column is evaluated — see {@link flatPosition}. */
const SEAM_NUDGE = 1e-9;

/**
 * The flat position of sphere point `(θ, φ)` under `projection`/`fit`: the page
 * pixel of its (clamped) extended UV, in camera space (`z = 0`), written to
 * `out[offset..offset+2]`.
 *
 *     (u, v) = extended(θ, φ)            // continuation outside the page
 *     (u, v) = clamp((u, v), 0, 1)       // nearest page-edge pixel
 *     flat   = ((u − ½)·w, (v − ½)·h, 0) // v is DOWN, like camera y
 *
 * Clamping a UV that left `[0, 1]²` leaves at least one coordinate at exactly 0
 * or 1, which is what puts every glass vertex ON the page border (S#16).
 *
 * **The seam column.** The mesh duplicates its first column: θ = −π is the
 * seam's LEFT side and θ = +π its right. `wrapTheta` is half-open and maps −π to
 * +π, so a naive `extended(−π, φ)` lands the left column on the page's RIGHT edge
 * (u = 1) and the first strip of the mesh would span the whole page. The shader
 * never has that problem — it reads the baked LUT with a clamped lookup, which
 * returns column 0 (u ≈ 0) at θ = −π. To be the shader's reference this function
 * nudges a seam-left θ a hair inside the domain (`SEAM_NUDGE`, 1e-9 rad ≈ 1e-9
 * of a page width: far below a pixel) so the continuation is taken from the
 * correct side.
 */
export function flatPosition(
  theta: number,
  phi: number,
  projection: Projection,
  fit: FitParams,
  viewport: Viewport,
  out: Float64Array,
  offset = 0,
): void {
  if (theta <= THETA_MIN + SEAM_NUDGE) theta = THETA_MIN + SEAM_NUDGE;
  // `out` doubles as the scratch for the UV: the projection writes its two
  // numbers there, then they are overwritten in place by the position.
  projection.extended(theta, phi, fit, out, offset);
  const u = Math.min(Math.max(out[offset]!, 0), 1);
  const v = Math.min(Math.max(out[offset + 1]!, 0), 1);
  out[offset] = (u - 0.5) * viewport.w;
  out[offset + 1] = (v - 0.5) * viewport.h;
  out[offset + 2] = 0;
}

/**
 * The wrap wave weight (spec §5.5): `smootherstep(0, 1, s·(1 + k) − k·d)` with
 * `k = WRAP_WAVE`. `s` is the wrap (or unwrap) channel, `d` the angular distance
 * from the front point over π. 0 = fully flat, 1 = fully on the sphere.
 *
 * Why this shape: the argument is `s` shifted earlier by `k·d`, and rescaled by
 * `1 + k` so that it still spans `[−k·d, 1 + k·(1 − d)]` — i.e. at `s = 0` it is
 * ≤ 0 for EVERY `d` (everything exactly flat) and at `s = 1` it is ≥ 1 (everything
 * exactly on the sphere), while in between a point at distance `d` lags the front
 * point by `k·d/(1 + k)` of the channel. Both ends are therefore exact, not
 * merely close, which is what makes the endpoints pixel-exact.
 *
 * `smootherstep(t) = t³(6t² − 15t + 10)` on `t` clamped to `[0, 1]`; it has zero
 * first and second derivative at both ends, so the morph starts and ends without
 * a visible jerk. In GLSL: `t = clamp(x, 0.0, 1.0)`, same polynomial.
 */
export function wrapWeight(s: number, d: number): number {
  const x = s * (1 + WRAP_WAVE) - WRAP_WAVE * d;
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * `out = flat + w·(sphere − flat)` per component; both inputs are camera-space
 * 3-vectors (`ArrayLike` so a `Float32Array` view of a vertex attribute works).
 * This is GLSL's `mix(flat, sphere, w)`. The `flat + w·(sphere − flat)` form is
 * used rather than `flat·(1 − w) + sphere·w` because it returns `flat` exactly
 * at `w = 0`, which the pixel-exact endpoints depend on.
 */
export function morphPosition(
  flat: ArrayLike<number>,
  sphere: ArrayLike<number>,
  w: number,
  out: Float64Array,
  offset = 0,
): void {
  for (let i = 0; i < 3; i++) {
    const a = flat[i]!;
    out[offset + i] = a + w * (sphere[i]! - a);
  }
}

/**
 * Perspective-project a camera-space point to CSS px in the viewport (origin
 * top-left): the check test 15 uses to assert "every vertex projects to its page
 * pixel within 0.5 px" at `s = 0`.
 *
 *     k = D / (D − z)                   // 1 at z = 0
 *     X = w/2 + x·k,   Y = h/2 + y·k
 *
 * A point at or behind the eye (`z ≥ D`) is outside the model: the eversion's
 * extent is bounded by `MAX_EVERSION_EXTENT·radius`, far inside `D = 6.2·radius`.
 */
export function projectToViewport(
  camera: Camera,
  point: ArrayLike<number>,
  out: Float64Array,
  offset = 0,
): void {
  const k = camera.distance / (camera.distance - point[2]!);
  out[offset] = camera.width * 0.5 + point[0]! * k;
  out[offset + 1] = camera.height * 0.5 + point[1]! * k;
}
