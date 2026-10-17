/**
 * T07: the projection LUT baker (spec §5.4) and S#5 (spec §11.1 test 5).
 *
 * S#5 compares the clamped-bilinear LUT (the renderer's `LUT_SAMPLE_GLSL`) with
 * `forward` at a 4096 px page, in pixels of that page. Excluded, as the spec says, within 2 texels of a glass edge — and,
 * beyond the spec, within 2 texels of a documented discontinuity (a texel pair
 * whose UV jumps; see `discontinuityMask`), where no filtered LUT can be right.
 * The excluded fraction is printed so a mask that swallows the test is visible.
 */

import { describe, expect, it } from 'vitest';
import { LUT_ASPECT_BUCKETS, LUT_SIZE, LUT_UV_EXTENT } from '../constants';
import { PHI_MAX, PHI_MIN, THETA_MIN, TAU } from '../domain';
import { getProjection, PROJECTIONS } from '../projections';
import {
  aspectBucket,
  bakeLut,
  clearLutCache,
  discontinuityMask,
  fromHalfBits,
  getBakedLut,
  halfFloatErrorPx,
  sampleLut,
  sampleLutGuarded,
  toHalfFloat,
  toHalfFloatSplit,
} from '../projection-lut';
import { PROJECTION_IDS } from '../types';
import type { FitParams, Projection } from '../types';
import { seededRandom } from './helpers';

const PAGE_W = 4096;
const [W, H] = LUT_SIZE;
/** The six aspects of S#4. */
const ASPECTS = [
  { name: '9:19.5', w: 900, h: 1950 },
  { name: '3:4', w: 750, h: 1000 },
  { name: '1:1', w: 800, h: 800 },
  { name: '16:10', w: 1600, h: 1000 },
  { name: '16:9', w: 1600, h: 900 },
  { name: '21:9', w: 2100, h: 900 },
];

describe('bakeLut layout', () => {
  it('writes the extended UV at texel centres, row 0 = south, column 0 = back meridian', () => {
    const p = getProjection('mercator');
    const fit = p.fit(1000, 1000);
    const lut = bakeLut(p, fit);
    expect(lut.length).toBe(W * H * 2);
    const uv = new Float64Array(2);
    for (const [i, j] of [
      [0, 0],
      [511, 255],
      [1023, 511],
      [300, 100],
    ] as const) {
      p.extended(THETA_MIN + ((i + 0.5) / W) * TAU, PHI_MIN + ((j + 0.5) / H) * Math.PI, fit, uv);
      expect(lut[(j * W + i) * 2]).toBeCloseTo(uv[0]!, 6);
      expect(lut[(j * W + i) * 2 + 1]).toBeCloseTo(uv[1]!, 6);
    }
  });

  it('is finite everywhere and within the clamp, for every projection and aspect', () => {
    for (const id of PROJECTION_IDS) {
      for (const a of ASPECTS) {
        const p = getProjection(id);
        const lut = bakeLut(p, p.fit(a.w, a.h), [256, 128]);
        for (let k = 0; k < lut.length; k++) {
          const x = lut[k]!;
          if (!(
            Number.isFinite(x) &&
            x >= -LUT_UV_EXTENT - 1e-6 &&
            x <= 1 + LUT_UV_EXTENT + 1e-6
          )) {
            throw new Error(`${id} ${a.name}: texel float ${k} = ${x}`);
          }
        }
      }
    }
  });

  it('bakes into a caller buffer and rejects a wrong-sized one', () => {
    const p = getProjection('equirect');
    const fit = p.fit(100, 100);
    const buf = new Float32Array(64 * 32 * 2);
    expect(bakeLut(p, fit, [64, 32], buf)).toBe(buf);
    expect(() => bakeLut(p, fit, [64, 32], new Float32Array(10))).toThrow(RangeError);
  });
});

