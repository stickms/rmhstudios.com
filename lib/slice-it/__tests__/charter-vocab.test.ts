/**
 * G12 and G14 — the two things the charter already knew and was throwing away.
 *
 * Both features are cheap for the same reason: `lowRatio`/`highRatio` and the
 * section novelty curve are computed for other purposes and then discarded one
 * function later. The tests here are mostly about the fallbacks, because that
 * is where "free" features usually break — on the charts that predate them.
 */

import { describe, expect, it } from 'vitest';
import { buildCharts, type QuantizedNote, type Section } from '../beatmap/charter';

/** A note pool dense enough that the tier budget actually binds. */
function pool(count: number, span: number): QuantizedNote[] {
  return Array.from({ length: count }, (_, i) => {
    const time = (i / count) * span;
    return {
      time,
      strength: 0.5 + ((i * 37) % 50) / 100,
      frame: i,
      // Alternating registers, so `sound` has something to distinguish.
      lowRatio: i % 3 === 0 ? 0.8 : 0.1,
      highRatio: i % 3 === 1 ? 0.7 : 0.05,
      sustain: 0,
      beatIndex: Math.floor(i / 2),
      fraction: i % 2 === 0 ? 0 : 0.5,
      beatLength: 0.5,
    } as QuantizedNote;
  });
}

describe('G12 — per-note register', () => {
  it('tags every note with a register drawn from its own frequency content', () => {
    const { slices } = buildCharts(pool(120, 60), 60, 'seed');
    // Mines are excluded: `placeMines` emits them separately and they carry no
    // register on purpose — a mine is not a note you hit, so it has no attack
    // to have sat in a band.
    const expert = slices.expert.filter((slice) => slice.type !== 'BOMB');
    expect(expert.length).toBeGreaterThan(0);
    expect(expert.every((slice) => slice.sound !== undefined)).toBe(true);
    // The pool alternates low/high/mid, so a real chart drawn from it must use
    // more than one — a constant would mean the ratios are not being read.
    expect(new Set(expert.map((slice) => slice.sound)).size).toBeGreaterThan(1);
  });

  it('agrees with the lane assignment about what a note is', () => {
    // The registers reuse LOW_LANE_BIAS/HIGH_LANE_BIAS precisely so the left
    // hand keeps matching the low sample. A bass-dominant note that got lane 0
    // must not be tagged `high`.
    const { slices } = buildCharts(pool(120, 60), 60, 'seed');
    for (const slice of slices.expert) {
      if (slice.sound === 'low') expect(slice.lane).toBe(0);
    }
  });
});

describe('G14 — section-aware density', () => {
  const SPAN = 60;
  const LOUD: Section[] = [
    { start: 0, end: 30, energy: 0.2 },
    { start: 30, end: 60, energy: 1.0 },
  ];

  it('moves notes toward the louder section without changing the total', () => {
    // 600 candidates over 60s against Expert's 6 NPS budget (360). The pool
    // MUST exceed the budget or selection keeps everything and there is nothing
    // for a priority weight to change — the first draft of this test used 200
    // and passed vacuously.
    const flat = buildCharts(pool(600, SPAN), SPAN, 'seed');
    const shaped = buildCharts(pool(600, SPAN), SPAN, 'seed', LOUD);

    // The budget is a density guarantee and must survive the reweighting.
    // Within a couple of notes rather than exactly: selection is greedy under a
    // minimum-gap constraint, so changing WHICH notes win changes how tightly
    // the survivors pack against that gap. 360 vs 362 out of a 360 budget is
    // the constraint interacting with the reweighting, not the budget moving.
    expect(Math.abs(shaped.slices.expert.length - flat.slices.expert.length)).toBeLessThanOrEqual(
      4,
    );

    const inDrop = (list: { time: number }[]) => list.filter((s) => s.time >= 30).length;
    expect(inDrop(shaped.slices.expert)).toBeGreaterThan(inDrop(flat.slices.expert));
  });

  it('never empties the quiet section', () => {
    // A section allocated nothing reads as the chart having crashed, even when
    // the music genuinely is near-silent. That is what SECTION_WEIGHT_MIN is for.
    const shaped = buildCharts(pool(600, SPAN), SPAN, 'seed', LOUD);
    expect(shaped.slices.expert.filter((s) => s.time < 30).length).toBeGreaterThan(0);
  });

  it('falls back to flat weighting when a track has no discernible structure', () => {
    const flat = buildCharts(pool(600, SPAN), SPAN, 'seed');
    const oneSection = buildCharts(pool(600, SPAN), SPAN, 'seed', [
      { start: 0, end: 60, energy: 1 },
    ]);
    // Not a defect: a track the novelty curve could not segment has no loud
    // part to favour, so the correct behaviour is the old behaviour.
    expect(oneSection.slices.expert.map((s) => s.time)).toEqual(
      flat.slices.expert.map((s) => s.time),
    );
  });

  it('keeps the tiers nested', () => {
    // The guarantee everything else rests on: easy is a subset of normal is a
    // subset of hard is a subset of expert. A reweighting that broke it would
    // make the difficulty ladder stop teaching anything.
    const { slices } = buildCharts(pool(600, SPAN), SPAN, 'seed', LOUD);
    // Mines are excluded: `placeMines` runs per tier on its own PRNG stream
    // AFTER selection, so a mine in Expert has no reason to exist in Hard.
    // Nesting is a claim about the notes selection produced, not about what was
    // decorated onto each tier afterwards.
    const times = (list: { time: number; type: string }[]) =>
      new Set(list.filter((s) => s.type !== 'BOMB').map((s) => s.time));
    const expert = times(slices.expert);
    const hard = times(slices.hard);
    const normal = times(slices.normal);
    for (const t of times(slices.easy)) expect(normal.has(t)).toBe(true);
    for (const t of normal) expect(hard.has(t)).toBe(true);
    for (const t of hard) expect(expert.has(t)).toBe(true);
  });
});
