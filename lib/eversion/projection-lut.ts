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
 * sampled with `s = (θ + π)/2π`, `t = (φ + π/2)/π` (see
 * `domain.ts#lutTexel`). The renderer (T24) uploads the array as is, samples it `NEAREST`
 * and filters by hand CLAMPED in both axes — `domain.ts`'s "REPEAT in s" is superseded, because
 * the seam is a discontinuity. Texel `(i, j)` holds the projection's **extended UV**
 * — `Projection.extended` — for the `(θ, φ)` at the texel's centre. Glass is
 * "the UV lies outside `[0, 1]²`", NOT a sentinel; see the amendment note on
 * {@link Projection} for why.
 *
 * ## Which GPU format (the answer to spec §8.5's open question)
 *
 * Half floats are NOT good enough. A half has 11 significant bits, so its
 * spacing at magnitude `m` is `2^(floor(log2 m) − 10)`: 2^-11 on `[0.5, 1)` —
 * 2 px at a 4096 px page, a worst rounding error of 1 px — then 4 px spacing on
 * `[1, 2)`, 8 on `[2, 4)`, 16 on `[4, 8)`; and the glass texels, which hold
 * extended UVs up to `±LUT_UV_EXTENT`, are the worst of all. That is above S#5's
 * 0.5 px budget even before filtering. {@link halfFloatErrorPx} measures it per
 * bake. Two formats do fit:
 *
 * 1. **`RG32F` + `texelFetch` + a hand-written 4-tap bilinear** (recommended).
 *    32-bit float *filtering* needs `OES_texture_float_linear`, which some
 *    mobile GPUs lack; `texelFetch` on a 32F texture needs no extension, and a
 *    manual bilinear is also the only way to honour {@link sampleLutGuarded}'s
 *    cut handling. 4 MB.
 * 2. **`RGBA16F` hi/lo** ({@link toHalfFloatSplit}): `hi = half(x)`,
 *    `lo = half(x − hi)`, shader reads `hi + lo`. Hardware filtering of both
 *    halves is linear, so their sum is the linear interpolation of `x` to
 *    ~2^-22. Core WebGL2 filtering, 4 MB as well — pick it if hardware
 *    bilinear is wanted and the cuts below do not matter.
 *
 * `RG16F` ({@link toHalfFloat}) stays available for the cases where the
 * precision does not matter (a 1/8-scale preview), not for the page itself.
 *
 * ## Discontinuities
 *
 * Page UV is genuinely discontinuous across a projection's cut set — Peirce's
 * back meridian and back equator, Mercator/Equirect's `u: 0 ↔ 1` seam at
 * `θ = ±π`, the page-edge fold of Lambert/Stereographic at the back pole — and
 * bilinear filtering blends the two sides into a streak of garbage. Rather than
 * ask each projection for its cut geometry, {@link discontinuityMask} finds the
 * cuts from the baked data itself: a texel pair whose UV differs by more than
 * {@link JUMP_UV} is a jump. That also catches the legitimately steep clamped
 * regions beside a pole, which bilinear cannot represent either, so the mask
 * means "do not trust interpolation here". The shader-side recommendation is
 * {@link sampleLutGuarded}: fall back to the nearest tap when a jump is inside
 * the 2×2 footprint.
 */

import { LUT_ASPECT_BUCKETS, LUT_SIZE, LUT_UV_EXTENT } from './constants';
import { PHI_MIN, TAU, THETA_MIN } from './domain';
import { getProjection } from './projections';
import type { FitParams, PeirceFit, Projection, ProjectionId } from './types';

/** A baked LUT and what it was baked for. */
export interface BakedLut {
  /** `RG32F`, `width × height × 2` floats. */
  readonly data: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly projection: ProjectionId;
  /** `round(aspect · LUT_ASPECT_BUCKETS)` — the cache key's aspect part. */
  readonly aspectBucket: number;
  /**
   * The fit the LUT was baked under. CONTRACT ADDITION: the renderer must feed
   * the shaders THIS fit (not `projection.fit(viewport)`) — the LUT is shared by
   * every viewport in the bucket, whose aspects differ by up to 1/128.
   */
  readonly fit: FitParams;
}