describe('memo cache', () => {
  it('buckets aspect to 1/64 and keys by projection', () => {
    clearLutCache();
    expect(aspectBucket(0.5625)).toBe(36);
    const a = getBakedLut('mercator', { w: 1600, h: 900 });
    const b = getBakedLut('mercator', { w: 1601, h: 900 }); // same bucket
    const c = getBakedLut('mercator', { w: 800, h: 800 });
    const d = getBakedLut('lambert', { w: 1600, h: 900 });
    // Compare identity as booleans: a failing `toBe` on a 4 MB typed array formats the whole thing.
    expect(b === a).toBe(true);
    expect(c === a).toBe(false);
    expect(d === a).toBe(false);
    expect(a.aspectBucket).toBe(36);
    expect(a.fit.aspect).toBeCloseTo(36 / LUT_ASPECT_BUCKETS, 12);
    clearLutCache();
    expect(getBakedLut('mercator', { w: 1600, h: 900 }) === a).toBe(false);
    clearLutCache();
  });
});

/**
 * Texels that lie within `radius` texels of a point where `projection.singular`
 * is true, found on a 2x supersampled lattice (the singular neighbourhoods are
 * 1e-3 rad, narrower than a texel) and grown by `radius`.
 */
const nearCache = new Map<string, Uint8Array>();
function nearSingular(p: Projection, fit: FitParams, radius: number): Uint8Array {
  // Peirce, stereographic and Lambert have point singularities whose 1e-3 rad
  // zone is narrower than a quarter texel: a 4x lattice finds them, and their
  // location does not depend on the fit, so it is computed once. Mercator and
  // equirect are row/column bands that a 2x lattice finds, per fit.
  const pointwise = p.id === 'peirce' || p.id === 'stereographic' || p.id === 'lambert';
  const sub = pointwise ? 4 : 2;
  const key = `${p.id}:${pointwise ? '' : fit.aspect}:${radius}`;
  const cached = nearCache.get(key);
  if (cached) return cached;
  const hit = new Uint8Array(W * H);
  const shift = sub === 4 ? 2 : 1;
  for (let j = 0; j < H * sub; j++) {
    const phi = PHI_MIN + ((j + 0.5) / (H * sub)) * Math.PI;
    for (let i = 0; i < W * sub; i++) {
      if (p.singular(THETA_MIN + ((i + 0.5) / (W * sub)) * TAU, phi, fit)) {
        hit[(j >> shift) * W + (i >> shift)] = 1;
      }
    }
  }
  // Separable box dilation (wraps in θ).
  const tmp = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!hit[j * W + i]) continue;
      for (let d = -radius; d <= radius; d++) tmp[j * W + ((i + d + W) % W)] = 1;
    }
  }
  const out = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!tmp[j * W + i]) continue;
      for (let d = -radius; d <= radius; d++) {
        const jj = j + d;
        if (jj >= 0 && jj < H) out[jj * W + i] = 1;
      }
    }
  }
  nearCache.set(key, out);
  return out;
}

/**
 * Texel radius around a singular point inside which S#5 is not asserted. Bilinear
 * interpolation error is `h²/8 · f''`, and `f''` diverges at a singularity
 * (Peirce's square-root points, Mercator's cap edge on a tall page, where
 * `y'' = sin φ / cos² φ`): measured, 8 texels clears Peirce and 16 clears
 * Mercator at 9:19.5 (8 texels leave 1.0 px). 16 texels = 0.098 rad = 5.6 degrees.
 */
const SINGULAR_TEXELS = 16;

