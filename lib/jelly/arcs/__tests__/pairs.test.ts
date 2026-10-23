import { describe, expect, it } from 'vitest';

import { roundedRectGap, type RoundedRect } from '../geometry';
import { buildPairs, clickTargets, nearestRimWithin, selectCandidates } from '../pairs';
import { ARC_BUDGET, pairRate } from '../rate';
import { mulberry32 } from '../rng';

const box = (x: number, y: number, w = 100, h = 40, r = 8): RoundedRect => ({ x, y, w, h, r });

/** O(n²) reference for the spatial hash. */
function bruteForce(rects: RoundedRect[], maxGap = ARC_BUDGET.maxGap): Set<string> {
  const out = new Set<string>();
  for (let a = 0; a < rects.length; a++) {
    for (let b = a + 1; b < rects.length; b++) {
      const gap = roundedRectGap(rects[a], rects[b]);
      if (gap > 0 && gap <= maxGap) out.add(`${a}-${b}`);
    }
  }
  return out;
}

describe('buildPairs', () => {
  it('finds exactly the pairs a brute-force scan finds (no misses across cells)', () => {
    const rand = mulberry32(17);
    for (let trial = 0; trial < 20; trial++) {
      const rects = Array.from({ length: 40 }, () =>
        box(rand() * 1600, rand() * 1200, 24 + rand() * 300, 24 + rand() * 200, rand() * 24),
      );
      const pairs = buildPairs(rects, { maxPerElement: Infinity });
      const got = new Set(pairs.map((p) => `${p.a}-${p.b}`));
      expect(got).toEqual(bruteForce(rects));
    }
  });

  it('excludes overlapping, nested and out-of-range pairs', () => {
    const rects = [
      box(0, 0, 400, 300), // 0: a pane
      box(20, 20), // 1: nested in 0
      box(140, 20), // 2: nested in 0, 20px from 1
      box(700, 0), // 3: 300px from 0
      box(60, 30), // 4: overlaps 1
    ];
    const pairs = buildPairs(rects);
    const keys = pairs.map((p) => `${p.a}-${p.b}`);
    expect(keys).toContain('1-2');
    expect(keys).not.toContain('0-1');
    expect(keys).not.toContain('0-2');
    expect(keys).not.toContain('1-4');
    expect(keys).not.toContain('0-3');
    for (const p of pairs) {
      expect(p.gap).toBeGreaterThan(0);
      expect(p.gap).toBeLessThanOrEqual(ARC_BUDGET.maxGap);
      expect(p.rate).toBeCloseTo(pairRate(p.gap), 12);
    }
  });

  it('honours a caller nesting check (overflowing children)', () => {
    const rects = [box(0, 0), box(130, 0)];
    expect(buildPairs(rects)).toHaveLength(1);
    expect(buildPairs(rects, { nested: () => true })).toHaveLength(0);
  });

  it('keeps at most 12 nearest pairs per element', () => {
    // A dense grid: every element has many neighbours in range.
    const rects: RoundedRect[] = [];
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 10; j++) rects.push(box(i * 60, j * 40, 48, 28, 6));
    const pairs = buildPairs(rects);
    const count = new Map<number, number>();
    for (const p of pairs) {
      count.set(p.a, (count.get(p.a) ?? 0) + 1);
      count.set(p.b, (count.get(p.b) ?? 0) + 1);
    }
    for (const c of count.values()) expect(c).toBeLessThanOrEqual(ARC_BUDGET.maxPairsPerElement);
    // Nearest first: the tightest gap in the grid is kept.
    expect(Math.min(...pairs.map((p) => p.gap))).toBeCloseTo(12, 6);
  });

  it('is deterministic and ignores empty rects', () => {
    const rects = [box(0, 0), box(130, 0), box(0, 0, 0, 0), box(0, 70)];
    expect(buildPairs(rects)).toEqual(buildPairs(rects));
    for (const p of buildPairs(rects)) expect([p.a, p.b]).not.toContain(2);
  });
});

describe('selectCandidates', () => {
  it('keeps ≥ 24px visible rects, nearest the viewport centre, at most max', () => {
    const rects = [
      box(500, 380), // near centre
      box(0, 0, 20, 40), // too narrow
      box(-200, 0), // off-screen
      box(10, 10), // far corner
      box(450, 300),
    ];
    expect(selectCandidates(rects, { w: 1200, h: 800 })).toEqual([0, 4, 3]);
    expect(selectCandidates(rects, { w: 1200, h: 800 }, 2)).toEqual([0, 4]);
  });
});

describe('clickTargets / nearestRimWithin', () => {
  it('lists in-range neighbours nearest first, skipping overlap and the source', () => {
    const rects = [box(0, 0), box(130, 0), box(0, 100), box(400, 0), box(10, 10, 20, 20)];
    expect(clickTargets(0, rects).map((t) => t.index)).toEqual([1, 2]);
    expect(clickTargets(0, rects, 400).map((t) => t.index)).toEqual([1, 2, 3]);
    expect(clickTargets(9, rects)).toEqual([]);
  });

  it('finds the nearest rim within 90px of a press outside every element', () => {
    const rects = [box(0, 0), box(300, 0)];
    const hit = nearestRimWithin({ x: 150, y: 20 }, rects)!;
    expect(hit.index).toBe(0);
    expect(hit.rim.distance).toBeCloseTo(50, 10);
    expect(nearestRimWithin({ x: 200, y: 200 }, rects)).toBeNull();
    expect(nearestRimWithin({ x: 50, y: 20 }, rects)).toBeNull(); // inside: not a discharge
  });
});
