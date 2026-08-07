/**
 * The Slice It AI tier's arithmetic.
 *
 * **Nothing here calls a model, and that is the point.** Every number that ends
 * up in a prompt — density, streams, timing spread, the score gap — is computed
 * by these functions, and the model's job is only to phrase and prioritise. So
 * the correctness of the whole feature set is the correctness of this file's
 * subject, and it is all pure arithmetic that can be pinned exhaustively,
 * offline, in milliseconds.
 *
 * Two of these carry more weight than the rest:
 *
 *  - `offsetAdvice` decides whether a player is told to change a persisted
 *    setting. A false "your offset is 30 ms out" sends someone chasing a
 *    calibration that was already right.
 *  - `chartFacts` is the only description of a chart the model ever receives.
 *    If it silently returned zeros, every brief would still read plausibly and
 *    every one of them would be fiction.
 */

import { describe, it, expect, vi } from 'vitest';

// Three of the modules under test are `.server` files that reach the AI seam,
// which pulls in the Prisma singleton for usage metering — and that module
// throws at import time without a `DATABASE_URL`. Stubbed so this suite runs
// anywhere; nothing exercised below touches the database or the network.
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import {
  SECTION_SECONDS,
  canHoldStrictTiming,
  chartFacts,
  chartFactsToText,
  densestSections,
  mmss,
  offsetAdvice,
  poolTiming,
  runFactsToText,
  weakestSections,
  type SliceRunFacts,
} from '@/lib/slice-it/ai/facts';
import { diffRuns } from '@/lib/slice-it/ai/match.server';
import { cleanFilename } from '@/lib/slice-it/ai/upload.server';
import { deriveVerdict } from '@/lib/slice-it/ai/calibration.server';
import type { Slice, SliceType } from '@/lib/slice-it/types';
import type { TimingSummary } from '@/lib/slice-it/integrity';

/** A note at `time` on `lane`. */
function note(time: number, lane = 0, type: SliceType = 'STANDARD'): Slice {
  return { id: `n${time}-${lane}`, time, lane, type };
}

/** `count` notes every `gap` seconds from `start`, alternating lanes. */
function stream(start: number, count: number, gap: number): Slice[] {
  return Array.from({ length: count }, (_, i) => note(start + i * gap, i % 2));
}

/* -------------------------------------------------------------------------- */
/* chartFacts                                                                 */
/* -------------------------------------------------------------------------- */