describe('S#5: the bilinear LUT matches forward', () => {
  const rows: string[] = [];
  /** Samples per (projection, aspect). */
  const N = 5000;

  for (const id of PROJECTION_IDS) {
    it(`${id}: <= 0.5 px at ${PAGE_W} px page width`, () => {
      const p = PROJECTIONS[id];
      const perAspect: string[] = [];
      let worstAll = 0;
      let worstAt = '';
      for (const a of ASPECTS) {
        const fit = p.fit(a.w, a.h);
        const lut = bakeLut(p, fit);
        const bad = discontinuityMask(lut, LUT_SIZE, 2);
        const near = nearSingular(p, fit, SINGULAR_TEXELS);
        const rand = seededRandom(0x5eed + a.w + a.h);
        const fw = new Float64Array(2);
        const sampled = new Float64Array(2);
        const errs: number[] = [];
        let aspectAt = '';
        let aspectWorst = 0;
        let excluded = 0;
        for (let n = 0; n < N; n++) {
          const theta = THETA_MIN + rand() * TAU;
          const phi = PHI_MIN + rand() * (PHI_MAX - PHI_MIN);
          if (!p.forward(theta, phi, fit, fw)) continue; // glass: nothing to compare
          const x = ((theta - THETA_MIN) / TAU) * W - 0.5;
          const y = ((phi - PHI_MIN) / Math.PI) * H - 0.5;
          const ci = Math.min(W - 1, Math.max(0, Math.round(x)));
          const cj = Math.min(H - 1, Math.max(0, Math.round(y)));
          // Outside the first/last texel centre the shader's clamp extrapolates by
          // up to half a texel: a property of the layout, not of the projection.
          let skip = x < 0 || x > W - 1 || y < 0 || y > H - 1 || near[cj * W + ci] === 1;
          // A documented discontinuity (a jump texel) or a glass-edge texel within 2 texels.
          for (let dj = -2; dj <= 2 && !skip; dj++) {
            const jj = cj + dj;
            if (jj < 0 || jj >= H) continue;
            for (let di = -2; di <= 2; di++) {
              const ii = ci + di;
              if (ii < 0 || ii >= W) continue;
              const t = (jj * W + ii) * 2;
              const u = lut[t]!;
              const v = lut[t + 1]!;
              if (bad[jj * W + ii] || u < 0 || u > 1 || v < 0 || v > 1) {
                skip = true;
                break;
              }
            }
          }
          if (skip) {
            excluded++;
            continue;
          }
          sampleLut(lut, LUT_SIZE, theta, phi, sampled);
          const err = Math.max(
            Math.abs(sampled[0]! - fw[0]!) * PAGE_W,
            Math.abs(sampled[1]! - fw[1]!) * PAGE_W * fit.aspect,
          );
          errs.push(err);
          if (err > aspectWorst) {
            aspectWorst = err;
            aspectAt = `θ=${theta.toFixed(3)} φ=${phi.toFixed(3)}`;
          }
          if (err > worstAll) {
            worstAll = err;
            worstAt = `${a.name} θ=${theta.toFixed(4)} φ=${phi.toFixed(4)}`;
          }
        }
        errs.sort((m, k) => m - k);
        const worst = errs[errs.length - 1] ?? 0;
        const over = errs.filter((e) => e > 0.5).length;
        perAspect.push(
          `    ${a.name.padEnd(7)} worst ${worst.toFixed(3)} px  p99 ${(errs[Math.floor(errs.length * 0.99)] ?? 0).toFixed(3)}  >0.5px: ${over}/${errs.length}  excluded ${excluded}  worst at ${aspectAt}`,
        );
        expect(errs.length).toBeGreaterThan(500);
      }
      rows.push(`${id}\n${perAspect.join('\n')}`);
      expect(worstAll, worstAt).toBeLessThanOrEqual(0.5);
    });
  }

  it('prints the table', () => {
    console.warn(`S#5 LUT vs forward @ ${PAGE_W} px\n${rows.join('\n')}`);
  });
});

describe('bake mirror symmetry', () => {
  it('the quadrant-and-reflect bake equals evaluating every texel', () => {
    for (const id of PROJECTION_IDS) {
      for (const a of ASPECTS) {
        const p = getProjection(id);
        const fit = p.fit(a.w, a.h);
        const size = [128, 64] as const;
        const fast = bakeLut(p, fit, size);
        const uv = new Float64Array(2);
        let worst = 0;
        for (let j = 0; j < 64; j++) {
          for (let i = 0; i < 128; i++) {
            p.extended(
              THETA_MIN + ((i + 0.5) / 128) * TAU,
              PHI_MIN + ((j + 0.5) / 64) * Math.PI,
              fit,
              uv,
            );
            const k = (j * 128 + i) * 2;
            worst = Math.max(worst, Math.abs(fast[k]! - uv[0]!), Math.abs(fast[k + 1]! - uv[1]!));
          }
        }
        expect(worst, `${id} ${a.name}`).toBeLessThan(2e-6);
      }
    }
  });
});

