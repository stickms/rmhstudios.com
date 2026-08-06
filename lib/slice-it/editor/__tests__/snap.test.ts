/**
 * The beat grid: `beatAt`/`timeAtBeat` round-trip across tempo changes, and
 * `snapTime` is idempotent (snapping twice = snapping once).
 *
 * `docs/slice-it-chart-editor.md` §15. Idempotence is the property the whole
 * editor leans on without saying so: the `Q` quantise operation, the drag snap
 * and the arrow-key transport all re-snap an already-snapped time, and a snap
 * that drifts by an epsilon each pass walks a chart off its own grid.
 */

import { describe, expect, it } from 'vitest';
import {
  barBeatAt,
  beatAt,
  gridLines,
  gridWeight,
  meterAt,
  quantizationOf,
  snapStepSeconds,
  snapTime,
  timeAtBeat,
} from '../snap';
import { singleTimingPoint, type SnapDivision, type TimingPoint } from '../types';

const CONSTANT = singleTimingPoint(120);

/** Three tempo changes, including a doubling and an odd meter. */
const CHANGING: TimingPoint[] = [
  { time: 0, bpm: 120, meter: 4 },
  { time: 8, bpm: 90, meter: 3 },
  { time: 20, bpm: 180, meter: 4 },
  { time: 33.5, bpm: 128, meter: 4 },
];

const DIVISIONS: SnapDivision[] = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];

describe('snap — beatAt / timeAtBeat', () => {
  it('a constant tempo is beats = seconds × bpm / 60', () => {
    expect(beatAt(0, CONSTANT)).toBeCloseTo(0, 10);
    expect(beatAt(1, CONSTANT)).toBeCloseTo(2, 10);
    expect(beatAt(30, CONSTANT)).toBeCloseTo(60, 10);
  });

  it('round-trips across tempo changes', () => {
    for (let time = 0; time <= 45; time += 0.017) {
      const beat = beatAt(time, CHANGING);
      expect(timeAtBeat(beat, CHANGING)).toBeCloseTo(time, 9);
    }
  });

  it('round-trips from the beat side too', () => {
    for (let beat = 0; beat <= 90; beat += 0.125) {
      const time = timeAtBeat(beat, CHANGING);
      expect(beatAt(time, CHANGING)).toBeCloseTo(beat, 9);
    }
  });

  it('agrees with itself exactly at a tempo boundary', () => {
    for (const point of CHANGING) {
      const beat = beatAt(point.time, CHANGING);
      expect(timeAtBeat(beat, CHANGING)).toBeCloseTo(point.time, 9);
    }
  });

  it('an empty timing map degrades to zero rather than NaN', () => {
    expect(beatAt(12, [])).toBe(0);
    expect(timeAtBeat(12, [])).toBe(0);
    expect(Number.isNaN(snapTime(12, 4, []))).toBe(false);
  });
});

describe('snap — snapTime', () => {
  it('is idempotent at every division, on a constant tempo', () => {
    for (const division of DIVISIONS) {
      for (let time = 0; time < 12; time += 0.031) {
        const once = snapTime(time, division, CONSTANT);
        const twice = snapTime(once, division, CONSTANT);
        expect(twice).toBeCloseTo(once, 9);
      }
    }
  });

  it('is idempotent across tempo changes', () => {
    for (const division of DIVISIONS) {
      for (let time = 0; time < 45; time += 0.11) {
        const once = snapTime(time, division, CHANGING);
        const twice = snapTime(once, division, CHANGING);
        expect(twice).toBeCloseTo(once, 9);
      }
    }
  });

  it('lands on a subdivision of the beat', () => {
    for (const division of DIVISIONS) {
      for (let time = 0; time < 20; time += 0.23) {
        const snapped = snapTime(time, division, CHANGING);
        const beat = beatAt(snapped, CHANGING) * division;
        expect(Math.abs(beat - Math.round(beat))).toBeLessThan(1e-7);
      }
    }
  });

  it('never moves a time by more than half a subdivision', () => {
    for (let time = 0; time < 20; time += 0.037) {
      const snapped = snapTime(time, 4, CONSTANT);
      // 120 bpm, 1/4 of a beat = 0.125 s, so half of that is the ceiling.
      expect(Math.abs(snapped - time)).toBeLessThanOrEqual(0.125 / 2 + 1e-9);
    }
  });
});

describe('snap — grid weights and quantisation', () => {
  it('classifies downbeats, beats and subdivisions', () => {
    expect(gridWeight(0, 4)).toBe('measure');
    expect(gridWeight(4, 4)).toBe('measure');
    expect(gridWeight(8, 4)).toBe('measure');
    expect(gridWeight(1, 4)).toBe('beat');
    expect(gridWeight(3, 4)).toBe('beat');
    expect(gridWeight(0.5, 4)).toBe('sub');
    expect(gridWeight(3, 3)).toBe('measure');
  });

  it('reads the meter in force at a time', () => {
    expect(meterAt(0, CHANGING)).toBe(4);
    expect(meterAt(10, CHANGING)).toBe(3);
    expect(meterAt(40, CHANGING)).toBe(4);
  });

  it('quantisation buckets go coarsest-first', () => {
    // 120 bpm: one beat is 0.5 s.
    expect(quantizationOf(0, CONSTANT)).toBe(1);
    expect(quantizationOf(0.5, CONSTANT)).toBe(1);
    expect(quantizationOf(0.25, CONSTANT)).toBe(2);
    expect(quantizationOf(0.125, CONSTANT)).toBe(4);
    expect(quantizationOf(1 / 6, CONSTANT)).toBe(3);
    // Deliberately between every subdivision the colouring recognises.
    expect(quantizationOf(0.07, CONSTANT)).toBe(16);
  });

  it('bar/beat counts from 1, the way musicians do', () => {
    const at = barBeatAt(0, CONSTANT);
    expect(at.bar).toBe(1);
    expect(at.beat).toBe(1);
    const later = barBeatAt(2.5, CONSTANT); // beat 5 at 120bpm → bar 2, beat 2
    expect(later.bar).toBe(2);
    expect(later.beat).toBe(2);
  });

  it('one snap step is one subdivision of the beat', () => {
    expect(snapStepSeconds(0, 4, CONSTANT)).toBeCloseTo(0.125, 9);
    expect(snapStepSeconds(0, 1, CONSTANT)).toBeCloseTo(0.5, 9);
  });
});

describe('snap — gridLines', () => {
  it('covers the window and marks the measures', () => {
    const lines = gridLines(0, 4, 4, CONSTANT);
    expect(lines.length).toBeGreaterThan(20);
    expect(lines[0].time).toBeCloseTo(0, 9);
    expect(lines.at(-1)!.time).toBeLessThanOrEqual(4 + 1e-6);
    expect(lines.filter((line) => line.weight === 'measure').length).toBeGreaterThan(0);
  });

  it('every line is on the grid it claims to be', () => {
    for (const line of gridLines(0, 8, 8, CHANGING)) {
      expect(snapTime(line.time, 8, CHANGING)).toBeCloseTo(line.time, 7);
    }
  });

  it('degrades to bar lines rather than drawing 100k of them', () => {
    // A fifteen-minute track at 1/32, which is the zoomed-all-the-way-out case.
    const lines = gridLines(0, 900, 32, CONSTANT);
    expect(lines.length).toBeLessThanOrEqual(2000);
    expect(lines.every((line) => line.weight === 'measure')).toBe(true);
  });

  it('returns nothing for an inverted window', () => {
    expect(gridLines(10, 5, 4, CONSTANT)).toEqual([]);
  });
});
