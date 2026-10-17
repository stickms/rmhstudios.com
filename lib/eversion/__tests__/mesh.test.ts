import { describe, expect, it } from 'vitest';
import { TIERS } from '../constants';
import { THETA_MAX, THETA_MIN, spherePoint } from '../domain';
import { buildMesh, meshCounts, meshForTier } from '../mesh';
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
    // Closed form, independently: rings + per-triangle apexes; bands + fans.
    expect(c.vertices).toBe((meshPhi - 1) * (meshTheta + 1) + 2 * meshTheta);
    expect(c.triangles).toBe(2 * meshTheta * (meshPhi - 2) + 2 * meshTheta);
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

  it.each(TIER_IDS)('%s: no degenerate triangles, and CCW from outside the unit sphere', (tier) => {
    const { meshTheta, meshPhi } = TIERS[tier];
    const m = buildMesh(meshTheta, meshPhi);
    const P = Array.from({ length: m.vertexCount }, (_, i) => onSphere(m.domain, i));
    let degenerate = -1;
    let wrong = -1;
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
      if (Math.hypot(nx, ny, nz) < 1e-12 && degenerate < 0) degenerate = t;
      if (nx * cx + ny * cy + nz * cz <= 0 && wrong < 0) wrong = t;
    }
    expect(degenerate, 'first degenerate triangle').toBe(-1);
    expect(wrong, 'first triangle not CCW from outside').toBe(-1);
  });

  it('the seam is duplicated and closed in 3D, with θ continuous inside every triangle', () => {
    const m = buildMesh(32, 16);
    const west: number[] = [];
    const east: number[] = [];
    for (let i = 0; i < m.vertexCount; i++) {
      const th = m.domain[2 * i]!;
      if (th === Math.fround(THETA_MIN)) west.push(i);
      if (th === Math.fround(THETA_MAX)) east.push(i);
    }
    // One per interior ring, on each side.
    expect(west).toHaveLength(15);
    expect(east).toHaveLength(15);
    const a = west.flatMap((i) => onSphere(m.domain, i));
    const b = east.flatMap((i) => onSphere(m.domain, i));
    expectClose(a, b, 1e-6, 'seam coincides in 3D');
    // No triangle spans more than one longitude step: the seam is never interpolated across.
    const step = (2 * Math.PI) / 32;
    let widest = 0;
    for (let t = 0; t < m.indices.length / 3; t++) {
      const th = [0, 1, 2].map((k) => m.domain[2 * m.indices[3 * t + k]!]!);
      widest = Math.max(widest, Math.max(...th) - Math.min(...th));
    }
    expect(widest).toBeLessThanOrEqual(step + 1e-6);
  });

  it('each pole has a dedicated fan of non-degenerate triangles around its own apexes', () => {
    const n = 24;
    const m = buildMesh(n, 12);
    const { north, south } = m.poleFans;
    expect(south.count).toBe(n * 3);
    expect(north.count).toBe(n * 3);
    expect(north.first).toBe(south.first + south.count);
    expect(north.first + north.count).toBe(m.indexCount);
    const apexLat = (r: { first: number; count: number }) => {
      const lats = new Set<number>();
      for (let k = r.first; k < r.first + r.count; k += 3)
        lats.add(m.domain[2 * m.indices[k]! + 1]!);
      return [...lats];
    };
    expectClose(apexLat(south), [-Math.PI / 2], 1e-6, 'south apex φ');
    expectClose(apexLat(north), [Math.PI / 2], 1e-6, 'north apex φ');
  });

  it('rejects resolutions that cannot form a closed sphere', () => {
    expect(() => buildMesh(2, 4)).toThrow(RangeError);
    expect(() => buildMesh(8, 1)).toThrow(RangeError);
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
