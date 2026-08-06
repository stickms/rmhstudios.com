import { describe, it, expect } from 'vitest';
import { DEBT_EPOCH_MS } from '@/lib/kaikai-debt/debt';
import { buildGrid, type GridCell } from '@/lib/kaikai-debt/stats';
import {
  DEFAULT_BINDING,
  DEFAULT_RATES,
  ROTATION_PLANES,
  TESSERACT_EDGES,
  TESSERACT_VERTICES,
  W_DISTANCE,
  Z_DISTANCE,
  advanceRotation,
  buildHyperData,
  edgeAxis,
  identityRotation,
  normalise,
  project3to2,
  project4to3,
  projectPoint,
  rotate4,
  toVec4,
  type Rotation4,
  type Vec4,
} from '@/lib/kaikai-debt/hyper';

const norm4 = (v: Vec4) => Math.hypot(v.x, v.y, v.z, v.w);

describe('rotate4', () => {
  it('is the identity at zero', () => {
    const point = { x: 0.3, y: -0.7, z: 0.1, w: 0.9 };
    expect(rotate4(point, identityRotation())).toEqual(point);
  });

  it('preserves length — these are rotations, not deformations', () => {
    const point = { x: 0.3, y: -0.7, z: 0.1, w: 0.9 };
    const before = norm4(point);
    for (const plane of ROTATION_PLANES) {
      const rotation = { ...identityRotation(), [plane]: 0.9 } as Rotation4;
      expect(norm4(rotate4(point, rotation))).toBeCloseTo(before, 12);
    }
  });

  it('rotates only the two coordinates its plane names', () => {
    const point = { x: 1, y: 0, z: 0.4, w: -0.2 };
    const turned = rotate4(point, { ...identityRotation(), xy: Math.PI / 2 });
    expect(turned.x).toBeCloseTo(0, 12);
    expect(turned.y).toBeCloseTo(1, 12);
    // z and w are untouched by an xy rotation.
    expect(turned.z).toBe(0.4);
    expect(turned.w).toBe(-0.2);
  });

  it('turns a visible axis into the invisible one in a w plane', () => {
    // This is the whole reason the fourth dimension is legible: an `xw`
    // rotation exchanges x with w, so a point that was on screen moves "out"
    // along the axis the screen does not have.
    const point = { x: 1, y: 0, z: 0, w: 0 };
    const turned = rotate4(point, { ...identityRotation(), xw: Math.PI / 2 });
    expect(turned.x).toBeCloseTo(0, 12);
    expect(turned.w).toBeCloseTo(1, 12);
  });

  it('is a full turn at 2π', () => {
    const point = { x: 0.3, y: -0.7, z: 0.1, w: 0.9 };
    const turned = rotate4(point, { ...identityRotation(), zw: Math.PI * 2 });
    expect(turned.z).toBeCloseTo(point.z, 9);
    expect(turned.w).toBeCloseTo(point.w, 9);
  });

  it('writes into the caller’s scratch object rather than allocating', () => {
    const scratch: Vec4 = { x: 0, y: 0, z: 0, w: 0 };
    const result = rotate4({ x: 1, y: 2, z: 3, w: 4 }, identityRotation(), scratch);
    expect(result).toBe(scratch);
  });

  it('leaves the input untouched', () => {
    const point = { x: 1, y: 2, z: 3, w: 4 };
    rotate4(point, { ...identityRotation(), xy: 1.1 });
    expect(point).toEqual({ x: 1, y: 2, z: 3, w: 4 });
  });
});

describe('advanceRotation', () => {
  it('steps each plane by its own rate', () => {
    const next = advanceRotation(identityRotation(), { xw: 1, zw: 0.5 }, 2);
    expect(next.xw).toBeCloseTo(2, 12);
    expect(next.zw).toBeCloseTo(1, 12);
    expect(next.xy).toBe(0);
  });

  it('wraps, so a tab left open overnight cannot lose precision', () => {
    let rotation = identityRotation();
    for (let i = 0; i < 10_000; i++) rotation = advanceRotation(rotation, { xw: 10 }, 1);
    expect(Math.abs(rotation.xw)).toBeLessThan(Math.PI * 2);
  });

  it('only turns the w planes by default', () => {
    // A shape tumbling in all six planes at once is indistinguishable from
    // noise, so the ordinary planes start at rest.
    expect(DEFAULT_RATES.xy ?? 0).toBe(0);
    expect(DEFAULT_RATES.xz ?? 0).toBe(0);
    expect(DEFAULT_RATES.yz ?? 0).toBe(0);
    expect(DEFAULT_RATES.xw).toBeGreaterThan(0);
  });
});

