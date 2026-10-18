import { describe, expect, it } from 'vitest';
import { PHI_MAX, PHI_MIN, THETA_MAX, THETA_MIN } from '../domain';
import {
  applyMat3,
  det3,
  expectClose,
  jacobian2,
  jacobian3,
  kabsch,
  seededRandom,
  sphereGrid,
  type Mat3,
  type Vec3,
} from './helpers';

/** A uniformly-ish random orthogonal matrix with the requested determinant sign. */
function randomOrthogonal(rng: () => number, det: 1 | -1): Mat3 {
  // Gram–Schmidt on random vectors.
  const v = (): number[] => [rng() - 0.5, rng() - 0.5, rng() - 0.5];
  const norm = (a: number[]) => {
    const l = Math.hypot(a[0]!, a[1]!, a[2]!);
    return a.map((x) => x / l);
  };
  const e1 = norm(v());
  let e2 = v();
  const d12 = e2[0]! * e1[0]! + e2[1]! * e1[1]! + e2[2]! * e1[2]!;
  e2 = norm(e2.map((x, i) => x - d12 * e1[i]!));
  const e3 = [
    e1[1]! * e2[2]! - e1[2]! * e2[1]!,
    e1[2]! * e2[0]! - e1[0]! * e2[2]!,
    e1[0]! * e2[1]! - e1[1]! * e2[0]!,
  ].map((x) => x * det);
  return [...e1, ...e2, ...e3] as unknown as Mat3;
}

function randomUnitVectors(rng: () => number, n: number): Vec3[] {
  return Array.from({ length: n }, () => {
    const a = [rng() - 0.5, rng() - 0.5, rng() - 0.5];
    const l = Math.hypot(a[0]!, a[1]!, a[2]!);
    return [a[0]! / l, a[1]! / l, a[2]! / l] as const;
  });
}

describe('seededRandom', () => {
  it('is deterministic, in [0, 1), and seed-dependent', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const c = seededRandom(43);
    const sa = Array.from({ length: 100 }, a);
    const sb = Array.from({ length: 100 }, b);
    const sc = Array.from({ length: 100 }, c);
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('sphereGrid', () => {
  it('uses the T01 domain: no repeated seam, poles included by default', () => {
    const g = sphereGrid(8, 5);
    expect(g).toHaveLength(40);
    const thetas = g.map((p) => p.theta);
    expect(Math.min(...thetas)).toBe(THETA_MIN);
    expect(Math.max(...thetas)).toBeLessThan(THETA_MAX);
    const phis = g.map((p) => p.phi);
    expect(Math.min(...phis)).toBeCloseTo(PHI_MIN, 12);
    expect(Math.max(...phis)).toBeCloseTo(PHI_MAX, 12);
  });

  it('excludePoles stays strictly inside the latitude range', () => {
    const phis = sphereGrid(4, 6, { excludePoles: true }).map((p) => p.phi);
    expect(Math.min(...phis)).toBeGreaterThan(PHI_MIN);
    expect(Math.max(...phis)).toBeLessThan(PHI_MAX);
  });

  it('a single latitude sample is the equator', () => {
    expect(sphereGrid(3, 1).every((p) => p.phi === 0)).toBe(true);
  });
});

describe('jacobians', () => {
  it('jacobian2 of a linear map is exact to 1e-9', () => {
    const f = (t: number, p: number): [number, number] => [2 * t - 3 * p + 1, 0.5 * t + 4 * p];
    const J = jacobian2(f, 0.3, -0.7, 1e-3);
    expectClose(J.dTheta, [2, 0.5], 1e-9, 'dTheta');
    expectClose(J.dPhi, [-3, 4], 1e-9, 'dPhi');
  });

  it('jacobian3 matches the analytic tangents of the sphere to O(h²)', () => {
    const F = (t: number, p: number): [number, number, number] => [
      Math.cos(p) * Math.sin(t),
      -Math.sin(p),
      Math.cos(p) * Math.cos(t),
    ];
    const t = 0.4;
    const p = 0.3;
    const J = jacobian3(F, t, p, 1e-5);
    expectClose(J.dTheta, [Math.cos(p) * Math.cos(t), 0, -Math.cos(p) * Math.sin(t)], 1e-8, 'dθ');
    expectClose(
      J.dPhi,
      [-Math.sin(p) * Math.sin(t), -Math.cos(p), -Math.sin(p) * Math.cos(t)],
      1e-8,
      'dφ',
    );
  });
});

describe('kabsch', () => {
  it('recovers a random rotation to 1e-12', () => {
    const rng = seededRandom(7);
    const R = randomOrthogonal(rng, 1);
    const P = randomUnitVectors(rng, 12);
    const Q = P.map((p) => applyMat3(R, p));
    const got = kabsch(P, Q);
    expectClose(got, R, 1e-12, 'rotation');
    expect(det3(got)).toBeCloseTo(1, 12);
  });

  it('recovers a random reflection to 1e-12 when allowed, and a rotation otherwise', () => {
    const rng = seededRandom(11);
    const R = randomOrthogonal(rng, -1);
    const P = randomUnitVectors(rng, 12);
    const Q = P.map((p) => applyMat3(R, p));
    const refl = kabsch(P, Q, { allowReflection: true });
    expectClose(refl, R, 1e-12, 'reflection');
    expect(det3(refl)).toBeCloseTo(-1, 12);
    expect(det3(kabsch(P, Q))).toBeCloseTo(1, 12);
  });

  it('is deterministic on rank-deficient input (two points) and still orthogonal', () => {
    const P: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
    ];
    const got = kabsch(P, P);
    expectClose(got, [1, 0, 0, 0, 1, 0, 0, 0, 1], 1e-12, 'identity');
  });
});

describe('expectClose', () => {
  it('accepts within tolerance and rejects outside, NaN and length mismatch', () => {
    expectClose(1, 1 + 1e-10, 1e-9);
    expectClose(new Float32Array([1, 2]), [1, 2], 0);
    expect(() => expectClose(1, 2, 0.5, 'x')).toThrow(/x: first counter-example at \[0\]/);
    expect(() => expectClose(NaN, 0, 1e9)).toThrow();
    expect(() => expectClose([1], [1, 2], 1)).toThrow(/length/);
  });

  it('reports the FIRST counter-example', () => {
    expect(() => expectClose([0, 5, 9], [0, 0, 0], 1, 'v')).toThrow(/\[1\]/);
  });
});
