import { describe, expect, it } from 'vitest';
import { boxPoints, convexHull, hullPlanes } from './convex';

function insideAll(
  planes: Float64Array,
  count: number,
  x: number,
  y: number,
  z: number,
  eps = 1e-6,
): boolean {
  for (let i = 0; i < count; i++) {
    if (planes[i * 4] * x + planes[i * 4 + 1] * y + planes[i * 4 + 2] * z - planes[i * 4 + 3] > eps)
      return false;
  }
  return true;
}

describe('convexHull / hullPlanes', () => {
  it('reduces a cube with interior points to 6 face planes (+ no extra axial bevels)', () => {
    const pts = [
      ...boxPoints({ x: -1, y: -2, z: -3 }, { x: 1, y: 2, z: 3 }),
      0,
      0,
      0,
      0.5,
      0.5,
      0.5,
      0,
      0,
      2.9,
    ];
    const hull = convexHull(pts)!;
    expect(hull.points.length / 3).toBe(8);
    expect(hull.triangles.length / 3).toBe(12);
    const ps = hullPlanes(hull);
    const faces = [...ps.bevel].filter((b) => b === 0).length;
    expect(faces).toBe(6);
    // Axis-aligned box: every edge is axial, so no bevels are needed.
    expect(ps.count).toBe(6);
    expect(insideAll(ps.planes, ps.count, 0.99, 1.99, 2.99)).toBe(true);
    expect(insideAll(ps.planes, ps.count, 1.01, 0, 0)).toBe(false);
  });

  it('contains every input point and adds axial + edge bevels for a rotated shape', () => {
    // A tetrahedron-ish random cloud, deterministic.
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const pts: number[] = [];
    for (let i = 0; i < 200; i++) {
      const x = rnd();
      const y = rnd();
      const z = rnd();
      if (x + y + z < 0.5) pts.push(x * 30, y * 30, z * 30);
    }
    const hull = convexHull(pts)!;
    expect(hull).not.toBeNull();
    const ps = hullPlanes(hull);
    for (let i = 0; i < pts.length; i += 3)
      expect(insideAll(ps.planes, ps.count, pts[i], pts[i + 1], pts[i + 2], 1e-6)).toBe(true);
    // Axial bevels are present (six planes with unit-axis normals).
    let axial = 0;
    for (let i = 0; i < ps.count; i++) {
      const n = [ps.planes[i * 4], ps.planes[i * 4 + 1], ps.planes[i * 4 + 2]];
      if (n.filter((c) => Math.abs(c) === 1).length === 1) axial++;
    }
    expect(axial).toBeGreaterThanOrEqual(6);
    expect([...ps.bevel].some((b) => b === 1)).toBe(true);
    // Normals are unit length.
    for (let i = 0; i < ps.count; i++) {
      expect(Math.hypot(ps.planes[i * 4], ps.planes[i * 4 + 1], ps.planes[i * 4 + 2])).toBeCloseTo(
        1,
        9,
      );
    }
  });

  it('returns null for degenerate input', () => {
    expect(convexHull([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0])).toBeNull(); // a line
    expect(convexHull([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0])).toBeNull(); // a square
    expect(convexHull([0, 0, 0])).toBeNull();
  });
});
