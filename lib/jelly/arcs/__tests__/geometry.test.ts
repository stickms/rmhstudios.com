import { describe, expect, it } from 'vitest';

import {
  clampRadius,
  closestRimPoints,
  coreRect,
  pointToRoundedRect,
  rectContains,
  roundedRectGap,
  type Point,
  type RoundedRect,
} from '../geometry';
import { mulberry32 } from '../rng';

/** Distance from a point to a rounded rect's core: equals r exactly when the point is on the rim. */
function coreDistance(p: Point, rr: RoundedRect): number {
  const c = coreRect(rr);
  const qx = Math.max(c.x, Math.min(c.x + c.w, p.x));
  const qy = Math.max(c.y, Math.min(c.y + c.h, p.y));
  return Math.hypot(p.x - qx, p.y - qy);
}

const A: RoundedRect = { x: 0, y: 0, w: 100, h: 40, r: 8 };

describe('roundedRectGap / closestRimPoints', () => {
  it('horizontal separation: the gap is the edge gap and the arc is straight', () => {
    const B = { x: 130, y: 10, w: 60, h: 40, r: 8 };
    expect(roundedRectGap(A, B)).toBeCloseTo(30, 10);
    const c = closestRimPoints(A, B)!;
    expect(c.gap).toBeCloseTo(30, 10);
    expect(c.a.x).toBeCloseTo(100, 10);
    expect(c.b.x).toBeCloseTo(130, 10);
    expect(c.a.y).toBeCloseTo(c.b.y, 10);
    expect(c.na).toEqual({ x: 1, y: 0 });
    expect(c.nb).toEqual({ x: -1, y: -0 });
  });

  it('vertical separation', () => {
    const B = { x: 20, y: 64, w: 40, h: 30, r: 4 };
    expect(roundedRectGap(A, B)).toBeCloseTo(24, 10);
    const c = closestRimPoints(A, B)!;
    expect(c.a.y).toBeCloseTo(40, 10);
    expect(c.b.y).toBeCloseTo(64, 10);
  });

  it('diagonal separation: hypot between core corners minus both radii', () => {
    const B = { x: 150, y: 90, w: 50, h: 50, r: 10 };
    const dx = 150 + 10 - (100 - 8);
    const dy = 90 + 10 - (40 - 8);
    expect(roundedRectGap(A, B)).toBeCloseTo(Math.hypot(dx, dy) - 8 - 10, 10);
    const c = closestRimPoints(A, B)!;
    expect(coreDistance(c.a, A)).toBeCloseTo(8, 6);
    expect(coreDistance(c.b, B)).toBeCloseTo(10, 6);
  });

  it('endpoints lie on each rim to 1e-6 for many random layouts', () => {
    const rand = mulberry32(7);
    for (let k = 0; k < 500; k++) {
      const a = {
        x: rand() * 400,
        y: rand() * 400,
        w: 10 + rand() * 200,
        h: 10 + rand() * 120,
        r: rand() * 40,
      };
      const b = {
        x: rand() * 400,
        y: rand() * 400,
        w: 10 + rand() * 200,
        h: 10 + rand() * 120,
        r: rand() * 40,
      };
      const c = closestRimPoints(a, b, rand);
      if (!c) {
        expect(roundedRectGap(a, b)).toBeLessThanOrEqual(1e-9);
        continue;
      }
      expect(coreDistance(c.a, a)).toBeCloseTo(clampRadius(a), 6);
      expect(coreDistance(c.b, b)).toBeCloseTo(clampRadius(b), 6);
      expect(Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y)).toBeCloseTo(c.gap, 6);
      expect(Math.hypot(c.na.x, c.na.y)).toBeCloseTo(1, 10);
    }
  });

  it('is symmetric under swapping A and B (endpoints swap)', () => {
    const B = { x: 140, y: -30, w: 70, h: 120, r: 12 };
    const ab = closestRimPoints(A, B, mulberry32(3))!;
    const ba = closestRimPoints(B, A, mulberry32(3))!;
    expect(ba.a.x).toBeCloseTo(ab.b.x, 10);
    expect(ba.a.y).toBeCloseTo(ab.b.y, 10);
    expect(ba.b.x).toBeCloseTo(ab.a.x, 10);
    expect(ba.b.y).toBeCloseTo(ab.a.y, 10);
    expect(ba.gap).toBeCloseTo(ab.gap, 10);
  });

  it('overlapping and nested rects give null', () => {
    expect(closestRimPoints(A, { x: 50, y: 10, w: 100, h: 40, r: 4 })).toBeNull();
    expect(closestRimPoints(A, { x: 10, y: 10, w: 20, h: 10, r: 2 })).toBeNull();
    expect(closestRimPoints(A, A)).toBeNull();
    // Corner discs not quite touching across a diagonal still count by the rim, not the box.
    const corner = { x: 102, y: 42, w: 40, h: 40, r: 20 };
    expect(roundedRectGap(A, corner)).toBeGreaterThan(0);
    expect(closestRimPoints(A, corner)).not.toBeNull();
  });

  it('clamps the radius to half the short side, so pills work', () => {
    const pill = { x: 0, y: 0, w: 120, h: 30, r: 999 };
    expect(clampRadius(pill)).toBe(15);
    expect(coreRect(pill)).toMatchObject({ x: 15, y: 15, w: 90, h: 0 });
    const other = { x: 0, y: 60, w: 120, h: 30, r: 999 };
    const c = closestRimPoints(pill, other)!;
    expect(c.gap).toBeCloseTo(30, 10);
    expect(clampRadius({ x: 0, y: 0, w: 10, h: 10, r: -3 })).toBe(0);
  });

  it('jitters the landing point only within the facing overlap', () => {
    const B = { x: 130, y: 20, w: 60, h: 60, r: 6 };
    // Core y intervals: A [8, 32], B [26, 74] → overlap [26, 32].
    const rand = mulberry32(11);
    const ys = new Set<number>();
    for (let k = 0; k < 200; k++) {
      const c = closestRimPoints(A, B, rand)!;
      expect(c.a.y).toBeGreaterThanOrEqual(26 - 1e-9);
      expect(c.a.y).toBeLessThanOrEqual(32 + 1e-9);
      ys.add(Math.round(c.a.y * 10));
    }
    expect(ys.size).toBeGreaterThan(5);
  });
});