describe('discontinuities', () => {
  it('flags the documented cuts and nothing on smooth interiors', () => {
    const peirce = getProjection('peirce');
    const fit = peirce.fit(800, 800);
    const lut = bakeLut(peirce, fit);
    const mask = discontinuityMask(lut);
    // Back meridian (column 0 / W-1 wrap) and back equator (rows 255/256, |θ| > π/2) are cuts…
    expect(mask[255 * W + 0]).toBe(1);
    expect(mask[255 * W + 100]).toBe(1);
    // …the front point is not.
    expect(mask[255 * W + 512]).toBe(0);
    let flagged = 0;
    for (const m of mask) flagged += m;
    console.warn(
      `peirce 1:1 jump texels: ${flagged} of ${W * H} (${((100 * flagged) / (W * H)).toFixed(2)}%)`,
    );
  });

  it('the guarded sampler never blends across a cut', () => {
    const peirce = getProjection('peirce');
    const lut = bakeLut(peirce, peirce.fit(800, 800));
    const out = new Float64Array(2);
    // The back equator (θ = 2.5, φ = 0) is a cut: UV jumps across it.
    const ci = Math.round(((2.5 - THETA_MIN) / TAU) * W - 0.5);
    let fired = 0;
    for (let k = 0; k < 40; k++) {
      const phi = -0.0045 + (k / 40) * 0.009;
      if (!sampleLutGuarded(lut, LUT_SIZE, 2.5, phi, out)) continue;
      fired++;
      // Unblended: exactly one texel's value.
      const hit = [H / 2 - 1, H / 2].some((jj) => {
        const t = (jj * W + ci) * 2;
        return Math.abs(lut[t]! - out[0]!) < 1e-6 && Math.abs(lut[t + 1]! - out[1]!) < 1e-6;
      });
      expect(hit).toBe(true);
    }
    expect(fired).toBeGreaterThan(0);
  });
});

describe('bake timing', () => {
  it('prints the bake time per projection (Peirce target <= 25 ms)', () => {
    const lines: string[] = [];
    let peirceMs = 0;
    for (const id of PROJECTION_IDS) {
      const p = getProjection(id);
      const fit = p.fit(1600, 900);
      const buf = new Float32Array(W * H * 2);
      for (let i = 0; i < 3; i++) bakeLut(p, fit, LUT_SIZE, buf); // warm up the JIT
      const runs: number[] = [];
      for (let i = 0; i < 7; i++) {
        const t0 = performance.now();
        bakeLut(p, fit, LUT_SIZE, buf);
        runs.push(performance.now() - t0);
      }
      runs.sort((a, b) => a - b);
      const median = runs[3]!;
      if (id === 'peirce') peirceMs = median;
      lines.push(
        `${id.padEnd(14)} median ${median.toFixed(1)} ms  min ${runs[0]!.toFixed(1)}  max ${runs[6]!.toFixed(1)}`,
      );
    }
    console.warn(`bakeLut ${W}x${H} (warm, 7 runs):\n${lines.join('\n')}`);
    const cold = getProjection('peirce');
    const t0 = performance.now();
    bakeLut(cold, cold.fit(1600, 900), LUT_SIZE);
    console.warn(
      `peirce warm single bake incl. allocation: ${(performance.now() - t0).toFixed(1)} ms`,
    );
    // Not a hard gate here (T36 makes it one on the device budget): only catch a 10x regression.
    expect(peirceMs).toBeLessThan(250);
  });
});