describe('chartFacts', () => {
  it('counts notes and derives average density over the track length', () => {
    const facts = chartFacts(stream(0, 60, 1), 60);
    expect(facts.noteCount).toBe(60);
    expect(facts.averageNps).toBe(1);
  });

  it('excludes bombs and silent notes from every density number', () => {
    // A bomb is a note you must NOT hit and a silent note carries no judgement.
    // Counting either inflates the density the brief reports, which is the one
    // number a player uses to decide whether to attempt a chart.
    const slices = [
      ...stream(0, 10, 1),
      note(2, 0, 'BOMB'),
      note(3, 1, 'BOMB'),
      note(4, 0, 'SILENT'),
    ];
    const facts = chartFacts(slices, 10);
    expect(facts.noteCount).toBe(10);
    // Still reported in the type histogram — the brief mentions them, it just
    // does not count them as things to hit.
    expect(facts.types.BOMB).toBe(2);
    expect(facts.types.SILENT).toBe(1);
  });

  it('finds the densest section and reports where it is', () => {
    // Sparse for 20s, then 40 notes packed into the third 10s section.
    const slices = [...stream(0, 10, 2), ...stream(20, 40, 0.25)];
    const facts = chartFacts(slices, 40);
    expect(facts.peakAtSec).toBe(20);
    expect(facts.peakNps).toBeGreaterThan(3);
  });

  it('sorts a chart it was handed out of order', () => {
    // The stored `slices` array is only sorted by convention. An unsorted input
    // must not produce negative gaps and nonsense streams.
    const facts = chartFacts([note(3), note(1, 1), note(2), note(0, 1)], 4);
    expect(facts.minGapMs).toBe(1000);
    expect(facts.noteCount).toBe(4);
  });

  it('measures the longest alternating run and breaks it on a same-lane repeat', () => {
    const slices = [
      ...stream(0, 6, 0.1), // 6 alternating notes
      note(0.6, 1), // repeats lane 1 — breaks the stream
      ...stream(0.7, 3, 0.1),
    ];
    const facts = chartFacts(slices, 5);
    expect(facts.longestStream).toBe(6);
    expect(facts.jackRatio).toBeGreaterThan(0);
  });

  it('reports a one-lane chart as fully unbalanced with no stream', () => {
    const slices = Array.from({ length: 20 }, (_, i) => note(i * 0.2, 0));
    const facts = chartFacts(slices, 5);
    expect(facts.laneBalance).toBe(1);
    expect(facts.jackRatio).toBe(1);
    expect(facts.longestStream).toBe(1);
  });

  it('does not divide the final short section by a full section width', () => {
    // A 25s song has a 5s tail. Billing its notes over 10s would halve the
    // density the player is warned about right at the end of the chart.
    const slices = [...stream(0, 20, 1), ...stream(20, 25, 0.2)];
    const facts = chartFacts(slices, 25);
    const tail = facts.sections[2];
    expect(tail).toBeDefined();
    expect(tail!.endSec).toBe(25);
    expect(tail!.nps).toBeGreaterThan(4);
  });

  it('keeps analysing a chart that runs past a wrong stored duration', () => {
    // A `Song` row with a bad `duration` must not drop the end of its own chart
    // out of the report.
    const facts = chartFacts(stream(0, 40, 1), 5);
    expect(facts.sections.length).toBeGreaterThanOrEqual(4);
    expect(facts.noteCount).toBe(40);
  });

  it('returns a well-formed empty result for an empty chart', () => {
    const facts = chartFacts([], 120);
    expect(facts.noteCount).toBe(0);
    expect(facts.averageNps).toBe(0);
    expect(facts.sections).toEqual([]);
    // Not NaN — a NaN reaches the prompt as "NaN notes/sec".
    expect(Number.isFinite(facts.laneBalance)).toBe(true);
    expect(Number.isFinite(facts.jackRatio)).toBe(true);
  });

  it('returns a well-formed result for a chart of only bombs', () => {
    const facts = chartFacts([note(1, 0, 'BOMB'), note(2, 1, 'BOMB')], 10);
    expect(facts.noteCount).toBe(0);
    expect(facts.types.BOMB).toBe(2);
    expect(facts.minGapMs).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Section ranking                                                            */
/* -------------------------------------------------------------------------- */

describe('weakestSections', () => {
  it('ranks by notes lost, not by accuracy', () => {
    // The whole reason this is not a sort on accuracy: a section where 30 of 60
    // notes went is a bigger problem than one where 2 of 3 did, and ranking by
    // accuracy puts the three-note section first every time.
    const ranked = weakestSections([
      { index: 1, hit: 1, missed: 2, accuracy: 0.33 },
      { index: 2, hit: 30, missed: 30, accuracy: 0.5 },
    ]);
    expect(ranked[0]!.index).toBe(2);
  });

  it('drops sections with nothing missed', () => {
    expect(
      weakestSections([
        { index: 0, hit: 40, missed: 0, accuracy: 1 },
        { index: 1, hit: 20, missed: 3, accuracy: 0.8 },
      ]),
    ).toHaveLength(1);
  });
});

describe('densestSections', () => {
  it('returns the hardest sections first and skips empty ones', () => {
    const facts = chartFacts([...stream(0, 5, 1), ...stream(30, 40, 0.25)], 40);
    const dense = densestSections(facts, 2);
    expect(dense[0]!.startSec).toBe(30);
    expect(dense.every((section) => section.notes > 0)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Timing                                                                     */
/* -------------------------------------------------------------------------- */

describe('offsetAdvice', () => {
  const summary = (over: Partial<TimingSummary>): TimingSummary => ({
    samples: 200,
    meanMs: 0,
    stdDevMs: 20,
    ...over,
  });

  it('is confident about a large bias with a tight spread', () => {
    const advice = offsetAdvice(summary({ meanMs: 30, stdDevMs: 15 }));
    expect(advice?.confident).toBe(true);
    // Hitting LATE means the audio arrives early relative to the visuals, so
    // the correction moves the other way.
    expect(advice?.suggestedDeltaMs).toBe(-30);
  });

  it('is not confident about a small bias buried in a wide spread', () => {
    expect(offsetAdvice(summary({ meanMs: 4, stdDevMs: 60 }))?.confident).toBe(false);
  });

  it('is not confident about a bias smaller than the audible floor', () => {
    // Statistically real at 500 samples and far too small to be worth telling
    // anyone to change a setting over.
    expect(offsetAdvice(summary({ samples: 500, meanMs: 3, stdDevMs: 5 }))?.confident).toBe(false);
  });

  it('returns null below the sample threshold or on a non-finite summary', () => {
    expect(offsetAdvice(summary({ samples: 12, meanMs: 40 }))).toBeNull();
    expect(offsetAdvice(summary({ meanMs: Number.NaN }))).toBeNull();
    expect(offsetAdvice(null)).toBeNull();
    expect(offsetAdvice(undefined)).toBeNull();
  });
});

describe('poolTiming', () => {
  it('weights each run by its sample count', () => {
    const pooled = poolTiming([
      { samples: 100, meanMs: 10, stdDevMs: 10 },
      { samples: 300, meanMs: 30, stdDevMs: 10 },
    ]);
    // (100·10 + 300·30) / 400 = 25
    expect(pooled?.meanMs).toBeCloseTo(25, 6);
    expect(pooled?.samples).toBe(400);
  });

  it('carries between-run drift into the spread', () => {
    // Two runs, each internally tight, centred 40 ms apart. Averaging the
    // standard deviations would report 5 ms and hide the drift entirely — which
    // is exactly the signal the calibration advisor is looking for.
    const pooled = poolTiming([
      { samples: 100, meanMs: -20, stdDevMs: 5 },
      { samples: 100, meanMs: 20, stdDevMs: 5 },
    ]);
    expect(pooled?.meanMs).toBeCloseTo(0, 6);
    expect(pooled?.stdDevMs).toBeGreaterThan(19);
  });

  it('returns null for an empty or unusable set', () => {
    expect(poolTiming([])).toBeNull();
    expect(poolTiming([{ samples: 0, meanMs: 5, stdDevMs: 5 }])).toBeNull();
    expect(poolTiming([{ samples: 10, meanMs: Number.NaN, stdDevMs: 5 }])).toBeNull();
  });
});

describe('canHoldStrictTiming', () => {
  it('is true for a spread that fits inside the shrunken GREAT window', () => {
    expect(canHoldStrictTiming({ samples: 200, meanMs: 0, stdDevMs: 12 })).toBe(true);
  });

  it('is false for a spread wider than the shrunken window', () => {
    // Recommending Strict Timing here would not be a challenge, it would be a
    // wall — the windows shrink below where their hits already land.
    expect(canHoldStrictTiming({ samples: 200, meanMs: 0, stdDevMs: 55 })).toBe(false);
  });

  it('is false when there is no evidence either way', () => {
    expect(canHoldStrictTiming(null)).toBe(false);
    expect(canHoldStrictTiming({ samples: 5, meanMs: 0, stdDevMs: 1 })).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Calibration verdict                                                        */
/* -------------------------------------------------------------------------- */

describe('deriveVerdict', () => {
  const run = (timing: TimingSummary) => ({
    songTitle: 'Test',
    durationSec: 120,
    accuracy: 0.9,
    timing,
  });

  it('recommends an offset as an absolute setting, not a delta', () => {
    const verdict = deriveVerdict([run({ samples: 200, meanMs: 30, stdDevMs: 12 })], -10);
    expect(verdict.verdict).toBe('offset');
    // Current -10, correction -30 → -40. Returning "-30" would be read as the
    // new setting by the button that applies it.
    expect(verdict.suggestedOffsetMs).toBe(-40);
  });

  it('says practice when the spread dominates a real but small bias', () => {
    const verdict = deriveVerdict([run({ samples: 200, meanMs: 5, stdDevMs: 45 })], 0);
    expect(verdict.verdict).toBe('practice');
    expect(verdict.suggestedOffsetMs).toBe(0);
  });

  it('says inconclusive on too few hits', () => {
    expect(deriveVerdict([run({ samples: 8, meanMs: 40, stdDevMs: 10 })], 0).verdict).toBe(
      'inconclusive',
    );
    expect(deriveVerdict([], 0).verdict).toBe('inconclusive');
  });

  it('clamps a recommendation to the range the setting accepts', () => {
    const verdict = deriveVerdict([run({ samples: 400, meanMs: 240, stdDevMs: 20 })], -400);
    expect(verdict.suggestedOffsetMs).toBeGreaterThanOrEqual(-500);
    expect(verdict.suggestedOffsetMs).toBeLessThanOrEqual(500);
  });

  it('pools several runs rather than reading only the last', () => {
    const verdict = deriveVerdict(
      [
        run({ samples: 150, meanMs: 28, stdDevMs: 14 }),
        run({ samples: 150, meanMs: 32, stdDevMs: 14 }),
      ],
      0,
    );
    expect(verdict.verdict).toBe('offset');
    expect(verdict.pooled?.samples).toBe(300);
    expect(verdict.suggestedOffsetMs).toBe(-30);
  });
});

/* -------------------------------------------------------------------------- */
/* Rival diff                                                                 */
/* -------------------------------------------------------------------------- */

describe('diffRuns', () => {
  const row = (over: Partial<Parameters<typeof diffRuns>[0]> = {}) => ({
    name: 'someone',
    score: 100_000,
    maxCombo: 400,
    accuracy: 0.94,
    speedMod: 1,
    modifiers: null,
    ...over,
  });

  it('reports a positive multiplier gap when the rival runs richer settings', () => {
    // The fact the whole feature turns on: some of the deficit is a setting,
    // not a performance.
    const diff = diffRuns(
      row(),
      row({ score: 160_000, speedMod: 1.5, modifiers: { difficulty: 'expert' } }),
    );
    expect(diff.scoreGap).toBe(60_000);
    expect(diff.multiplierGap).toBeGreaterThan(0);
    expect(diff.rivalMultiplier).toBeGreaterThan(diff.playerMultiplier);
  });

  it('reports a zero multiplier gap when both rows run the same settings', () => {
    expect(diffRuns(row(), row({ score: 120_000 })).multiplierGap).toBe(0);
  });

  it('reports a null accuracy gap when either row predates accuracy recording', () => {
    expect(diffRuns(row({ accuracy: null }), row()).accuracyGap).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Filename cleanup                                                           */
/* -------------------------------------------------------------------------- */

describe('cleanFilename', () => {
  it('strips the extension, the track number and the scene noise', () => {
    expect(cleanFilename('04 - Artist - Song Title (Official Video) [320kbps].mp3')).toBe(
      'Artist - Song Title',
    );
  });

  it('turns underscores into spaces', () => {
    expect(cleanFilename('some_band_-_a_track.flac')).toBe('some band - a track');
  });

  it('leaves a name that is already clean alone', () => {
    expect(cleanFilename('Artist - Title.wav')).toBe('Artist - Title');
  });

  it('does not eat a title that happens to contain a stripped word', () => {
    // "Video Games" is a real song title; the noise pattern targets the
    // parenthesised "(Official Video)" tag, not the word wherever it appears.
    expect(cleanFilename('Lana Del Rey - Video Games.mp3')).toContain('Games');
  });
});

/* -------------------------------------------------------------------------- */
/* Serialization                                                              */
/* -------------------------------------------------------------------------- */

describe('mmss', () => {
  it('formats seconds as a timestamp a player can scrub to', () => {
    expect(mmss(0)).toBe('0:00');
    expect(mmss(9)).toBe('0:09');
    expect(mmss(93.5)).toBe('1:34');
    expect(mmss(600)).toBe('10:00');
  });

  it('never renders a negative time', () => {
    expect(mmss(-5)).toBe('0:00');
  });
});

describe('chartFactsToText', () => {
  it('labels every number with a unit', () => {
    const text = chartFactsToText(chartFacts(stream(0, 100, 0.5), 50));
    expect(text).toContain('notes/sec');
    expect(text).toContain('ms');
    // An unlabelled ratio has been read back as a percentage, a fraction and a
    // duration by three different prompts.
    expect(text).toMatch(/lane split: \d+% top/);
  });

  it('names the densest sections with timestamps', () => {
    const text = chartFactsToText(chartFacts([...stream(0, 5, 1), ...stream(60, 40, 0.25)], 80));
    expect(text).toContain('densest sections:');
    expect(text).toContain('1:00');
  });
});

describe('runFactsToText', () => {
  const base: SliceRunFacts = {
    songTitle: 'Test Track',
    songArtist: 'Someone',
    durationSec: 120,
    difficulty: 'hard',
    speed: 1,
    activeModifiers: [],
    score: 250_000,
    maxCombo: 300,
    accuracy: 0.93,
    grade: 'A',
    notesResolved: 400,
    judgements: null,
    timing: null,
    sections: null,
    chart: null,
    personalBest: null,
    rank: null,
  };

  it('states a personal best as a signed delta rather than two numbers', () => {
    const text = runFactsToText({ ...base, personalBest: 200_000 });
    expect(text).toContain('+50000');
  });

  it('flags a consistent bias as a calibration problem for the prompt', () => {
    const text = runFactsToText({
      ...base,
      timing: { samples: 300, meanMs: 35, stdDevMs: 14 },
    });
    expect(text).toContain('35 ms late');
    expect(text).toContain('audio-offset');
  });

  it('does not flag calibration when the spread swamps the bias', () => {
    const text = runFactsToText({
      ...base,
      timing: { samples: 300, meanMs: 4, stdDevMs: 70 },
    });
    expect(text).not.toContain('audio-offset');
  });

  it('says so explicitly when no notes were dropped', () => {
    // An absent line reads to the model as missing data; an explicit "none" is
    // the difference between "no misses" and "we did not measure".
    const text = runFactsToText({
      ...base,
      sections: [{ index: 0, hit: 40, missed: 0, accuracy: 1 }],
    });
    expect(text).toContain('none — no notes were missed');
  });

  it('renders dropped sections as timestamps derived from the section width', () => {
    const text = runFactsToText({
      ...base,
      sections: [{ index: 10, hit: 5, missed: 25, accuracy: 0.2 }],
    });
    expect(text).toContain(mmss(10 * SECTION_SECONDS));
    expect(text).toContain('missed 25 of 30 notes');
  });
});