/** The cache's aspect key: the aspect `H/W` bucketed to `1/LUT_ASPECT_BUCKETS`. */
export function aspectBucket(aspect: number): number {
  return Math.max(1, Math.round(aspect * LUT_ASPECT_BUCKETS));
}

const scratch = new Float64Array(2);

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
  size: readonly [number, number] = LUT_SIZE,
  out?: Float32Array,
): Float32Array {
  const [w, h] = size;
  const data = out ?? new Float32Array(w * h * 2);
  if (data.length !== w * h * 2) {
    throw new RangeError(`bakeLut: out has ${data.length} floats, need ${w * h * 2}`);
  }
  const dTheta = TAU / w;
  const dPhi = Math.PI / h;
  if (w % 2 === 0 && h % 2 === 0) {
    // Every projection here is mirror-symmetric about both page axes (`θ → −θ`
    // gives `u → 1−u`, `φ → −φ` gives `v → 1−v`, and the texel centres of an
    // even grid are symmetric), so evaluate one quadrant and reflect: 4× less
    // work, which for Peirce's elliptic functions is the difference between
    // a 400 ms and a 100 ms bake. The test compares it texel for texel against
    // the plain loop for every projection and aspect.
    const hw = w >> 1;
    const hh = h >> 1;
    // Peirce's back hemisphere is its front one reflected across the diamond
    // edge (`peirce.ts#planeOf`), and the mirror point `θ → π − θ` of a texel
    // centre is another texel centre, so only θ ∈ (0, π/2) needs the elliptic
    // integral: 1/8 of the texels. The reflection needs the UNCLAMPED plane
    // position, so a texel whose front UV hit the extent clamp is evaluated
    // directly.
    const fold = fit.kind === 'peirce' && w % 4 === 0;
    const frontEnd = fold ? (3 * w) >> 2 : w;
    const pf = fit as PeirceFit;
    const a = fold ? pf.squareHalf : 0;
    for (let j = hh; j < h; j++) {
      const phi = PHI_MIN + (j + 0.5) * dPhi;
      const jm = h - 1 - j;
      for (let i = hw; i < w; i++) {
        let u: number;
        let v: number;
        if (i >= frontEnd) {
          const src = (j * w + (3 * w) / 2 - 1 - i) * 2;
          const fu = data[src]!;
          const fv = data[src + 1]!;
          if (Math.abs(fu) < LUT_UV_EXTENT - 0.01 && Math.abs(fv) < LUT_UV_EXTENT - 0.01) {
            const x = (fu - 0.5) * 2 * pf.halfW;
            const y = (0.5 - fv) * 2 * pf.halfH;
            const bx = (x < 0 ? -1 : 1) * (a - Math.abs(y));
            const by = (y < 0 ? -1 : 1) * (a - Math.abs(x));
            u = 0.5 + bx / (2 * pf.halfW);
            v = 0.5 - by / (2 * pf.halfH);
            u = u > LUT_UV_EXTENT ? LUT_UV_EXTENT : u < -LUT_UV_EXTENT ? -LUT_UV_EXTENT : u;
            v = v > LUT_UV_EXTENT ? LUT_UV_EXTENT : v < -LUT_UV_EXTENT ? -LUT_UV_EXTENT : v;
          } else {
            projection.extended(THETA_MIN + (i + 0.5) * dTheta, phi, fit, scratch, 0);
            u = scratch[0]!;
            v = scratch[1]!;
          }
        } else {
          projection.extended(THETA_MIN + (i + 0.5) * dTheta, phi, fit, scratch, 0);
          u = scratch[0]!;
          v = scratch[1]!;
        }
        const im = w - 1 - i;
        let k = (j * w + i) * 2;
        data[k] = u;
        data[k + 1] = v;
        k = (j * w + im) * 2;
        data[k] = 1 - u;
        data[k + 1] = v;
        k = (jm * w + i) * 2;
        data[k] = u;
        data[k + 1] = 1 - v;
        k = (jm * w + im) * 2;
        data[k] = 1 - u;
        data[k + 1] = 1 - v;
      }
    }
    return data;
  }
  let k = 0;
  for (let j = 0; j < h; j++) {
    const phi = PHI_MIN + (j + 0.5) * dPhi;
    for (let i = 0; i < w; i++) {
      projection.extended(THETA_MIN + (i + 0.5) * dTheta, phi, fit, scratch, 0);
      data[k++] = scratch[0]!;
      data[k++] = scratch[1]!;
    }
  }
  return data;
}

