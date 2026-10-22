import { describe, expect, it } from 'vitest';
import { TIERS } from '../constants';
import { THETA_MAX, THETA_MIN, spherePoint } from '../domain';
import { EQUATOR_EPS, SEAM_EPS, buildMesh, meshCounts, meshForTier } from '../mesh';
import type { Tier } from '../types';
import { expectClose } from './helpers';

const TIER_IDS: Tier[] = ['high', 'mid', 'low'];

/** Map vertex `i` of the mesh onto the unit sphere (float64). */
function onSphere(domain: Float32Array, i: number): [number, number, number] {
  const out = new Float64Array(3);
  spherePoint(domain[2 * i]!, domain[2 * i + 1]!, out);
  return [out[0]!, out[1]!, out[2]!];
}

describe('buildMesh (S§4.4, S§4.5, S§8.2)', () => {
  it.each(TIER_IDS)('%s: counts match the closed form and every index is in range', (tier) => {
    const { meshTheta, meshPhi } = TIERS[tier];
    const m = buildMesh(meshTheta, meshPhi);
    const c = meshCounts(meshTheta, meshPhi);
    // Closed form, independently: (rings + 2 pole rows + the duplicated equator) x (columns + 2 seam copies); 2 triangles per quad.
    expect(c.vertices).toBe((meshPhi + 2) * (meshTheta + 2));
    expect(c.triangles).toBe(2 * meshTheta * meshPhi);
    expect(m.vertexCount).toBe(c.vertices);
    expect(m.domain.length).toBe(c.vertices * 2);
    expect(m.indices.length).toBe(c.triangles * 3);
    expect(m.indexCount).toBe(c.triangles * 3);
    let bad = -1;
    for (let k = 0; k < m.indices.length; k++) {
      if (m.indices[k]! >= m.vertexCount) {
        bad = k;
        break;
      }
    }
    expect(bad, 'first out-of-range index').toBe(-1);
  });

  it.each(TIER_IDS)(
    '%s: CCW from outside the unit sphere; only the pole-band halves are degenerate',
    (tier) => {
      const { meshTheta, meshPhi } = TIERS[tier];
      const m = buildMesh(meshTheta, meshPhi);
      const P = Array.from({ length: m.vertexCount }, (_, i) => onSphere(m.domain, i));
      const { north, south } = m.poleFans;
      const inPoleBand = (t: number) =>
        [north, south].some((r) => 3 * t >= r.first && 3 * t < r.first + r.count);
      let degenerate = -1;
      let wrong = -1;
      let nanCount = 0;
      let degenerateCount = 0;
      for (let t = 0; t < m.indices.length / 3; t++) {
        const a = P[m.indices[3 * t]!]!;
        const b = P[m.indices[3 * t + 1]!]!;
        const c = P[m.indices[3 * t + 2]!]!;
        const ux = b[0] - a[0];
        const uy = b[1] - a[1];
        const uz = b[2] - a[2];
        const vx = c[0] - a[0];
        const vy = c[1] - a[1];
        const vz = c[2] - a[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const cx = (a[0] + b[0] + c[0]) / 3;
        const cy = (a[1] + b[1] + c[1]) / 3;
        const cz = (a[2] + b[2] + c[2]) / 3;
        if (![nx, ny, nz, cx, cy, cz].every(Number.isFinite)) nanCount++;
        // float32 domain: the pole row sits ~4e-8 off the true pole, so "zero area" is ~1e-9, real ones >= ~1e-5.
        if (Math.hypot(nx, ny, nz) < 1e-6) {
          degenerateCount++;
          if (!inPoleBand(t) && degenerate < 0) degenerate = t;
          continue; // zero area: no winding to speak of
        }
        if (nx * cx + ny * cy + nz * cz <= 0 && wrong < 0) wrong = t;
      }
      expect(nanCount).toBe(0);
      expect(degenerate, 'first degenerate triangle outside the pole bands').toBe(-1);
      expect(wrong, 'first triangle not CCW from outside').toBe(-1);
      // Exactly one zero-area half per pole quad.
      expect(degenerateCount).toBe(2 * meshTheta);
    },
  );

  it('both page seams (θ = ±π and θ = 0) are duplicated and closed in 3D', () => {
    const n = 32;
    const m = buildMesh(n, 16);
    const rows = 18; // 16 latitude segments: 17 rows + the duplicated equator
    const at = (th: number) => {
      const out: number[] = [];
      for (let i = 0; i < m.vertexCount; i++) if (m.domain[2 * i] === Math.fround(th)) out.push(i);
      return out;
    };
    const west = at(THETA_MIN);
    const east = at(THETA_MAX);
    const zero = [...at(-SEAM_EPS), ...at(SEAM_EPS)].sort((a, b) => a - b);
    expect(west).toHaveLength(rows);
    expect(east).toHaveLength(rows);
    expect(zero).toHaveLength(2 * rows);
    expectClose(
      west.flatMap((i) => onSphere(m.domain, i)),
      east.flatMap((i) => onSphere(m.domain, i)),
      1e-6,
      'BEFORE seam coincides in 3D',
    );
    const z0 = at(-SEAM_EPS);
    const z1 = at(SEAM_EPS);
    expectClose(
      z0.flatMap((i) => onSphere(m.domain, i)),
      z1.flatMap((i) => onSphere(m.domain, i)),
      1e-6,
      'AFTER seam coincides in 3D',
    );
    // No triangle spans more than one longitude step, and none touches both copies of a seam.
    const step = (2 * Math.PI) / n;
    let widest = 0;
    for (let t = 0; t < m.indices.length / 3; t++) {
      const ids = [0, 1, 2].map((k) => m.indices[3 * t + k]!);
      const th = ids.map((i) => m.domain[2 * i]!);
      widest = Math.max(widest, Math.max(...th) - Math.min(...th));
      expect(
        ids.filter((i) => z0.includes(i)).length === 0 || ids.every((i) => !z1.includes(i)),
      ).toBe(true);
    }
    expect(widest).toBeLessThanOrEqual(step + 1e-6);
  });

  it('each pole is a full row of vertices at |φ| = π/2, one per column, forming quads with the last ring', () => {
    const n = 24;
    const nPhi = 12;
    const m = buildMesh(n, nPhi);
    const stride = n + 2;
    for (const [row, phi] of [
      [0, -Math.PI / 2],
      [nPhi + 1, Math.PI / 2],
    ] as const) {
      const lats = new Set<number>();
      const lons = new Set<number>();
      for (let c = 0; c < stride; c++) {
        lats.add(m.domain[2 * (row * stride + c) + 1]!);
        lons.add(m.domain[2 * (row * stride + c)]!);
      }
      expectClose([...lats], [phi], 1e-6, 'pole row φ');
      expect(lats.size).toBe(1);
      expect(lons.size).toBe(n + 2); // every column has its own θ
      for (let c = 0; c < stride; c++)
        expectClose(
          onSphere(m.domain, row * stride + c),
          onSphere(m.domain, row * stride),
          1e-6,
          'at the pole',
        );
    }
    const { north, south } = m.poleFans;
    expect(south.count).toBe(n * 6);
    expect(north.count).toBe(n * 6);
    expect(north.first).toBe(south.first + south.count);
    expect(north.first + north.count).toBe(m.indexCount);
  });

  it('the equator row is duplicated either side of φ = 0 with no band between the copies', () => {
    const n = 24;
    const nPhi = 12;
    const m = buildMesh(n, nPhi);
    const stride = n + 2;
    const lo = (nPhi / 2) * stride;
    const hi = lo + stride;
    for (let c = 0; c < stride; c++) {
      expect(m.domain[2 * (lo + c) + 1]).toBe(Math.fround(-EQUATOR_EPS));
      expect(m.domain[2 * (hi + c) + 1]).toBe(Math.fround(EQUATOR_EPS));
      expectClose(onSphere(m.domain, lo + c), onSphere(m.domain, hi + c), 1e-6, 'equator copies');
    }
    for (let t = 0; t < m.indexCount; t += 3) {
      const ids = [0, 1, 2].map((q) => m.indices[t + q]!);
      const south = ids.some((i) => i >= lo && i < hi);
      const north = ids.some((i) => i >= hi && i < hi + stride);
      expect(south && north, 'a triangle spans both equator copies').toBe(false);
    }
  });

  it('rejects resolutions that cannot form a closed sphere', () => {
    expect(() => buildMesh(2, 4)).toThrow(RangeError);
    expect(() => buildMesh(7, 4)).toThrow(RangeError);
    expect(() => buildMesh(8, 2)).toThrow(RangeError);
    expect(() => buildMesh(8, 5)).toThrow(RangeError);
    expect(() => buildMesh(8.5, 4)).toThrow(RangeError);
  });

  it('builds the high mesh in <= 5 ms (best of several, after warm-up)', () => {
    const { meshTheta, meshPhi } = TIERS.high;
    buildMesh(meshTheta, meshPhi);
    let best = Infinity;
    for (let r = 0; r < 5; r++) {
      const t0 = performance.now();
      buildMesh(meshTheta, meshPhi);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThanOrEqual(5);
  });
});

describe('meshForTier', () => {
  it('is memoised and uses the tier resolution', () => {
    for (const tier of TIER_IDS) {
      const m = meshForTier(tier);
      expect(m).toBe(meshForTier(tier));
      expect([m.nTheta, m.nPhi]).toEqual([TIERS[tier].meshTheta, TIERS[tier].meshPhi]);
    }
  });
});
