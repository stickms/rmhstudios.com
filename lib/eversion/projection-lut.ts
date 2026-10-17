/**
 * Bakes a projection into the sphere → page LUT the shaders sample (spec §5.4).
 * OWNER: T07. Pure, client-safe, runs in the worker on `prime`.
 *
 * ## Why every projection is baked
 *
 * Peirce needs Jacobi elliptic functions — far too heavy for a fragment shader
 * at 60 fps — so all five go through the same path: evaluate once per
 * navigation on the CPU, sample forever on the GPU. One path also means one set
 * of shader code and one place the page-edge handling can be wrong.
 *
 * ## Layout (frozen — the shaders read it)
 *
 * `RG32F`, `LUT_SIZE` = 1024 (θ) × 512 (φ), row-major, **row 0 = south pole
 * (`φ = −π/2`), column 0 = the back meridian (`θ = −π`)**; the texture is
 * sampled with `s = (θ + π)/2π`, `t = (φ + π/2)/π` and `REPEAT` in `s` (see
 * `domain.ts#lutTexel`). Texel `(i, j)` holds the projection's **extended UV**
 * — `Projection.extended` — for the `(θ, φ)` at the texel's centre. Glass is
 * "the UV lies outside `[0, 1]²`", NOT a sentinel; see the amendment note on
 * {@link Projection} for why.
 *
 * Upload format is `RG16F` (spec §8.5). Half floats carry ~11 bits of mantissa,
 * i.e. one part in 2048 — about 2 px at 4096 px — so T07 must check the
 * round-trip against test 5's tolerance and, if it does not hold, bake the
 * UV as an offset from the texel's own identity-map position (or upload `RG32F`
 * at 4 MB); that choice is T07's and does not change this contract.
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T07 replaces every body, and this line with them */
import { notImplemented } from './not-implemented';
import type { FitParams, Projection, ProjectionId } from './types';

/** A baked LUT and what it was baked for. */
export interface BakedLut {
  /** `RG32F`, `width × height × 2` floats. */
  readonly data: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly projection: ProjectionId;
  /** `round(aspect · LUT_ASPECT_BUCKETS)` — the cache key's aspect part. */
  readonly aspectBucket: number;
}

/** The cache's aspect key: the aspect `H/W` bucketed to `1/LUT_ASPECT_BUCKETS`. */
export function aspectBucket(aspect: number): number {
  return notImplemented('aspectBucket', 'T07');
}

/**
 * Bake `projection` under `fit` into a fresh `RG32F` array of `size = [W, H]`
 * texels (default `LUT_SIZE`). No allocation per sample. Pass `out` to bake into
 * an existing buffer (it must be `W·H·2` long).
 *
 * Target: ≤ 25 ms for Peirce at 1024 × 512 on a mid-tier phone (spec §5.4).
 */
export function bakeLut(
  projection: Projection,
  fit: FitParams,
  size?: readonly [number, number],
  out?: Float32Array,
): Float32Array {
  return notImplemented('bakeLut', 'T07');
}

/**
 * The baked LUT for `id` at this viewport's aspect, from a session memo keyed
 * `projectionId × aspectBucket` (spec §5.4). Calls `projection.fit(w, h)` and
 * {@link bakeLut} on a miss.
 */
export function getBakedLut(id: ProjectionId, viewport: { w: number; h: number }): BakedLut {
  return notImplemented('getBakedLut', 'T07');
}

/** Empty the memo (tests; and the harness after a fit-policy change). */
export function clearLutCache(): void {
  notImplemented('clearLutCache', 'T07');
}

/**
 * Convert `RG32F` to half-float bit patterns for `RG16F` upload (spec §8.5).
 * Writes into `dst` when given (same length as `src`), else allocates.
 */
export function toHalfFloat(src: Float32Array, dst?: Uint16Array): Uint16Array {
  return notImplemented('toHalfFloat', 'T07');
}

/**
 * Bilinearly sample a baked LUT at `(θ, φ)` — the CPU twin of what the shader
 * does (`REPEAT` in θ, clamp in φ), used by test 5 to compare the LUT with
 * `Projection.forward`. Writes the extended UV to `out[offset..offset+1]`.
 */
export function sampleLut(
  lut: Float32Array,
  size: readonly [number, number],
  theta: number,
  phi: number,
  out: Float64Array,
  offset?: number,
): void {
  notImplemented('sampleLut', 'T07');
}