/** LRU bound on the bake memo: the projection in use and the next one prepared. */
export const LUT_CACHE_MAX = 2;
const cache = new Map<string, BakedLut>();

/**
 * The baked LUT for `id` at this viewport's aspect, from a session memo keyed
 * `projectionId × aspectBucket` (spec §5.4). Calls `projection.fit(w, h)` and
 * {@link bakeLut} on a miss.
 *
 * The fit is taken at the BUCKET's aspect (`bucket / 64`), not the first
 * viewport's: otherwise what the LUT encodes would depend on which window
 * happened to bake it first. The result carries that fit.
 */
export function getBakedLut(id: ProjectionId, viewport: { w: number; h: number }): BakedLut {
  const bucket = aspectBucket(Math.max(viewport.h, 1) / Math.max(viewport.w, 1));
  const key = `${id}:${bucket}`;
  const hit = cache.get(key);
  if (hit) {
    // Most recently used goes last.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const projection = getProjection(id);
  const fit = projection.fit(LUT_ASPECT_BUCKETS, bucket);
  const baked: BakedLut = {
    data: bakeLut(projection, fit, LUT_SIZE),
    width: LUT_SIZE[0],
    height: LUT_SIZE[1],
    projection: id,
    aspectBucket: bucket,
    fit,
  };
  cache.set(key, baked);
  // Each LUT is 2-8 MB; keep the current one and the one being prepared.
  while (cache.size > LUT_CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return baked;
}

/** Empty the memo (tests; and the harness after a fit-policy change). */
export function clearLutCache(): void {
  cache.clear();
}

/* ── Half floats ──────────────────────────────────────────────────────────── */

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** Float32 → half bit pattern, round-to-nearest-even; overflow → ±Infinity. */
function toHalfBits(x: number): number {
  f32[0] = x;
  const b = u32[0]!;
  const sign = (b >>> 16) & 0x8000;
  const exp = (b >>> 23) & 0xff;
  const man = b & 0x7fffff;
  if (exp === 0xff) return sign | 0x7c00 | (man ? 0x200 : 0); // Inf / NaN
  const e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00;
  if (e <= 0) {
    if (e < -10) return sign; // underflows to ±0
    const m = man | 0x800000; // restore the implicit bit, shift into the subnormal range
    const shift = 14 - e;
    let half = m >>> shift;
    const rem = m & ((1 << shift) - 1);
    const mid = 1 << (shift - 1);
    if (rem > mid || (rem === mid && half & 1)) half++;
    return sign | half;
  }
  let half = (e << 10) | (man >>> 13);
  const rem = man & 0x1fff;
  if (rem > 0x1000 || (rem === 0x1000 && half & 1)) half++; // a carry correctly bumps the exponent
  return sign | half;
}

/** Half bit pattern → number. Exported for tests and the precision report. */
export function fromHalfBits(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >>> 10) & 0x1f;
  const man = h & 0x3ff;
  if (exp === 0) return sign * man * 2 ** -24;
  if (exp === 0x1f) return man ? NaN : sign * Infinity;
  return sign * (1 + man / 1024) * 2 ** (exp - 15);
}

/**
 * Convert `RG32F` to half-float bit patterns for `RG16F` upload (spec §8.5).
 * Writes into `dst` when given (same length as `src`), else allocates.
 * Precision caveat: see the module docblock — not enough for the page itself.
 */
export function toHalfFloat(src: Float32Array, dst?: Uint16Array): Uint16Array {
  const out = dst ?? new Uint16Array(src.length);
  if (out.length !== src.length) throw new RangeError('toHalfFloat: dst length mismatch');
  for (let i = 0; i < src.length; i++) out[i] = toHalfBits(src[i]!);
  return out;
}

/**
 * CONTRACT ADDITION. `RG32F` → `RGBA16F` hi/lo pairs: per texel `[hi(u), hi(v),
 * lo(u), lo(v)]` with `hi = half(x)`, `lo = half(x − hi)`. The shader adds
 * `.rg + .ba`; hardware bilinear filtering stays exact to ~2^-22 because both
 * halves interpolate linearly. `dst` must be twice the source length.
 */
export function toHalfFloatSplit(src: Float32Array, dst?: Uint16Array): Uint16Array {
  const texels = src.length / 2;
  const out = dst ?? new Uint16Array(texels * 4);
  if (out.length !== texels * 4) throw new RangeError('toHalfFloatSplit: dst length mismatch');
  for (let t = 0; t < texels; t++) {
    for (let c = 0; c < 2; c++) {
      const x = src[t * 2 + c]!;
      const hi = toHalfBits(x);
      out[t * 4 + c] = hi;
      out[t * 4 + 2 + c] = toHalfBits(x - fromHalfBits(hi));
    }
  }
  return out;
}

/**
 * CONTRACT ADDITION. Round-trip error of a half-float encoding of `lut`, in px
 * at a page `pageWidthPx` wide (`u` scales by the width, `v` by `width ·
 * aspect`). `inPage` restricts to texels whose UV is inside `[0, 1]²` — what a
 * user can see; the glass texels hold up to ±`LUT_UV_EXTENT`, where a half is
 * coarser still. `split` measures the hi/lo encoding instead of plain RG16F.
 */
export function halfFloatErrorPx(
  lut: Float32Array,
  pageWidthPx: number,
  aspect: number,
  opts: { inPage?: boolean; split?: boolean } = {},
): { max: number; mean: number; count: number } {
  let max = 0;
  let sum = 0;
  let count = 0;
  for (let t = 0; t < lut.length; t += 2) {
    const u = lut[t]!;
    const v = lut[t + 1]!;
    if (opts.inPage && (u < 0 || u > 1 || v < 0 || v > 1)) continue;
    for (let c = 0; c < 2; c++) {
      const x = c === 0 ? u : v;
      const hi = fromHalfBits(toHalfBits(x));
      const back = opts.split ? hi + fromHalfBits(toHalfBits(x - hi)) : hi;
      const err = Math.abs(back - x) * pageWidthPx * (c === 0 ? 1 : aspect);
      if (err > max) max = err;
      sum += err;
      count++;
    }
  }
  return { max, mean: count ? sum / count : 0, count };
}

/* ── Sampling and discontinuities ─────────────────────────────────────────── */

/**
 * UV difference between neighbouring texels above which the pair is a "jump"
 * (a cut, or a clamped pole region) rather than a smooth gradient. A smooth
 * map moves a few thousandths of the page per texel; real cuts jump by a
 * sizeable fraction of it.
 */
export const JUMP_UV = 0.05;

/**
 * CONTRACT ADDITION. Per-texel flags (`1` = unreliable under bilinear) for
 * every texel on either side of a jump to its right or upper neighbour (θ
 * wraps here, so the seam pair is reported even though the shader clamps), grown by `radius` texels. Allocation: one `Uint8Array(w·h)`.
 */
export function discontinuityMask(
  lut: Float32Array,
  size: readonly [number, number] = LUT_SIZE,
  radius = 0,
  threshold = JUMP_UV,
): Uint8Array {
  const [w, h] = size;
  const jump = new Uint8Array(w * h);
  const differs = (a: number, b: number) =>
    Math.abs(lut[a * 2]! - lut[b * 2]!) > threshold ||
    Math.abs(lut[a * 2 + 1]! - lut[b * 2 + 1]!) > threshold;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const a = j * w + i;
      const right = j * w + ((i + 1) % w);
      if (differs(a, right)) jump[a] = jump[right] = 1;
      if (j + 1 < h && differs(a, a + w)) jump[a] = jump[a + w] = 1;
    }
  }
  if (radius <= 0) return jump;
  const grown = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!jump[j * w + i]) continue;
      for (let dj = -radius; dj <= radius; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= h) continue;
        for (let di = -radius; di <= radius; di++) {
          grown[jj * w + ((i + di + w) % w)] = 1;
        }
      }
    }
  }
  return grown;
}

