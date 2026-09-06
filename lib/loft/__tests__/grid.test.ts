/**
 * The shared loft. Everything drawn as glass over a cage on this site comes
 * through here, so a mistake in it is a mistake in a car body AND in a coat.
 *
 * The failure these guard against is specific and silent: one NaN anywhere in a
 * position buffer takes the whole object off screen, with no error, in the one
 * environment (a real GPU) where nobody is watching a console.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAMPLES,
  loft,
  mergeGrids,
  monotoneSpline,
  signedPow,
  type LoftStation,
} from '../grid';

const station = (overrides: Partial<LoftStation> = {}): LoftStation => ({
  centre: [0, 0, 0],
  right: [0, 0, 1],
  up: [0, 1, 0],
  halfRight: 1,
  halfUp: 1,
  round: 2,
  crown: 0,
  ...overrides,
});

/** A closed tube with a pole at each end — the shape a car and a hat share. */
function capsule(count = 12): LoftStation[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const pole = i === 0 || i === count - 1;
    return station({
      centre: [t * 4 - 2, 0, 0],
      halfRight: pole ? 0 : Math.sin(t * Math.PI) * 0.8,
      halfUp: pole ? 0 : Math.sin(t * Math.PI) * 0.5,
    });
  });
}

describe('monotone interpolation', () => {
  it('passes exactly through every knot', () => {
    const xs = [0, 0.25, 0.6, 1];
    const ys = [1, 4, 2, 3];
    const f = monotoneSpline(xs, ys);
    for (let i = 0; i < xs.length; i++) expect(f(xs[i])).toBeCloseTo(ys[i], 10);
  });

  it('never overshoots a knot — the reason it is not a Catmull-Rom', () => {
    // A peak in the middle: a cubic that ignores monotonicity sails past 4 on
    // its way in, and the widest point of a shape becomes a number nobody wrote.
    const f = monotoneSpline([0, 0.5, 1], [1, 4, 1]);
    for (let i = 0; i <= 200; i++) {
      const v = f(i / 200);
      expect(v).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(v).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  it('clamps outside its range rather than extrapolating', () => {
    const f = monotoneSpline([0, 1], [2, 5]);
    expect(f(-3)).toBe(2);
    expect(f(9)).toBe(5);
  });

  it('survives degenerate inputs', () => {
    expect(monotoneSpline([], [])(0.5)).toBe(0);
    expect(monotoneSpline([0.3], [7])(0.5)).toBe(7);
  });
});

describe('signedPow', () => {
  it('keeps the sign a bare Math.pow would turn into NaN', () => {
    expect(signedPow(-0.5, 0.5)).toBeCloseTo(-Math.sqrt(0.5), 12);
    expect(Number.isNaN(signedPow(-0.5, 0.5))).toBe(false);
    expect(signedPow(0, 0.5)).toBe(0);
  });
});

describe('the loft', () => {
  it('refuses shapes it cannot build', () => {
    expect(() => loft([station()])).toThrow(/two stations/);
    expect(() => loft(capsule(), { samples: 18 })).toThrow(/divisible by four/);
  });

  it('produces finite geometry with outward unit normals', () => {
    const grid = loft(capsule());
    expect(grid.samples).toBe(DEFAULT_SAMPLES);
    expect(grid.positions).toHaveLength(grid.stations * grid.samples * 3);
    for (const v of grid.positions) expect(Number.isFinite(v)).toBe(true);
    for (const r of grid.radii) expect(r).toBeGreaterThan(0);

    for (let v = 0; v < grid.radii.length; v++) {
      const i = v * 3;
      expect(Math.hypot(grid.normals[i], grid.normals[i + 1], grid.normals[i + 2])).toBeCloseTo(
        1,
        5,
      );
      // Outward is what a ripple pushes along, so a flipped normal is a dent.
      const facing =
        grid.normals[i] * grid.rays[i] +
        grid.normals[i + 1] * grid.rays[i + 1] +
        grid.normals[i + 2] * grid.rays[i + 2];
      expect(facing).toBeGreaterThan(0);
    }
  });

  it('collapses a zero-radius station to a single point — a pole', () => {
    const grid = loft(capsule());
    const first = [grid.positions[0], grid.positions[1], grid.positions[2]];
    for (let r = 1; r < grid.samples; r++) {
      const i = r * 3;
      expect(grid.positions[i]).toBeCloseTo(first[0], 6);
      expect(grid.positions[i + 1]).toBeCloseTo(first[1], 6);
      expect(grid.positions[i + 2]).toBeCloseTo(first[2], 6);
    }
  });

  it('indexes only vertices that exist, and draws four major lines', () => {
    const grid = loft(capsule());
    const count = grid.radii.length;
    for (const list of [grid.indices, grid.cage.minor, grid.cage.parallel, grid.cage.major]) {
      expect(list.length).toBeGreaterThan(0);
      for (const index of list) expect(index).toBeLessThan(count);
    }
    expect(grid.indices.length % 3).toBe(0);
    for (const list of [grid.cage.minor, grid.cage.parallel, grid.cage.major]) {
      expect(list.length % 2).toBe(0);
    }
    const used = new Set<number>();
    for (const index of grid.cage.major) used.add(index % grid.samples);
    expect([...used].sort((a, b) => a - b)).toEqual([
      0,
      grid.samples / 4,
      grid.samples / 2,
      (3 * grid.samples) / 4,
    ]);
  });

  it('honours the frame it is given, so a section stands where it is told', () => {
    // Same section, rotated frame: the surface must rotate with it.
    const flat = loft([
      station({ centre: [0, 0, 0], halfRight: 1, halfUp: 0.2 }),
      station({ centre: [1, 0, 0], halfRight: 1, halfUp: 0.2 }),
    ]);
    const turned = loft([
      station({ centre: [0, 0, 0], right: [0, 1, 0], up: [0, 0, -1], halfRight: 1, halfUp: 0.2 }),
      station({ centre: [1, 0, 0], right: [0, 1, 0], up: [0, 0, -1], halfRight: 1, halfUp: 0.2 }),
    ]);
    // The wide axis is z when right is +z, and y once right is +y.
    expect(flat.half[2]).toBeCloseTo(1, 6);
    expect(turned.half[1]).toBeCloseTo(1, 6);
  });

  it('measures rays from a shared origin, so two lofts ripple as one surface', () => {
    // The point every loft has in common must get the same ray from both, or a
    // poke would cross a body and its clothes as two unrelated waves.
    const origin: [number, number, number] = [0, 5, 0];
    const a = loft(capsule(), { rayOrigin: origin });
    const b = loft(capsule(), { rayOrigin: origin });
    for (let i = 0; i < 30; i++) expect(a.rays[i]).toBeCloseTo(b.rays[i], 12);
    // Tolerances below are float32-sized on purpose: these are Float32Arrays,
    // so ~7 significant digits is all the storage has to give.
    // And the ray really is measured from the origin, not from the bounding box.
    const i0 = 0;
    const dx = a.positions[i0] - origin[0];
    const dy = a.positions[i0 + 1] - origin[1];
    const dz = a.positions[i0 + 2] - origin[2];
    const len = Math.hypot(dx, dy, dz);
    expect(a.rays[i0]).toBeCloseTo(dx / len, 6);
    expect(a.radii[0]).toBeCloseTo(len, 6);
  });

  it('tapers the crown without touching the waist', () => {
    const plain = loft([station({ centre: [0, 0, 0] }), station({ centre: [1, 0, 0] })]);
    const tapered = loft([
      station({ centre: [0, 0, 0], crown: 0.5 }),
      station({ centre: [1, 0, 0], crown: 0.5 }),
    ]);
    // Sample 0 is the waist and samples/4 is the crown.
    const waist = (g: typeof plain, s: number) => Math.abs(g.positions[s * 3 + 2]);
    expect(waist(tapered, 0)).toBeCloseTo(waist(plain, 0), 6);
    expect(waist(tapered, plain.samples / 4)).toBeLessThan(waist(plain, plain.samples / 4) + 1e-9);
    expect(tapered.half[2]).toBeLessThanOrEqual(plain.half[2] + 1e-9);
  });
});

describe('merging', () => {
  it('keeps every vertex and re-bases every index', () => {
    const a = loft(capsule(6));
    const b = loft(capsule(8));
    const merged = mergeGrids([a, b])!;
    expect(merged.radii.length).toBe(a.radii.length + b.radii.length);
    expect(merged.indices.length).toBe(a.indices.length + b.indices.length);
    for (const index of merged.indices) expect(index).toBeLessThan(merged.radii.length);
    for (const tier of ['major', 'parallel', 'minor'] as const) {
      expect(merged.cage[tier].length).toBe(a.cage[tier].length + b.cage[tier].length);
      for (const index of merged.cage[tier]) expect(index).toBeLessThan(merged.radii.length);
    }
    // The second grid's triangles must point at the second grid's vertices.
    const offset = a.radii.length;
    expect(merged.indices[a.indices.length]).toBe(b.indices[0] + offset);
  });

  it('carries the ray fields through, so a merge cannot re-origin a wave', () => {
    const origin: [number, number, number] = [0, 9, 0];
    const a = loft(capsule(6), { rayOrigin: origin });
    const merged = mergeGrids([a, loft(capsule(8), { rayOrigin: origin })])!;
    for (let i = 0; i < 12; i++) expect(merged.rays[i]).toBeCloseTo(a.rays[i], 12);
  });

  it('is a no-op on one grid and null on none', () => {
    const a = loft(capsule());
    expect(mergeGrids([a])).toBe(a);
    expect(mergeGrids([])).toBeNull();
  });
});
