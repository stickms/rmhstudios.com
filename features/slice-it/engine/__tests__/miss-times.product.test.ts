import { describe, expect, it } from 'vitest';
import {
  HEAT_THRESHOLDS,
  MISS_TIMES_MAX,
  chartNoteTimesMs,
  heatStep,
  missedTimesMs,
  noteMsOf,
  ratePercent,
  validateMissTimes,
} from '../miss-times';

const chart = (...times: number[]) => times.map((time, i) => ({ id: `n${i}`, time, lane: i % 2, type: 'TAP' }));

describe('chartNoteTimesMs', () => {
  it('rounds seconds to whole milliseconds', () => {
    expect(chartNoteTimesMs(chart(0.4, 1.2345, 2))).toEqual([400, 1235, 2000]);
    expect(noteMsOf(0.0004)).toBe(0);
  });

  it('skips a malformed element and reads a non-list as empty', () => {
    expect(chartNoteTimesMs([{ time: 1 }, null, { time: 'x' }, { time: -1 }, { time: Number.NaN }, 7])).toEqual([1000]);
    expect(chartNoteTimesMs(null)).toEqual([]);
    expect(chartNoteTimesMs({ time: 1 })).toEqual([]);
  });
});

describe('validateMissTimes', () => {
  const notes = chart(1, 2, 3, 4);

  it('marks the notes whose times were sent, and lists every note of the chart', () => {
    const result = validateMissTimes(notes, [2000, 4000], 4)!;
    expect(result.dropped).toBe(0);
    expect(result.outcomes).toEqual([
      { noteMs: 1000, missed: false },
      { noteMs: 2000, missed: true },
      { noteMs: 3000, missed: false },
      { noteMs: 4000, missed: true },
    ]);
  });

  it('drops a time that is not one of the chart’s own', () => {
    const result = validateMissTimes(notes, [2000, 2001, 9999, 0], 4)!;
    expect(result.dropped).toBe(3);
    expect(result.outcomes.filter((o) => o.missed).map((o) => o.noteMs)).toEqual([2000]);
  });

  it('accepts a time once per note at that instant and drops the excess', () => {
    const twoLanes = chart(1, 1, 2);
    const result = validateMissTimes(twoLanes, [1000, 1000, 1000, 2000], 3)!;
    expect(result.dropped).toBe(1);
    expect(result.outcomes).toEqual([
      { noteMs: 1000, missed: true },
      { noteMs: 1000, missed: true },
      { noteMs: 2000, missed: true },
    ]);
    // One miss sent for two simultaneous notes marks one of them.
    expect(validateMissTimes(twoLanes, [1000], 3)!.outcomes.filter((o) => o.missed)).toHaveLength(1);
  });

  it('records nothing when the count is not the chart’s', () => {
    expect(validateMissTimes(notes, [1000], 3)).toBeNull();
    expect(validateMissTimes(notes, [1000], 5)).toBeNull();
  });

  it('records nothing when either field is missing, or the chart is empty', () => {
    expect(validateMissTimes(notes, undefined, 4)).toBeNull();
    expect(validateMissTimes(notes, [], undefined)).toBeNull();
    expect(validateMissTimes([], [], 0)).toBeNull();
  });

  it('accepts a run that missed nothing', () => {
    expect(validateMissTimes(notes, [], 4)!.outcomes.every((o) => !o.missed)).toBe(true);
  });
});

describe('missedTimesMs', () => {
  it('lists the unhit notes a player can miss, as whole milliseconds', () => {
    const slices = [
      { time: 1.0004, type: 'TAP', hit: true },
      { time: 2.5, type: 'TAP', hit: false },
      { time: 3, type: 'LONG' },
      { time: 4, type: 'BOMB', hit: false },
      { time: 5, type: 'SILENT', hit: false },
    ];
    expect(missedTimesMs(slices)).toEqual([2500, 3000]);
  });

  it('never exceeds what a submission may carry', () => {
    const many = Array.from({ length: MISS_TIMES_MAX + 50 }, (_, i) => ({ time: i, type: 'TAP', hit: false }));
    expect(missedTimesMs(many)).toHaveLength(MISS_TIMES_MAX);
  });
});

describe('heatStep', () => {
  it('is no tint for a bucket nobody reached', () => {
    expect(heatStep(null)).toBe(0);
    expect(heatStep(Number.NaN)).toBe(0);
  });

  it('is four strengths by miss rate', () => {
    expect(HEAT_THRESHOLDS).toEqual([0.1, 0.25, 0.5]);
    expect([0, 0.09, 0.1, 0.24, 0.25, 0.49, 0.5, 1].map(heatStep)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('prints a rate as a whole percentage', () => {
    expect([0, 0.244, 0.245, 1, 1.4, -1].map(ratePercent)).toEqual([0, 24, 25, 100, 100, 0]);
  });
});
