/**
 * G2, G4, G6 and M4 — the wider note vocabulary.
 *
 * Every one of these is opt-in per chart, and the tests that matter are the
 * ones asserting the default is unchanged: every chart in the database is
 * 2-key, undirected and roll-free, and none of this may change a note anybody
 * has already played.
 */

import { describe, expect, it } from 'vitest';
import {
  CHART_RATES,
  KEY_COUNTS,
  ROLL_HIT_POINTS,
  ROLL_TARGET_HPS,
  SWIPE_DEAD_ZONE_PX,
  assignLane,
  chartRateMultiplier,
  directionOf,
  foldToKeys,
  isChartRate,
  isKeyCount,
  isRollRegion,
  keyCountOf,
  retime,
  satisfiesDirection,
  scoreRoll,
} from '../note-vocab';
import type { Slice } from '../types';

const note = (id: string, time: number, lane: number, duration?: number): Slice => ({
  id,
  time,
  lane,
  type: duration === undefined ? 'STANDARD' : 'LONG',
  ...(duration === undefined ? {} : { duration }),
});

describe('G2 — lane count', () => {
  it('defaults to 2, which is every chart that exists', () => {
    expect(keyCountOf(undefined)).toBe(2);
    expect(keyCountOf(3)).toBe(2);
    expect(keyCountOf('4')).toBe(2);
    expect(keyCountOf(4)).toBe(4);
    expect(isKeyCount(2)).toBe(true);
    expect(isKeyCount(5)).toBe(false);
  });

  it('reproduces the existing binary rule at 2 keys', () => {
    // The generalisation is only safe if a 2-key chart generated through it is
    // the chart that was generated before: bass low, bright high.
    expect(assignLane(60, 2)).toBe(0);
    expect(assignLane(8000, 2)).toBe(1);
  });

  it('splits log-spaced, not linearly', () => {
    // A linear 4-key split at 2750/5500/8250 Hz puts every drum and bass note
    // in lane 0 and leaves lanes 2 and 3 for cymbals.
    const lanes = [80, 400, 2000, 9000].map((hz) => assignLane(hz, 4));
    expect(new Set(lanes).size).toBe(4);
    for (let i = 1; i < lanes.length; i++) expect(lanes[i]).toBeGreaterThan(lanes[i - 1]);
  });

  it('stays in range for absurd input', () => {
    for (const keys of KEY_COUNTS) {
      for (const hz of [0, -100, 1e9, NaN]) {
        const lane = assignLane(hz, keys);
        expect(lane).toBeGreaterThanOrEqual(0);
        expect(lane).toBeLessThan(keys);
      }
    }
  });

  it('folds a 4-key chart onto 2 lanes by position', () => {
    // Round-robin would turn an alternating stream into a jack.
    const four = [note('a', 0, 0), note('b', 1, 1), note('c', 2, 2), note('d', 3, 3)];
    expect(foldToKeys(four, 4, 2).map((n) => n.lane)).toEqual([0, 0, 1, 1]);
  });

  it('leaves a chart alone when the target is not narrower', () => {
    const two = [note('a', 0, 0), note('b', 1, 1)];
    expect(foldToKeys(two, 2, 2).map((n) => n.lane)).toEqual([0, 1]);
    expect(foldToKeys(two, 2, 4).map((n) => n.lane)).toEqual([0, 1]);
  });

  it('copies rather than mutating the chart it was given', () => {
    const four = [note('a', 0, 3)];
    foldToKeys(four, 4, 2);
    expect(four[0].lane).toBe(3);
  });
});