/** The 2×2 bilinear footprint of `(θ, φ)`: columns and rows both CLAMPED (as `LUT_SAMPLE_GLSL`), fractions. */
function footprint(size: readonly [number, number], theta: number, phi: number) {
  const [w, h] = size;
  const x = ((theta - THETA_MIN) / TAU) * w - 0.5;
  const y = ((phi - PHI_MIN) / Math.PI) * h - 0.5;
  const xf = Math.floor(x);
  const yf = Math.floor(y);
  return {
    i0: Math.min(w - 1, Math.max(0, xf)),
    i1: Math.min(w - 1, Math.max(0, xf + 1)),
    j0: Math.min(h - 1, Math.max(0, yf)),
    j1: Math.min(h - 1, Math.max(0, yf + 1)),
    fx: x - xf,
    fy: y - yf,
  };
}

/**
 * Bilinearly sample a baked LUT at `(θ, φ)` — the CPU twin of what the shader
 * does (`LUT_SAMPLE_GLSL`: four `texelFetch`es, CLAMPED in both axes — never wrapped
 * in θ, since the seam is a discontinuity), used by test 5 to compare the LUT with
 * `Projection.forward`. Writes the extended UV to `out[offset..offset+1]`.
 */
export function sampleLut(
  lut: Float32Array,
  size: readonly [number, number],
  theta: number,
  phi: number,
  out: Float64Array,
  offset = 0,
): void {
  const w = size[0];
  const { i0, i1, j0, j1, fx, fy } = footprint(size, theta, phi);
  for (let c = 0; c < 2; c++) {
    const a = lut[(j0 * w + i0) * 2 + c]!;
    const b = lut[(j0 * w + i1) * 2 + c]!;
    const d = lut[(j1 * w + i0) * 2 + c]!;
    const e = lut[(j1 * w + i1) * 2 + c]!;
    out[offset + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
}

/**
 * CONTRACT ADDITION. {@link sampleLut}, but if any of the four taps differs
 * from the nearest one by more than {@link JUMP_UV} the nearest tap is returned
 * unblended — the CPU twin of the recommended shader (4 `texelFetch`es, one
 * compare). Returns `true` when the guard fired.
 */
export function sampleLutGuarded(
  lut: Float32Array,
  size: readonly [number, number],
  theta: number,
  phi: number,
  out: Float64Array,
  offset = 0,
): boolean {
  const w = size[0];
  const { i0, i1, j0, j1, fx, fy } = footprint(size, theta, phi);
  const near = ((fy < 0.5 ? j0 : j1) * w + (fx < 0.5 ? i0 : i1)) * 2;
  const nu = lut[near]!;
  const nv = lut[near + 1]!;
  const taps = [(j0 * w + i0) * 2, (j0 * w + i1) * 2, (j1 * w + i0) * 2, (j1 * w + i1) * 2];
  for (const t of taps) {
    if (Math.abs(lut[t]! - nu) > JUMP_UV || Math.abs(lut[t + 1]! - nv) > JUMP_UV) {
      out[offset] = nu;
      out[offset + 1] = nv;
      return true;
    }
  }
  sampleLut(lut, size, theta, phi, out, offset);
  return false;
}
