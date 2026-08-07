/**
 * O1, O2, O6 and O7 — the operations layer.
 *
 * The nesting tests are the load-bearing ones: `packNested` is allowed to be
 * lossy in exactly one way (refusing) and in no other, because the alternative
 * to refusing is silently deleting a note from someone's chart.
 */

import { describe, expect, it } from 'vitest';
import {
  BROKEN_CLEAR_RATE,
  MIN_RUNS_FOR_VERDICT,
  dipStatistic,
  looksBroken,
  missHeatmap,
  shouldSampleRun,
  spikeBuckets,
  type NoteStat,
} from '../chart-health';
import { FRAME_CAPACITY, FrameSampler, STALL_MS, frameBeacon, percentile } from '../frame-timing';
import {
  isNestedChart,
  packNested,
  packedSavings,
  trimSavings,
  trimToDifficulty,
  unpackAll,
  unpackNested,
} from '../nested-chart';
import type { Difficulty } from '../constants';
import type { BeatMap, Slice } from '../types';

function note(id: string, time: number): Slice {
  return { id, time, type: 'NORMAL', lane: id.charCodeAt(id.length - 1) % 2 };
}

/** Nested by construction: Easy ⊆ Normal ⊆ Hard ⊆ Expert. */
function nestedCharts(count = 40): Record<Difficulty, Slice[]> {
  const expert = Array.from({ length: count }, (_, i) => note(`n${i}`, i * 0.25));
  return {
    expert,
    hard: expert.filter((_, i) => i % 2 === 0),
    normal: expert.filter((_, i) => i % 4 === 0),
    easy: expert.filter((_, i) => i % 8 === 0),
  };
}

describe('O7 — shipping one difficulty', () => {
  const map: BeatMap = {
    id: 'song',
    name: 'n',
    artist: 'a',
    audioUrl: '/a.mp3',
    bpm: 120,
    slices: nestedCharts(),
  };

  it('keeps only the requested difficulty', () => {
    const trimmed = trimToDifficulty(map, 'easy');
    expect(Object.keys(trimmed.slices as object)).toEqual(['easy']);
    expect(trimSavings(map, 'easy')).toBeGreaterThan(0);
  });

  it('leaves a legacy flat chart alone', () => {
    // Rewriting it into a record would change the shape `resolveSlices` uses to
    // tell the two eras apart.
    const flat: BeatMap = { ...map, slices: [note('a', 0)] };
    expect(trimToDifficulty(flat, 'expert')).toBe(flat);
    expect(trimSavings(flat, 'expert')).toBe(0);
  });

  it('keys a fallback under the difficulty that was asked for', () => {
    // Otherwise the client's own resolveSlices falls back a second time, and
    // the server has trimmed away the notes the client was about to pick.
    const partial: BeatMap = {
      ...map,
      slices: { normal: [note('a', 0)] } as unknown as Record<Difficulty, Slice[]>,
    };
    const trimmed = trimToDifficulty(partial, 'expert');
    expect(Object.keys(trimmed.slices as object)).toEqual(['expert']);
  });

  it('round-trips every difficulty through the packed form', () => {
    const charts = nestedCharts();
    const packed = packNested(charts)!;
    expect(packed).not.toBeNull();
    const back = unpackAll(packed);
    for (const tier of ['easy', 'normal', 'hard', 'expert'] as const) {
      expect(back[tier].map((s) => s.id)).toEqual(charts[tier].map((s) => s.id));
    }
  });

  it('is smaller than the four-list form', () => {
    // ~450 bytes of masks against repeated note objects.
    expect(packedSavings(nestedCharts(200))).toBeGreaterThan(0);
  });

  it('refuses rather than silently dropping a note that breaks the nesting', () => {
    // A lower tier containing a note Expert lacks is a charter bug. Packing
    // anyway would delete it, and nobody would ever find out.
    const charts = nestedCharts();
    charts.easy = [...charts.easy, note('not-in-expert', 99)];
    expect(packNested(charts)).toBeNull();
  });

  it('refuses a duplicate id in Expert', () => {
    // The mask would be ambiguous: a lower tier referring to that id would
    // restore whichever occurrence won the index.
    const charts = nestedCharts(8);
    charts.expert = [...charts.expert, { ...charts.expert[0] }];
    expect(packNested(charts)).toBeNull();
  });

  it('handles a chart whose Easy is empty', () => {
    const charts = nestedCharts(8);
    charts.easy = [];
    const packed = packNested(charts)!;
    expect(unpackNested(packed, 'easy')).toEqual([]);
  });

  it('recognises its own shape', () => {
    expect(isNestedChart(packNested(nestedCharts()))).toBe(true);
    expect(isNestedChart(nestedCharts())).toBe(false);
    expect(isNestedChart(null)).toBe(false);
  });

  it('hands back copies, not the stored notes', () => {
    // The engine mutates `hit`/`hitTime` on the slices it is given.
    const packed = packNested(nestedCharts())!;
    unpackNested(packed, 'expert')[0].hit = true;
    expect(packed.expert[0].hit).toBeUndefined();
  });
});