describe('pointToRoundedRect', () => {
  it('handles a point outside a straight edge', () => {
    const r = pointToRoundedRect({ x: 50, y: -20 }, A);
    expect(r.point).toEqual({ x: 50, y: 0 });
    expect(r.normal).toEqual({ x: 0, y: -1 });
    expect(r.distance).toBeCloseTo(20, 10);
  });

  it('handles a point beyond a corner arc', () => {
    const r = pointToRoundedRect({ x: 120, y: 60 }, A);
    expect(coreDistance(r.point, A)).toBeCloseTo(8, 10);
    expect(r.normal.x).toBeGreaterThan(0);
    expect(r.normal.y).toBeGreaterThan(0);
    expect(r.distance).toBeCloseTo(Math.hypot(120 - 92, 60 - 32) - 8, 10);
  });

  it('handles a point inside, leaving through the nearest side', () => {
    const r = pointToRoundedRect({ x: 95, y: 20 }, A);
    expect(r.normal).toEqual({ x: 1, y: 0 });
    expect(r.point.x).toBeCloseTo(100, 10);
    expect(r.distance).toBeCloseTo(-5, 10);
    const inBand = pointToRoundedRect({ x: 50, y: 2 }, A); // inside the radius band above the core
    expect(inBand.distance).toBeCloseTo(-2, 10);
  });

  it('rectContains detects nesting', () => {
    expect(rectContains(A, { x: 10, y: 10, w: 20, h: 10 })).toBe(true);
    expect(rectContains(A, { x: 90, y: 10, w: 20, h: 10 })).toBe(false);
  });
});
