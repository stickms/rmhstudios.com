import { describe, expect, it } from 'vitest';

import {
  BOLT,
  generateBolt,
  generateFizz,
  restrikeBolt,
  segmentCount,
  type BoltPath,
} from '../bolt';
import type { Point } from '../geometry';

const a: Point = { x: 10.3, y: 20.7 };
const b: Point = { x: 250.1, y: 90.9 };

/** Signed perpendicular distance of every main-channel point from the chord. */
function deviations(path: BoltPath, from: Point, to: Point): number[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const out: number[] = [];
  for (let i = 0; i < path.points.length; i += 2) {
    out.push(((path.points[i] - from.x) * -dy + (path.points[i + 1] - from.y) * dx) / len);
  }
  return out;
}

describe('generateBolt', () => {
  it('is deterministic: the same seed gives byte-identical arrays, another seed differs', () => {
    const one = generateBolt(a, b, { seed: 42 });
    const two = generateBolt(a, b, { seed: 42 });
    expect(Buffer.from(one.points.buffer)).toEqual(Buffer.from(two.points.buffer));
    expect(one.branches.length).toBe(two.branches.length);
    one.branches.forEach((br, i) =>
      expect(Buffer.from(br.points.buffer)).toEqual(Buffer.from(two.branches[i].points.buffer)),
    );
    const other = generateBolt(a, b, { seed: 43 });
    expect(Buffer.from(other.points.buffer)).not.toEqual(Buffer.from(one.points.buffer));
  });

  it('starts and ends exactly on the endpoints', () => {
    const p = generateBolt(a, b, { seed: 9 }).points;
    expect(p[0]).toBe(Math.fround(a.x));
    expect(p[1]).toBe(Math.fround(a.y));
    expect(p[p.length - 2]).toBe(Math.fround(b.x));
    expect(p[p.length - 1]).toBe(Math.fround(b.y));
  });

  it('never deviates more than 0.22·len from the chord, and stays inside its bbox', () => {
    for (let seed = 0; seed < 300; seed++) {
      const path = generateBolt(a, b, { seed });
      const cap = BOLT.maxDeviation * path.length;
      for (const d of deviations(path, a, b)) expect(Math.abs(d)).toBeLessThanOrEqual(cap + 1e-3);
      for (let i = 0; i < path.points.length; i += 2) {
        expect(path.points[i]).toBeGreaterThanOrEqual(path.bbox.x0);
        expect(path.points[i]).toBeLessThanOrEqual(path.bbox.x1);
      }
    }
  });

  it('keeps ≤ 64 segments and ≤ 3 branches of ≤ 16 segments over 1000 seeds', () => {
    let sawBranch = false;
    for (let seed = 0; seed < 1000; seed++) {
      const len = 20 + (seed % 9) * 120; // 20px … 1000px
      const end = { x: a.x + len, y: a.y + (seed % 5) * 10 };
      const path = generateBolt(a, end, { seed });
      expect(path.points.length / 2 - 1).toBeLessThanOrEqual(BOLT.maxSegments);
      expect(path.branches.length).toBeLessThanOrEqual(BOLT.maxBranches);
      for (const br of path.branches) {
        sawBranch = true;
        expect(br.points.length / 2 - 1).toBeLessThanOrEqual(BOLT.branchMaxSegments);
        expect(br.intensity).toBe(0.5);
      }
    }
    expect(sawBranch).toBe(true);
  });

  it('subdivides to ≤ 8px segments until the cap', () => {
    expect(segmentCount(8)).toBe(1);
    expect(segmentCount(60)).toBe(8);
    expect(segmentCount(64)).toBe(8);
    expect(segmentCount(65)).toBe(16);
    expect(segmentCount(10_000)).toBe(64);
  });

  it('can be generated without branches', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(generateBolt(a, b, { seed, branches: false }).branches).toEqual([]);
    }
  });
});

describe('restrikeBolt', () => {
  it('keeps 70% of the original displacement: same path, new detail', () => {
    for (let seed = 0; seed < 200; seed++) {
      const base = generateBolt(a, b, { seed });
      const again = restrikeBolt(base, a, b, 1);
      expect(again.offsets.length).toBe(base.offsets.length);
      const cap = BOLT.maxDeviation * base.length;
      let differs = false;
      for (let i = 0; i < base.offsets.length; i++) {
        // |y' − y| = 0.3·|fresh − y| ≤ 0.3·2·cap: within the 70% envelope of the original.
        expect(Math.abs(again.offsets[i] - base.offsets[i])).toBeLessThanOrEqual(
          0.3 * 2 * cap + 1e-3,
        );
        expect(Math.abs(again.offsets[i])).toBeLessThanOrEqual(cap + 1e-3);
        if (Math.abs(again.offsets[i] - base.offsets[i]) > 1e-3) differs = true;
      }
      expect(differs).toBe(true);
      expect(again.points[0]).toBe(base.points[0]);
      expect(again.points[again.points.length - 1]).toBe(base.points[base.points.length - 1]);
    }
  });

  it('is deterministic per k and differs between k', () => {
    const base = generateBolt(a, b, { seed: 5 });
    expect(Array.from(restrikeBolt(base, a, b, 1).points)).toEqual(
      Array.from(restrikeBolt(base, a, b, 1).points),
    );
    expect(Array.from(restrikeBolt(base, a, b, 2).points)).not.toEqual(
      Array.from(restrikeBolt(base, a, b, 1).points),
    );
  });
});

describe('generateFizz', () => {
  it('throws 3–5 short sparks outward within ±50° of the normal', () => {
    for (let seed = 0; seed < 200; seed++) {
      const origin = { x: 100, y: 100 };
      const sparks = generateFizz(origin, { x: 0, y: -1 }, seed);
      expect(sparks.length).toBeGreaterThanOrEqual(3);
      expect(sparks.length).toBeLessThanOrEqual(5);
      for (const s of sparks) {
        const segs = s.length / 2 - 1;
        expect(segs).toBeGreaterThanOrEqual(2);
        expect(segs).toBeLessThanOrEqual(3);
        expect(s[0]).toBe(100);
        const ex = s[s.length - 2] - 100;
        const ey = s[s.length - 1] - 100;
        const len = Math.hypot(ex, ey);
        expect(len).toBeGreaterThanOrEqual(8 - 1e-3);
        expect(len).toBeLessThanOrEqual(20 + 1e-3);
        const angle = (Math.acos(-ey / len) * 180) / Math.PI;
        expect(angle).toBeLessThanOrEqual(50 + 1e-3);
      }
    }
    expect(generateFizz({ x: 0, y: 0 }, { x: 1, y: 0 }, 1, 2)).toHaveLength(2);
  });
});