describe('G4 — directional slices', () => {
  it('reads a swipe past the dead zone', () => {
    expect(directionOf(50, 0)).toBe('right');
    expect(directionOf(-50, 0)).toBe('left');
    expect(directionOf(0, 50)).toBe('down');
    expect(directionOf(0, -50)).toBe('up');
  });

  it('calls anything inside the dead zone a tap', () => {
    // Reading a jittery tap as a swipe turns every touch player's normal input
    // into a random wrong-direction penalty.
    expect(directionOf(0, 0)).toBeUndefined();
    expect(directionOf(SWIPE_DEAD_ZONE_PX - 1, 0)).toBeUndefined();
  });

  it('accepts anything on an undirected note', () => {
    expect(satisfiesDirection(undefined, undefined)).toBe(true);
    expect(satisfiesDirection(undefined, 'left')).toBe(true);
  });

  it('accepts a directionless input on a directed note', () => {
    // A keyboard cannot express direction, and a directed chart that is
    // unplayable on a keyboard is one most of the player base cannot open.
    expect(satisfiesDirection('left', undefined)).toBe(true);
  });

  it('rejects the wrong direction from a device that can express one', () => {
    expect(satisfiesDirection('left', 'right')).toBe(false);
    expect(satisfiesDirection('left', 'left')).toBe(true);
  });
});

describe('G6 — rolls', () => {
  it('scores on rate, not on individual timing', () => {
    // Judging hits individually would make a roll a fast stream with a
    // different colour.
    const full = scoreRoll(ROLL_TARGET_HPS * 2, 2);
    expect(full.fill).toBe(1);
    expect(full.points).toBe(ROLL_TARGET_HPS * 2 * ROLL_HIT_POINTS);
  });

  it('caps credit at the target rate', () => {
    // Without the cap the optimal play is a turbo controller: an input a human
    // cannot produce would outscore one they can.
    const human = scoreRoll(ROLL_TARGET_HPS * 2, 2);
    const turbo = scoreRoll(ROLL_TARGET_HPS * 40, 2);
    expect(turbo.points).toBe(human.points);
    expect(turbo.fill).toBe(1);
    // The raw count is still reported, so telemetry can see the autofire.
    expect(turbo.hits).toBe(ROLL_TARGET_HPS * 40);
  });

  it('gives partial credit for a partial roll', () => {
    const half = scoreRoll(ROLL_TARGET_HPS, 2);
    expect(half.fill).toBeCloseTo(0.5, 5);
  });

  it('scores nothing for no hits, and survives a zero window', () => {
    expect(scoreRoll(0, 2)).toMatchObject({ fill: 0, points: 0 });
    expect(scoreRoll(5, 0).points).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(scoreRoll(5, 0).fill)).toBe(true);
  });

  it('recognises a dense sustained region and nothing shorter', () => {
    const roll = Array.from({ length: 20 }, (_, i) => i * 0.06);
    expect(isRollRegion(roll, 0.5)).toBe(true);
    // Long enough but too sparse — that is a stream.
    expect(isRollRegion([0, 0.5, 1, 1.5, 2, 2.5], 0.5)).toBe(false);
    // Dense but too short — that is a burst.
    expect(isRollRegion([0, 0.05, 0.1, 0.15, 0.2], 0.5)).toBe(false);
    expect(isRollRegion([], 0.5)).toBe(false);
  });
});

describe('M4 — chart-level double time', () => {
  it('accepts only the declared rates', () => {
    expect(isChartRate(1.5)).toBe(true);
    expect(isChartRate(1.33)).toBe(false);
    expect(CHART_RATES[0]).toBe(1);
  });

  it('retimes durations as well as times', () => {
    // A hold whose start moves but whose length does not ends where the audio
    // is not.
    const retimed = retime([note('a', 10, 0, 2)], 2);
    expect(retimed[0].time).toBe(5);
    expect(retimed[0].duration).toBe(1);
  });

  it('leaves a note with no duration without one', () => {
    expect(retime([note('a', 10, 0)], 2)[0].duration).toBeUndefined();
  });

  it('preserves note identity', () => {
    expect(retime([note('keep-me', 10, 0)], 1.5)[0].id).toBe('keep-me');
  });

  it('survives a zero or negative rate rather than producing Infinity', () => {
    expect(retime([note('a', 10, 0)], 0)[0].time).toBe(10);
    expect(Number.isFinite(retime([note('a', 10, 0)], -1)[0].time)).toBe(true);
  });

  it('pays no bonus', () => {
    // A chart written at 1.5x is a chart. Paying for it would mean every
    // charter declaring a rate, and free points for everyone on that board.
    expect(chartRateMultiplier()).toBe(1);
  });
});
