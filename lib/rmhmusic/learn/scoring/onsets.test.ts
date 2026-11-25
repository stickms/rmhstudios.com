import { describe, expect, it } from 'vitest';
import { onsetScore } from './onsets';
import { DEBOUNCE_MS, EXTRA_TAP_COST, MAX_LATENCY_MS, PERFECT_MS, ZERO_MS, effectiveLatencyMs } from './timing';

/** A dotted-quarter-and-eighth bar twice (0, 1.5, 2, 3.5 beats) at 72 bpm, from t = 10 s. */
const BEAT = 60_000 / 72;
const EXPECTED = [0, 1.5, 2, 3.5].map((b) => 10_000 + b * BEAT);
/** The bar's own window (as the machine passes it). */
const WINDOW = { fromMs: 10_000 - ZERO_MS, toMs: 10_000 + 4 * BEAT + ZERO_MS };

describe('onsetScore', () => {
  it('scores exact taps 100, every note on time', () => {
    const s = onsetScore(EXPECTED, EXPECTED, 0);
    expect(s).toMatchObject({ score: 100, hits: 4, early: 0, late: 0, missed: 0, extras: [] });
    expect(s.notes.map((n) => n.state)).toEqual(['on-time', 'on-time', 'on-time', 'on-time']);
  });

  it('counts a tap within the perfect window as on time, either side', () => {
    const s = onsetScore(
      EXPECTED,
      EXPECTED.map((t, i) => t + (i % 2 ? PERFECT_MS : -PERFECT_MS)),
      0,
    );
    expect(s.score).toBe(100);
    expect(s.hits).toBe(4);
  });

  it('marks a tap before the perfect window early, and after it late, with partial points', () => {
    const taps = [EXPECTED[0]! - 120, EXPECTED[1]! + 130, EXPECTED[2]!, EXPECTED[3]!];
    const s = onsetScore(EXPECTED, taps, 0);
    expect(s.notes[0]).toMatchObject({ state: 'early', offsetMs: -120 });
    expect(s.notes[1]).toMatchObject({ state: 'late', offsetMs: 130 });
    expect(s.early).toBe(1);
    expect(s.late).toBe(1);
    expect(s.hits).toBe(2);
    const partial = (100 * (ZERO_MS - 120)) / (ZERO_MS - PERFECT_MS);
    expect(s.notes[0]!.points).toBeCloseTo(partial, 6);
    const lateOne = (100 * (ZERO_MS - 130)) / (ZERO_MS - PERFECT_MS);
    expect(s.notes[1]!.points).toBeCloseTo(lateOne, 6);
    expect(s.score).toBe(Math.round((partial + lateOne + 200) / 4));
  });

  it('scores a missed note 0 and says so', () => {
    const s = onsetScore(EXPECTED, [EXPECTED[0]!, EXPECTED[2]!, EXPECTED[3]!], 0);
    expect(s.score).toBe(75);
    expect(s.missed).toBe(1);
    expect(s.notes[1]).toMatchObject({ state: 'missed', offsetMs: null, points: 0 });
  });

  it('counts a tap that answers nothing as an extra, at EXTRA_TAP_COST of a note', () => {
    // A tap in the middle of the first (dotted) note's length: 0.75 beat after the first onset.
    const stray = EXPECTED[0]! + 0.75 * BEAT;
    const s = onsetScore(
      EXPECTED,
      [...EXPECTED, stray].sort((a, b) => a - b),
      0,
      WINDOW,
    );
    expect(s.extras).toEqual([stray]);
    expect(s.score).toBe(Math.round(100 - (EXTRA_TAP_COST * 100) / 4));
  });

  it('counts a tap in a rest as extra, even after the last written note', () => {
    // q q hr: onsets at 0 and 1 beats; a tap on beat 3 is in the rest, past the last onset.
    const expected = [0, 1].map((b) => 10_000 + b * BEAT);
    const inRest = 10_000 + 3 * BEAT;
    const s = onsetScore(expected, [...expected, inRest], 0, WINDOW);
    expect(s.extras).toEqual([inRest]);
    expect(s.score).toBe(100 - Math.round(EXTRA_TAP_COST * 50) + 0);
    // Without the bar's window the rule is the tail's: it is ignored beyond ZERO_MS of the last onset.
    expect(onsetScore(expected, [...expected, inRest], 0).extras).toEqual([]);
  });

  it('counts a second tap for the same note as an extra', () => {
    const s = onsetScore(EXPECTED, [EXPECTED[0]!, EXPECTED[0]! + 100, ...EXPECTED.slice(1)], 0);
    expect(s.hits).toBe(4);
    expect(s.extras).toHaveLength(1);
  });

  it('takes a key repeat or bounce for one tap', () => {
    const s = onsetScore(EXPECTED, [EXPECTED[0]!, EXPECTED[0]! + DEBOUNCE_MS - 1, ...EXPECTED.slice(1)], 0);
    expect(s.extras).toEqual([]);
    expect(s.score).toBe(100);
  });

  it('ignores taps outside the bar (the count-in, the tail)', () => {
    const s = onsetScore(EXPECTED, [10_000 - 3 * BEAT, ...EXPECTED, EXPECTED[3]! + 2 * BEAT], 0, WINDOW);
    expect(s.extras).toEqual([]);
    expect(s.score).toBe(100);
  });

  it('subtracts the learner latency from every tap', () => {
    const late = EXPECTED.map((t) => t + 90);
    expect(onsetScore(EXPECTED, late, 0).hits).toBe(0);
    expect(onsetScore(EXPECTED, late, 90).score).toBe(100);
    // Never calibrated (0): the assumed output delay stands in, as for a beat tap.
    expect(
      onsetScore(
        EXPECTED,
        EXPECTED.map((t) => t + effectiveLatencyMs(0)),
        effectiveLatencyMs(0),
      ).score,
    ).toBe(100);
    // A wild saved value is bounded.
    expect(onsetScore(EXPECTED, EXPECTED, Infinity).score).toBe(100);
    expect(
      onsetScore(
        EXPECTED,
        EXPECTED.map((t) => t + MAX_LATENCY_MS),
        10_000,
      ).score,
    ).toBe(100);
  });

  it('passes dotted-quarter-and-eighth tapped on time, and fails it tapped evenly', () => {
    expect(onsetScore(EXPECTED, EXPECTED, 0, WINDOW).score).toBeGreaterThanOrEqual(70);
    const even = [0, 1, 2, 3].map((b) => 10_000 + b * BEAT);
    const s = onsetScore(EXPECTED, even, 0, WINDOW);
    expect(s.score).toBeLessThan(70);
    expect(s.extras).toHaveLength(2);
    expect(s.missed).toBe(2);
  });

  it('is zero for nothing tapped, and for nothing expected; and never leaves 0..100', () => {
    expect(onsetScore(EXPECTED, [], 0).score).toBe(0);
    expect(onsetScore([], [1, 2], 0)).toMatchObject({ score: 0, notes: [], extras: [] });
    const flood = Array.from({ length: 40 }, (_, i) => EXPECTED[0]! + i * 70);
    expect(onsetScore(EXPECTED, flood, 0, WINDOW).score).toBe(0);
    expect(onsetScore(EXPECTED, [Number.NaN, EXPECTED[0]!], 0).hits).toBe(1);
  });
});