describe('O1 — the miss heatmap', () => {
  // A normal chart — 5% misses throughout — with one unplayable bar in it at
  // ~30 s. The normal notes have to outnumber the bad ones or the "bad" bar IS
  // the chart's baseline and there is nothing to detect.
  const stats: NoteStat[] = [
    ...Array.from({ length: 120 }, (_, i) => ({
      noteMs: i * 500,
      attempts: 100,
      misses: 5,
    })).filter((stat) => stat.noteMs < 29_000 || stat.noteMs > 31_000),
    { noteMs: 30_000, attempts: 100, misses: 90 },
    { noteMs: 30_500, attempts: 100, misses: 88 },
  ];

  it('buckets across the chart duration', () => {
    const heatmap = missHeatmap(stats, 60, 64);
    expect(heatmap).toHaveLength(64);
    expect(heatmap[0].from).toBe(0);
    expect(heatmap[63].to).toBeCloseTo(60);
  });

  it('reports null rather than zero for a bucket nobody reached', () => {
    // Zero would draw as "everyone cleared this", which is the opposite of
    // "nobody got here".
    const heatmap = missHeatmap([{ noteMs: 0, attempts: 10, misses: 1 }], 60, 8);
    expect(heatmap[0].rate).toBeCloseTo(0.1);
    expect(heatmap[7].rate).toBeNull();
  });

  it('clamps a note past the stated duration into the last bucket', () => {
    // A note past the end is a chart bug, not a reason to drop the evidence.
    const heatmap = missHeatmap([{ noteMs: 999_000, attempts: 10, misses: 10 }], 60, 8);
    expect(heatmap[7].attempts).toBe(10);
  });

  it('finds the spike and not the rest of a hard chart', () => {
    const spikes = spikeBuckets(missHeatmap(stats, 60, 64), { minAttempts: 20 });
    expect(spikes.length).toBeGreaterThan(0);
    for (const spike of spikes) {
      expect(spike.from).toBeGreaterThan(29);
      expect(spike.to).toBeLessThan(32);
    }
  });

  it('still detects a spike on a chart with a brutal baseline', () => {
    // A 40% baseline puts `baseline * 3` above 1.0, so an unbounded ratio would
    // silently disable the detector on exactly the charts most likely to have
    // an unplayable bar in them.
    const brutal: NoteStat[] = [
      ...Array.from({ length: 60 }, (_, i) => ({
        noteMs: i * 1000,
        attempts: 100,
        misses: 40,
      })),
    ];
    brutal[30] = { noteMs: 30_000, attempts: 100, misses: 99 };
    const spikes = spikeBuckets(missHeatmap(brutal, 60, 60));
    expect(spikes).toHaveLength(1);
    expect(spikes[0].from).toBeCloseTo(30);
  });

  it('ignores a bucket two people reached', () => {
    // 100% over two attempts is not evidence of anything.
    const thin: NoteStat[] = [{ noteMs: 1000, attempts: 2, misses: 2 }];
    expect(spikeBuckets(missHeatmap(thin, 60), { minAttempts: 20 })).toEqual([]);
  });

  it('does not flag every bucket on a chart nobody misses', () => {
    // With a near-zero baseline the ratio test divides by ~0; the absolute
    // floor is what stops one miss in one bucket reading as a spike.
    const clean: NoteStat[] = Array.from({ length: 64 }, (_, i) => ({
      noteMs: i * 1000,
      attempts: 500,
      misses: i === 3 ? 1 : 0,
    }));
    expect(spikeBuckets(missHeatmap(clean, 64))).toEqual([]);
  });

  it('samples deterministically, so a retried job cannot double-count', () => {
    const first = shouldSampleRun('run-42');
    expect(shouldSampleRun('run-42')).toBe(first);
    // And it actually samples roughly a tenth.
    const sampled = Array.from({ length: 2000 }, (_, i) => shouldSampleRun(i)).filter(
      Boolean,
    ).length;
    expect(sampled).toBeGreaterThan(100);
    expect(sampled).toBeLessThan(320);
  });
});