describe('projection', () => {
  it('makes a point further along w bigger', () => {
    const near = project4to3({ x: 1, y: 0, z: 0, w: 1 });
    const far = project4to3({ x: 1, y: 0, z: 0, w: -1 });
    expect(near.scale).toBeGreaterThan(far.scale);
  });

  it('never divides by zero, even at the eye plane', () => {
    const at = project4to3({ x: 1, y: 1, z: 1, w: W_DISTANCE });
    expect(Number.isFinite(at.scale)).toBe(true);
    expect(at.scale).toBeGreaterThan(0);
  });

  it('never flips a point across the origin past the eye', () => {
    // One such point is a mark that jumps across the screen for a single frame.
    const past = project4to3({ x: 1, y: 0, z: 0, w: W_DISTANCE + 5 });
    expect(past.x).toBeGreaterThan(0);
  });

  it('foreshortens the two projections differently', () => {
    // If they matched, a zw rotation would look like nothing was happening.
    expect(W_DISTANCE).not.toBe(Z_DISTANCE);
  });

  it('scales screen coordinates by the radius', () => {
    const small = project3to2({ x: 1, y: 0, z: 0 }, Z_DISTANCE, 100);
    const large = project3to2({ x: 1, y: 0, z: 0 }, Z_DISTANCE, 200);
    expect(large.x).toBeCloseTo(small.x * 2, 9);
  });

  it('runs the whole pipeline and reports the w depth it used', () => {
    const projected = projectPoint({ x: 0.5, y: 0.5, z: 0, w: 0.8 }, identityRotation(), 100);
    expect(projected.w).toBeCloseTo(0.8, 12);
    expect(Number.isFinite(projected.x)).toBe(true);
    expect(Number.isFinite(projected.depth)).toBe(true);
  });
});

describe('the tesseract', () => {
  it('has 16 vertices at every combination of ±1', () => {
    expect(TESSERACT_VERTICES).toHaveLength(16);
    const seen = new Set(TESSERACT_VERTICES.map((v) => `${v.x},${v.y},${v.z},${v.w}`));
    expect(seen.size).toBe(16);
    for (const vertex of TESSERACT_VERTICES) {
      for (const coordinate of [vertex.x, vertex.y, vertex.z, vertex.w]) {
        expect(Math.abs(coordinate)).toBe(1);
      }
    }
  });

  it('has 32 edges, each joining vertices that differ in one coordinate', () => {
    // Derived rather than typed out: a hand-written edge list with one entry
    // wrong is a shape that is subtly not a tesseract and nobody can tell.
    expect(TESSERACT_EDGES).toHaveLength(32);
    for (const [a, b] of TESSERACT_EDGES) {
      const va = TESSERACT_VERTICES[a]!;
      const vb = TESSERACT_VERTICES[b]!;
      const differences = [
        va.x !== vb.x,
        va.y !== vb.y,
        va.z !== vb.z,
        va.w !== vb.w,
      ].filter(Boolean);
      expect(differences).toHaveLength(1);
    }
  });

  it('gives every vertex degree four', () => {
    const degree = new Map<number, number>();
    for (const [a, b] of TESSERACT_EDGES) {
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
    }
    for (let i = 0; i < 16; i++) expect(degree.get(i)).toBe(4);
  });

  it('has exactly eight w edges — the ones the renderer highlights', () => {
    const wEdges = TESSERACT_EDGES.filter((edge) => edgeAxis(edge) === 3);
    expect(wEdges).toHaveLength(8);
  });

  it('stays a tesseract under rotation — every edge keeps its length', () => {
    const rotation: Rotation4 = { xy: 0.3, xz: 1.1, yz: -0.4, xw: 0.7, yw: 2.2, zw: -1.3 };
    const rotated = TESSERACT_VERTICES.map((vertex) => rotate4(vertex, rotation));
    for (const [a, b] of TESSERACT_EDGES) {
      const va = rotated[a]!;
      const vb = rotated[b]!;
      expect(Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z, va.w - vb.w)).toBeCloseTo(2, 9);
    }
  });
});