describe('half floats', () => {
  it('converts exactly where a half can represent the value, and rounds to nearest even', () => {
    const src = new Float32Array([
      0,
      1,
      -1,
      0.5,
      0.25,
      1.5,
      4,
      65504,
      1e6,
      1 + 2 ** -11,
      1 + 3 * 2 ** -11,
      6e-8,
    ]);
    const back = Array.from(toHalfFloat(src), fromHalfBits);
    expect(back.slice(0, 8)).toEqual([0, 1, -1, 0.5, 0.25, 1.5, 4, 65504]);
    expect(back[8]).toBe(Infinity);
    expect(back[9]).toBe(1); // exact tie -> even
    expect(back[10]).toBe(1 + 2 ** -9); // tie -> even, upward
    expect(back[11]).toBeCloseTo(6e-8, 7); // subnormal
  });

  it('matches a brute-force nearest-half for random values', () => {
    const rand = seededRandom(7);
    const halves: number[] = [];
    for (let b = 0; b < 0x7c00; b++) halves.push(fromHalfBits(b));
    for (let n = 0; n < 500; n++) {
      const x = Math.fround((rand() - 0.5) * 8);
      const got = fromHalfBits(toHalfFloat(new Float32Array([x]))[0]!);
      const ax = Math.abs(x);
      let best = Infinity;
      for (const h of halves) best = Math.min(best, Math.abs(h - ax));
      expect(Math.abs(Math.abs(got) - ax)).toBeCloseTo(best, 12);
    }
  });

  it('quantifies the round-trip error at 4096 px', () => {
    const lines: string[] = [];
    let worstPlain = 0;
    let worstSplit = 0;
    let inPageMax = 0;
    for (const id of PROJECTION_IDS) {
      const p = getProjection(id);
      const a = { w: 1600, h: 900 };
      const fit = p.fit(a.w, a.h);
      const lut = bakeLut(p, fit);
      const plainIn = halfFloatErrorPx(lut, PAGE_W, fit.aspect, { inPage: true });
      const plainAll = halfFloatErrorPx(lut, PAGE_W, fit.aspect);
      const splitAll = halfFloatErrorPx(lut, PAGE_W, fit.aspect, { split: true });
      worstPlain = Math.max(worstPlain, plainAll.max);
      worstSplit = Math.max(worstSplit, splitAll.max);
      inPageMax = Math.max(inPageMax, plainIn.max);
      lines.push(
        `${id.padEnd(14)} RG16F in-page max ${plainIn.max.toFixed(3)} mean ${plainIn.mean.toFixed(3)} | all-texel max ${plainAll.max.toFixed(1)} | hi/lo max ${splitAll.max.toExponential(2)} px`,
      );
    }
    console.warn(`half-float round trip @ ${PAGE_W} px page width (16:9)\n${lines.join('\n')}`);
    // The reason T24 must not use plain RG16F: a half cannot hold the page to the S#5 budget.
    expect(inPageMax).toBeGreaterThan(0.5);
    // The hi/lo split stays far below one texel-of-page (1 px) and below S#5's 0.5 px.
    expect(worstSplit).toBeLessThan(0.01);
  });

  it('hi/lo split filters linearly: bilinear of (hi + lo) equals bilinear of the source', () => {
    const p = getProjection('mercator');
    const lut = bakeLut(p, p.fit(1600, 900));
    const packed = toHalfFloatSplit(lut);
    expect(packed.length).toBe(W * H * 4);
    const rand = seededRandom(3);
    for (let n = 0; n < 200; n++) {
      const t = Math.floor(rand() * W * H);
      const t2 = (t + 1) % (W * H);
      const f = rand();
      for (let c = 0; c < 2; c++) {
        const hi =
          fromHalfBits(packed[t * 4 + c]!) * (1 - f) + fromHalfBits(packed[t2 * 4 + c]!) * f;
        const lo =
          fromHalfBits(packed[t * 4 + 2 + c]!) * (1 - f) +
          fromHalfBits(packed[t2 * 4 + 2 + c]!) * f;
        const exact = lut[t * 2 + c]! * (1 - f) + lut[t2 * 2 + c]! * f;
        expect(Math.abs(hi + lo - exact) * PAGE_W).toBeLessThan(0.01);
      }
    }
  });
});