describe('O2 — automatic bad-chart detection', () => {
  const unimodal = Array.from({ length: 200 }, (_, i) => 0.8 + (i % 20) * 0.005);
  const bimodal = [
    ...Array.from({ length: 100 }, (_, i) => 0.95 + (i % 10) * 0.002),
    ...Array.from({ length: 100 }, (_, i) => 0.4 + (i % 10) * 0.002),
  ];

  it('separates two humps from one long tail', () => {
    // The tell for a mis-tracked tempo: players who happened to lock onto the
    // wrong grid score well, everyone else scores terribly.
    expect(dipStatistic(bimodal)).toBeGreaterThan(dipStatistic(unimodal));
    expect(dipStatistic(bimodal)).toBeGreaterThan(0.1);
    expect(dipStatistic(unimodal)).toBeLessThan(0.1);
  });

  it('is not fooled by a single outlier', () => {
    // Untrimmed, one run at 5% is a bigger gap than any true valley.
    expect(dipStatistic([...unimodal, 0.05])).toBeLessThan(0.1);
  });

  it('says nothing below the sample floor', () => {
    const verdict = looksBroken({
      accuracies: bimodal.slice(0, MIN_RUNS_FOR_VERDICT - 1),
      clearRate: 0,
    });
    expect(verdict.broken).toBe(false);
    expect(verdict.reasons).toEqual([]);
  });

  it('flags a chart nobody clears', () => {
    const verdict = looksBroken({ accuracies: unimodal, clearRate: BROKEN_CLEAR_RATE / 2 });
    expect(verdict.reasons).toContain('clear-rate');
  });

  it('leaves a merely hard chart alone', () => {
    const verdict = looksBroken({ accuracies: unimodal, clearRate: 0.2, spikes: 1 });
    expect(verdict.broken).toBe(false);
  });

  it('needs more than one brutal bar to call it a generation failure', () => {
    expect(looksBroken({ accuracies: unimodal, clearRate: 0.3, spikes: 1 }).reasons).not.toContain(
      'miss-spike',
    );
    expect(looksBroken({ accuracies: unimodal, clearRate: 0.3, spikes: 2 }).reasons).toContain(
      'miss-spike',
    );
  });
});

describe('O6 — frame timing', () => {
  it('reports nothing for a run abandoned in the countdown', () => {
    const sampler = new FrameSampler();
    for (let i = 0; i < 10; i++) sampler.push(16.7);
    expect(sampler.report()).toBeNull();
  });

  it('separates a clean run from a stally one', () => {
    // The whole reason for percentiles: both have an excellent mean, and one of
    // them dropped a dozen notes. Note the stall rate has to exceed 1% for p99
    // to see it at all — four stalls in 600 frames is 0.67%, which p99 is
    // *supposed* to look past. That is why `stalls` and `max` are reported
    // alongside it rather than the percentiles being trusted alone.
    const clean = new FrameSampler();
    const stally = new FrameSampler();
    for (let i = 0; i < 600; i++) {
      clean.push(16.7);
      stally.push(i % 40 === 0 ? 200 : 16.7);
    }
    expect(clean.report()!.p99).toBeCloseTo(16.7, 1);
    expect(clean.report()!.stalls).toBe(0);
    expect(stally.report()!.p99).toBeGreaterThan(100);
    expect(stally.report()!.stalls).toBe(15);
  });

  it('reports a rare stall through `stalls` and `max`, not through p99', () => {
    const sampler = new FrameSampler();
    for (let i = 0; i < 600; i++) sampler.push(i % 150 === 0 ? 200 : 16.7);
    const report = sampler.report()!;
    expect(report.p99).toBeCloseTo(16.7, 1);
    expect(report.stalls).toBe(4);
    expect(report.max).toBe(200);
  });

  it('ignores a backgrounded tab’s frame', () => {
    // A 40-second delta is not a stall the player experienced, and it would
    // dominate every percentile in the ring.
    const sampler = new FrameSampler();
    for (let i = 0; i < 200; i++) sampler.push(16.7);
    sampler.push(40_000);
    expect(sampler.report()!.max).toBeCloseTo(16.7, 1);
  });

  it('keeps counting stalls that have aged out of the ring', () => {
    // A run that stalled early and recovered still stalled.
    const sampler = new FrameSampler();
    sampler.push(STALL_MS + 1);
    for (let i = 0; i < FRAME_CAPACITY + 100; i++) sampler.push(16.7);
    expect(sampler.sampleCount).toBe(FRAME_CAPACITY);
    expect(sampler.report()!.stalls).toBe(1);
    expect(sampler.report()!.frames).toBe(FRAME_CAPACITY + 101);
  });

  it('resets cleanly between runs', () => {
    const sampler = new FrameSampler();
    for (let i = 0; i < 200; i++) sampler.push(50);
    sampler.reset();
    expect(sampler.report()).toBeNull();
  });

  it('takes nearest-rank percentiles', () => {
    const sorted = Float32Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(sorted, 0.5)).toBe(50);
    expect(percentile(sorted, 0.99)).toBe(99);
    expect(percentile([], 0.5)).toBe(0);
  });

  it('carries the context the mitigation actually controls', () => {
    const sampler = new FrameSampler();
    for (let i = 0; i < 200; i++) sampler.push(16.7);
    const beacon = frameBeacon(sampler.report()!, {
      glow: true,
      dpr: 2.6666666,
      notes: 900,
      difficulty: 'hard',
    });
    expect(beacon.glow).toBe(true);
    expect(beacon.dpr).toBe(2.67);
    expect(beacon.notes).toBe(900);
  });
});