describe('normalise', () => {
  it('maps a domain onto [-1, 1]', () => {
    expect(normalise(0, 0, 10)).toBe(-1);
    expect(normalise(5, 0, 10)).toBe(0);
    expect(normalise(10, 0, 10)).toBe(1);
  });

  it('centres a degenerate domain rather than dividing by zero', () => {
    expect(normalise(5, 5, 5)).toBe(0);
    expect(normalise(5, 5, 5, true)).toBe(0);
  });

  it('log-normalises so the cloud is not all in one corner', () => {
    const linear = normalise(100, 1, 10_000);
    const log = normalise(100, 1, 10_000, true);
    expect(linear).toBeLessThan(-0.9);
    expect(log).toBeCloseTo(0, 6);
  });
});

describe('buildHyperData', () => {
  const january = Date.UTC(2026, 0, 1);
  const february = Date.UTC(2026, 1, 1);
  const grid: GridCell[] = [
    { startMs: january, category: 'food', count: 3, principalCents: 900, basisCents: 850 },
    { startMs: january, category: 'rent', count: 1, principalCents: 5_000, basisCents: 4_800 },
    { startMs: february, category: 'food', count: 12, principalCents: 4_000, basisCents: 3_000 },
  ];
  const frame = buildGrid(grid);
  const data = buildHyperData(frame, DEBT_EPOCH_MS + 86_400_000);

  it('drops empty cells rather than plotting them at the origin', () => {
    // A point at the centre of the tesseract asserts "a thing is here, of
    // average everything", which is the opposite of what an empty bucket means.
    expect(data).toHaveLength(3);
  });

  it('spreads each measure across the whole axis, not into one corner', () => {
    // Normalising money against an absolute floor of one cent put every point in
    // the top fifth of its axis — the buckets are all within an order of
    // magnitude of each other and none is anywhere near a cent — so the
    // tesseract held one clot and a lot of empty volume. Normalising against the
    // OBSERVED extent is what makes it a scatter plot.
    for (const measure of ['count', 'principal', 'accrued', 'average'] as const) {
      const values = data.map((datum) => datum.measures[measure]);
      expect(Math.min(...values)).toBeCloseTo(-1, 6);
      expect(Math.max(...values)).toBeCloseTo(1, 6);
    }
  });

  it('normalises the positional axes over the whole axis, not the occupied part', () => {
    // A month with nothing in it is still a month. Squeezing empty buckets out
    // of the time axis would make the spacing lie about when things happened.
    const times = data.map((datum) => datum.measures.time);
    expect(Math.min(...times)).toBe(-1);
    expect(Math.max(...times)).toBe(1);
  });

  it('keeps every measure inside the tesseract', () => {
    for (const datum of data) {
      for (const value of Object.values(datum.measures)) {
        expect(value).toBeGreaterThanOrEqual(-1.0001);
        expect(value).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('carries the palette slot so colour survives every rebinding', () => {
    const food = data.filter((datum) => datum.label.category === 'food');
    expect(new Set(food.map((datum) => datum.categoryIndex)).size).toBe(1);
  });

  it('binds axes by name, so switching one is a record read', () => {
    const point = toVec4(data[0]!, DEFAULT_BINDING);
    expect(point.x).toBe(data[0]!.measures[DEFAULT_BINDING.x]);
    expect(point.w).toBe(data[0]!.measures[DEFAULT_BINDING.w]);
  });

  it('compounds the accrued measure against the clock it is given', () => {
    const later = buildHyperData(frame, DEBT_EPOCH_MS + 400 * 86_400_000);
    expect(later[0]!.label.accruedCents).toBeGreaterThan(data[0]!.label.accruedCents);
  });
});
