/**
 * `lib/slice-it/rating.ts` — the computed difficulty rating (C3).
 *
 * These tests pin **properties**, not numbers. The weights in `rating.ts` are
 * explicitly uncalibrated and are expected to move when clear-rate data exists;
 * a test asserting `rateChart(x) === 12.4` would fail on every calibration pass
 * and would be deleted rather than fixed, which is the same as not having it.
 *
 * What is worth pinning is the set of claims the rating makes about charts —
 * denser is harder, jacks are harder than trills at the same density, the scale
 * is bounded and monotone — because those are what a library sort depends on and
 * a re-weighting must not break them.
 */

import { describe, it, expect } from 'vitest';
import { MAX_RATING, RATING_VERSION, rateChart, rateChartDetailed, ratingBand } from '../rating';
import type { Slice } from '../types';

/** `count` notes at `nps`, alternating lanes unless told otherwise. */
function stream(count: number, nps: number, lane?: number): Slice[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    time: i / nps,
    type: 'STANDARD' as const,
    lane: lane ?? i % 2,
  }));
}

describe('rateChart', () => {
  it('rates an empty chart 0 rather than throwing', () => {
    // The editor calls this on every keystroke, and an empty chart is a normal
    // state there — the first one every new chart is in.
    expect(rateChart([])).toBe(0);
    expect(rateChart([], 180)).toBe(0);
  });

  it('is monotone in density: a faster stream rates higher', () => {
    const slow = rateChart(stream(200, 2));
    const medium = rateChart(stream(200, 6));
    const fast = rateChart(stream(200, 12));

    expect(slow).toBeLessThan(medium);
    expect(medium).toBeLessThan(fast);
  });

  it('rates a jack above a trill of identical density', () => {
    // The whole reason jacks are a separate feature: NPS cannot see the
    // difference, and the difference is enormous to play.
    const trill = rateChart(stream(120, 8));
    const jack = rateChart(stream(120, 8, 0));

    expect(jack).toBeGreaterThan(trill);
  });

  it('stays within 0 and MAX_RATING even for an absurd chart', () => {
    // 60 NPS on one lane is not a chart anybody can play; the scale still has
    // to return something a `Float` column and a sort can hold.
    const absurd = rateChart(stream(3000, 60, 0));
    expect(absurd).toBeGreaterThan(0);
    expect(absurd).toBeLessThanOrEqual(MAX_RATING);
  });

  it('ignores SPEED and BOMB notes when measuring density', () => {
    const notes = stream(100, 4);
    const withMarkers: Slice[] = [
      ...notes,
      ...Array.from({ length: 400 }, (_, i) => ({
        id: `s${i}`,
        time: i / 40,
        type: 'SPEED' as const,
        lane: 0,
        speedMultiplier: 2,
      })),
    ];

    // A scroll-velocity marker is not a note you hit. If it counted, a chart
    // could be made to rate as an expert by sprinkling gimmicks over it.
    expect(rateChart(withMarkers)).toBe(rateChart(notes));
  });

  it('does not let a long silent tail deflate the peak', () => {
    // The hardest second is the hardest second regardless of what follows it.
    const burst = stream(60, 10);
    const withTail: Slice[] = [...burst, { id: 'last', time: 600, type: 'STANDARD', lane: 0 }];

    expect(rateChartDetailed(withTail).peakNps).toBeCloseTo(rateChartDetailed(burst).peakNps, 5);
  });

  it('rounds to one decimal place', () => {
    const rating = rateChart(stream(300, 7));
    expect(rating).toBe(Math.round(rating * 10) / 10);
  });

  it('is a pure function of the notes — order in, order out', () => {
    const notes = stream(200, 5);
    const shuffled = [...notes].reverse();
    // The rater sorts internally; a chart stored in a different order is the
    // same chart, and a JSONB column makes no promise about order.
    expect(rateChart(shuffled)).toBe(rateChart(notes));
  });

  it('does not mutate the note list it is given', () => {
    const notes = stream(50, 5);
    const before = notes.map((n) => n.id);
    rateChart(notes);
    expect(notes.map((n) => n.id)).toEqual(before);
  });

  it('counts holds as a distinct feature', () => {
    const taps = stream(100, 4);
    const holds: Slice[] = taps.map((n) => ({ ...n, type: 'LONG', duration: 0.4 }));

    expect(rateChartDetailed(taps).holdShare).toBe(0);
    expect(rateChartDetailed(holds).holdShare).toBe(1);
    expect(rateChart(holds)).toBeGreaterThan(rateChart(taps));
  });

  it('survives a note list containing NaN times without producing NaN', () => {
    // JSONB is not a schema. A malformed row must not poison a sortable column.
    const notes: Slice[] = [
      ...stream(50, 5),
      { id: 'bad', time: Number.NaN, type: 'STANDARD', lane: 0 },
    ];
    expect(Number.isFinite(rateChart(notes))).toBe(true);
  });
});

describe('rateChartDetailed', () => {
  it('reports a peak NPS close to the real one', () => {
    const { peakNps } = rateChartDetailed(stream(200, 8));
    // Window boundaries make this ±1 note; the claim is "roughly 8", not "8".
    expect(peakNps).toBeGreaterThanOrEqual(7);
    expect(peakNps).toBeLessThanOrEqual(9);
  });

  it('reports the same rating as rateChart', () => {
    const notes = stream(400, 9);
    expect(rateChartDetailed(notes).rating).toBe(rateChart(notes));
  });

  it('counts every rated note', () => {
    expect(rateChartDetailed(stream(137, 5)).ratedNotes).toBe(137);
  });
});

describe('ratingBand', () => {
  it('returns null for an unrated chart rather than a band', () => {
    // Null is "nobody has rated this", which is not the same claim as "easy".
    expect(ratingBand(null)).toBeNull();
    expect(ratingBand(undefined)).toBeNull();
    expect(ratingBand(Number.NaN)).toBeNull();
  });

  it('is monotone across the scale', () => {
    const order = ['beginner', 'easy', 'moderate', 'hard', 'expert', 'extreme'];
    const seen = [0, 5, 10, 13, 16, 19].map((r) => order.indexOf(ratingBand(r)!));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(6);
  });

  it('bands the top of the scale', () => {
    expect(ratingBand(MAX_RATING)).toBe('extreme');
  });
});

describe('RATING_VERSION', () => {
  it('is a positive integer', () => {
    // It is stored on every rated row and compared with `<`; a float or a zero
    // would make the re-rate sweep's ordering meaningless.
    expect(Number.isInteger(RATING_VERSION)).toBe(true);
    expect(RATING_VERSION).toBeGreaterThan(0);
  });
});
