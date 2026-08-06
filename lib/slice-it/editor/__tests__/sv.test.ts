/**
 * Scroll velocity (§4.2, `G10`).
 *
 * The first test is the one that matters: notes either side of an SV change
 * must keep their order. The naive "multiply the note's distance by the SV at
 * its own time" implementation passes every other test in this file and fails
 * that one, which is why it is written as an explicit property rather than left
 * to be inferred from the arithmetic.
 */

import { describe, it, expect } from 'vitest';
import {
  buildSvTable,
  scrollDistance,
  scrollOffset,
  svAt,
  timeAtScroll,
  withSvPoint,
  withoutSvPoint,
} from '../sv';

describe('scroll velocity', () => {
  it('is the identity for a chart with no markers', () => {
    const table = buildSvTable([]);
    expect(scrollDistance(table, 0)).toBe(0);
    expect(scrollDistance(table, 12.5)).toBeCloseTo(12.5, 9);
    expect(svAt(table, 100)).toBe(1);
  });

  it('integrates, so notes either side of a change never swap', () => {
    const table = buildSvTable([{ time: 10, multiplier: 0.5 }]);
    const before = scrollOffset(table, 9.9, 0);
    const after = scrollOffset(table, 10.1, 0);
    // The naive multiply gives 9.9 and 5.05 — the later note drawn nearer.
    expect(after).toBeGreaterThan(before);
    expect(before).toBeCloseTo(9.9, 9);
    expect(after).toBeCloseTo(10.05, 9);
  });

  it('stays strictly increasing across many markers', () => {
    const table = buildSvTable([
      { time: 5, multiplier: 4 },
      { time: 7, multiplier: 0.25 },
      { time: 9, multiplier: 2 },
      { time: 12, multiplier: 0.1 },
    ]);
    let previous = -Infinity;
    for (let time = 0; time <= 20; time += 0.05) {
      const distance = scrollDistance(table, time);
      expect(distance).toBeGreaterThan(previous);
      previous = distance;
    }
  });

  it('accumulates each segment at its own rate', () => {
    const table = buildSvTable([
      { time: 2, multiplier: 2 },
      { time: 4, multiplier: 0.5 },
    ]);
    // 0–2 at 1×, 2–4 at 2×, then 0.5×.
    expect(scrollDistance(table, 2)).toBeCloseTo(2, 9);
    expect(scrollDistance(table, 4)).toBeCloseTo(6, 9);
    expect(scrollDistance(table, 6)).toBeCloseTo(7, 9);
    expect(svAt(table, 3)).toBe(2);
    expect(svAt(table, 5)).toBe(0.5);
  });

  it('inverts exactly, so a click maps back to the time it points at', () => {
    const table = buildSvTable([
      { time: 3, multiplier: 3 },
      { time: 8, multiplier: 0.4 },
    ]);
    for (const time of [0, 1.5, 3, 5.25, 8, 11.75]) {
      expect(timeAtScroll(table, scrollDistance(table, time))).toBeCloseTo(time, 9);
    }
  });

  it('sorts, clamps and de-duplicates whatever the column holds', () => {
    const table = buildSvTable([
      { time: 9, multiplier: 999 },
      { time: 4, multiplier: -3 },
      { time: 4, multiplier: 2 },
    ]);
    expect(svAt(table, 5)).toBe(2);
    expect(svAt(table, 10)).toBe(8);
    // Still monotonic despite the input being out of order.
    expect(scrollDistance(table, 10)).toBeGreaterThan(scrollDistance(table, 9));
  });

  it('treats a marker at t=0 as the opening rate rather than a second segment', () => {
    const table = buildSvTable([{ time: 0, multiplier: 2 }]);
    expect(scrollDistance(table, 3)).toBeCloseTo(6, 9);
  });

  it('edits markers by time', () => {
    const points = withSvPoint([], { time: 4, multiplier: 2 });
    expect(points).toEqual([{ time: 4, multiplier: 2 }]);
    expect(withSvPoint(points, { time: 4, multiplier: 3 })).toEqual([{ time: 4, multiplier: 3 }]);
    expect(withoutSvPoint(points, 4)).toEqual([]);
  });
});
