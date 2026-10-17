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
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T12 replaces every body, and this line with them */
import { notImplemented } from './not-implemented';
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
 */
export function cameraFor(viewport: Viewport, radius: number, out?: Camera): Camera {
  return notImplemented('cameraFor', 'T12');
}

/**
 * The flat position of sphere point `(θ, φ)` under `projection`/`fit`: the page
 * pixel of its (clamped) extended UV, in camera space (`z = 0`), written to
 * `out[offset..offset+2]`.
 */
export function flatPosition(
  theta: number,
  phi: number,
  projection: Projection,
  fit: FitParams,
  viewport: Viewport,
  out: Float64Array,
  offset?: number,
): void {
  notImplemented('flatPosition', 'T12');
}

/**
 * The wrap wave weight (spec §5.5): `smootherstep(0, 1, s·(1 + k) − k·d)` with
 * `k = WRAP_WAVE`. `s` is the wrap (or unwrap) channel, `d` the angular distance
 * from the front point over π. 0 = fully flat, 1 = fully on the sphere.
 */
export function wrapWeight(s: number, d: number): number {
  return notImplemented('wrapWeight', 'T12');
}

/**
 * `out = flat + w·(sphere − flat)` per component; both inputs are camera-space
 * 3-vectors (`ArrayLike` so a `Float32Array` view of a vertex attribute works).
 */
export function morphPosition(
  flat: ArrayLike<number>,
  sphere: ArrayLike<number>,
  w: number,
  out: Float64Array,
  offset?: number,
): void {
  notImplemented('morphPosition', 'T12');
}

/**
 * Perspective-project a camera-space point to CSS px in the viewport (origin
 * top-left): the check test 15 uses to assert "every vertex projects to its page
 * pixel within 0.5 px" at `s = 0`.
 */
export function projectToViewport(
  camera: Camera,
  point: ArrayLike<number>,
  out: Float64Array,
  offset?: number,
): void {
  notImplemented('projectToViewport', 'T12');
}
