/**
 * P2, P8 and P9 — drilling, the weakness profile and the personal-best ghost.
 *
 * The classification tests pin down the cases that decide whether a "weakest
 * skill" means anything: a trill misread as a burst, or a three-note section
 * winning the drill ranking, would both produce confident advice about nothing.
 */

import { describe, expect, it } from 'vitest';
import {
  DRILL_CLEAR_ACCURACY,
  DRILL_MAX_RATE,
  DRILL_MIN_RATE,
  MIN_DRILL_NOTES,
  accuracyIn,
  advanceDrill,
  nextRate,
  paceAgainst,
  readCurve,
  sampleCurve,
  sectionBreakdown,
  startDrill,
  worstSection,
  type NoteLogEntry,
} from '../drill';
import {
  MIN_NOTES_FOR_PATTERN,
  accumulate,
  buildProfile,
  classify,
  patternMix,
  type PatternStat,
} from '../patterns';
import type { Section } from '../beatmap/sections';
import type { Slice } from '../types';

const note = (id: string, time: number, lane: number, type: Slice['type'] = 'STANDARD'): Slice => ({
  id,
  time,
  lane,
  type,
});

const sections: Section[] = [
  { start: 0, end: 30, label: 'A', energy: 0.5 },
  { start: 30, end: 60, label: 'B', energy: 1 },
  { start: 60, end: 90, label: 'C', energy: 0.6 },
];

describe('P8 — pattern classification', () => {
  it('calls a long note a hold whatever surrounds it', () => {
    // Holding is the skill being tested regardless of context.
    const notes = [note('a', 0, 0), note('b', 0.05, 0, 'LONG'), note('c', 0.1, 0)];
    expect(classify(notes, 1)).toBe('hold');
  });

  it('calls simultaneous notes a chord, from either side', () => {
    const notes = [note('a', 1, 0), note('b', 1, 1)];
    expect(classify(notes, 0)).toBe('chord');
    expect(classify(notes, 1)).toBe('chord');
  });

  it('calls a repeated lane a jack', () => {
    const notes = [note('a', 1, 0), note('b', 1.1, 0)];
    expect(classify(notes, 1)).toBe('jack');
  });

  it('distinguishes a fast trill from a burst', () => {
    // A trill misread as a burst loses exactly what makes it hard, and the
    // spacing buckets would swallow it without the A-B-A check.
    const trill = [note('a', 1, 0), note('b', 1.08, 1), note('c', 1.16, 0)];
    expect(classify(trill, 1)).toBe('trill');

    // Same spacing, but the neighbours are not on one lane — a burst.
    const burst = [note('a', 1, 0), note('b', 1.05, 1), note('c', 1.1, 1)];
    expect(classify(burst, 1)).toBe('burst');
  });

  it('separates a stream from a burst by spacing', () => {
    const stream = [note('a', 1, 0), note('b', 1.3, 1), note('c', 1.6, 0)];
    expect(classify(stream, 1)).toBe('stream');
  });

  it('calls a note with nothing near it isolated', () => {
    const notes = [note('a', 1, 0), note('b', 5, 1)];
    expect(classify(notes, 1)).toBe('isolated');
    // The first note has no predecessor, which is an infinite gap.
    expect(classify(notes, 0)).toBe('isolated');
  });

  it('survives an out-of-range index', () => {
    expect(classify([], 0)).toBe('isolated');
    expect(classify([note('a', 0, 0)], 5)).toBe('isolated');
  });

  it('counts a whole chart into a mix', () => {
    const mix = patternMix([note('a', 1, 0), note('b', 1.1, 0), note('c', 9, 1)]);
    expect(mix.isolated).toBeGreaterThan(0);
    expect(mix.jack).toBe(1);
    expect(Object.values(mix).reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe('P8 — the weakness profile', () => {
  it('refuses to rank a pattern it has barely seen', () => {
    // A "weakest skill" derived from thirty chord notes sends a player to drill
    // something they have barely met, and a recommender that is confidently
    // wrong is worse than none.
    const stats: PatternStat[] = [
      { pattern: 'jack', hitPoints: 10, notes: 30 },
      { pattern: 'stream', hitPoints: 900, notes: 1000 },
    ];
    const profile = buildProfile(stats);
    expect(profile.accuracy.jack).toBeNull();
    expect(profile.weakest).toBe('stream');
  });

  it('finds the weakest and strongest among patterns with enough data', () => {
    const stats: PatternStat[] = [
      { pattern: 'jack', hitPoints: 300, notes: MIN_NOTES_FOR_PATTERN * 3 },
      { pattern: 'stream', hitPoints: 570, notes: MIN_NOTES_FOR_PATTERN * 3 },
      { pattern: 'hold', hitPoints: 450, notes: MIN_NOTES_FOR_PATTERN * 3 },
    ];
    const profile = buildProfile(stats);
    expect(profile.weakest).toBe('jack');
    expect(profile.strongest).toBe('stream');
  });

  it('reports nothing from an empty history', () => {
    expect(buildProfile([])).toMatchObject({ weakest: null, strongest: null });
  });

  it('ignores notes the run never reached', () => {
    // Counting an unjudged note as a miss would punish a player twice for
    // failing early.
    const notes = [note('a', 1, 0), note('b', 1.1, 0), note('c', 9, 1)];
    const weights = new Map([['a', 1]]);
    const folded = accumulate(notes, weights);
    expect(folded.get('isolated')).toEqual({ hitPoints: 1, notes: 1 });
    expect(folded.get('jack')).toBeUndefined();
  });
});

describe('P2 — drilling', () => {
  const log: NoteLogEntry[] = [
    ...Array.from({ length: 20 }, (_, i) => ({
      time: i,
      result: 'MARVELOUS' as const,
      offset: 0,
    })),
    // The bad bar.
    ...Array.from({ length: 20 }, (_, i) => ({
      time: 30 + i,
      result: 'MISS' as const,
      offset: 0,
    })),
    ...Array.from({ length: 20 }, (_, i) => ({
      time: 60 + i,
      result: 'PERFECT' as const,
      offset: 0,
    })),
  ];

  it('measures a window', () => {
    expect(accuracyIn(log, 0, 30)).toMatchObject({ notes: 20, misses: 0 });
    expect(accuracyIn(log, 30, 60).value).toBe(0);
    expect(accuracyIn(log, 200, 300)).toEqual({ notes: 0, value: 0, misses: 0 });
  });

  it('finds the section that went worst', () => {
    expect(worstSection(log, sections)?.label).toBe('B');
  });

  it('ignores a section too small to be a drill target', () => {
    // A three-note section where you missed two reads as 33% and would win
    // every ranking, sending the player to loop four seconds of an intro.
    const thin: NoteLogEntry[] = [
      { time: 0, result: 'MISS', offset: 0 },
      { time: 1, result: 'MISS', offset: 0 },
      ...Array.from({ length: MIN_DRILL_NOTES }, (_, i) => ({
        time: 30 + i,
        result: 'GOOD' as const,
        offset: 0,
      })),
    ];
    expect(worstSection(thin, sections)?.label).toBe('B');
  });

  it('returns null when nothing qualifies', () => {
    expect(worstSection([], sections)).toBeNull();
  });

  it('ranks every section worst-first', () => {
    expect(sectionBreakdown(log, sections).map((entry) => entry.section.label)).toEqual([
      'B',
      'C',
      'A',
    ]);
  });

  it('ratchets symmetrically and stays in range', () => {
    // Symmetric, unlike P7's session ladder: a drill is trying to get you to
    // full speed on one bar, and a step that drops further than it rises makes
    // the last 10% take forever.
    expect(nextRate(0.7, true)).toBe(0.8);
    expect(nextRate(0.7, false)).toBe(0.6);
    expect(nextRate(DRILL_MAX_RATE, true)).toBe(DRILL_MAX_RATE);
    expect(nextRate(DRILL_MIN_RATE, false)).toBe(DRILL_MIN_RATE);
  });

  it('needs two consecutive clears to speed up', () => {
    // One clear is luck at the edge of your ability.
    let state = startDrill(sections[1], 0.7);
    state = advanceDrill(state, DRILL_CLEAR_ACCURACY);
    expect(state.rate).toBe(0.7);
    expect(state.streak).toBe(1);
    state = advanceDrill(state, DRILL_CLEAR_ACCURACY);
    expect(state.rate).toBe(0.8);
    expect(state.streak).toBe(0);
  });

  it('slows down on a single failure and resets the streak', () => {
    let state = startDrill(sections[1], 0.8);
    state = advanceDrill(state, 1);
    state = advanceDrill(state, 0.4);
    expect(state.rate).toBe(0.7);
    expect(state.streak).toBe(0);
  });

  it('graduates on a clear at full speed', () => {
    let state = startDrill(sections[1], DRILL_MAX_RATE);
    expect(state.graduated).toBe(false);
    state = advanceDrill(state, 1);
    expect(state.graduated).toBe(true);
    expect(state.rate).toBe(DRILL_MAX_RATE);
  });

  it('counts every repetition', () => {
    let state = startDrill(sections[1]);
    for (let i = 0; i < 5; i++) state = advanceDrill(state, 0.5);
    expect(state.reps).toBe(5);
  });
});

describe('P9 — the personal-best ghost', () => {
  const log = [
    { time: 0.5, score: 100 },
    { time: 2.2, score: 400 },
    { time: 4.9, score: 900 },
  ];

  it('is a step function, one value per second', () => {
    // A 15-minute track is 900 integers, small enough to ride on the
    // leaderboard row and load with it.
    // Second 0 has no sample yet, so it is 0 — and the final score is pinned
    // to the last bucket, because a 4.9s sample in a 5s chart otherwise falls
    // off the end and the ghost never reaches the PB it is racing.
    expect(sampleCurve(log, 5)).toEqual([0, 100, 100, 400, 900]);
    expect(sampleCurve([], 300)).toHaveLength(300);
  });

  it('never decreases', () => {
    const curve = sampleCurve(log, 6);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    }
  });

  it('says nothing in the first second', () => {
    // At t=0 everyone is level, and a "+0" sitting there reads as the feature
    // not working.
    expect(paceAgainst([100, 400], 0.5, 0)).toBeNull();
    expect(paceAgainst([], 10, 500)).toBeNull();
  });

  it('reports the gap once there is one', () => {
    expect(paceAgainst([100, 400, 900], 2, 1000)).toBe(100);
    expect(paceAgainst([100, 400, 900], 2, 800)).toBe(-100);
    // Past the end holds the final value rather than reading out of bounds.
    expect(paceAgainst([100, 400, 900], 99, 1000)).toBe(100);
  });

  it('refuses a malformed stored curve rather than half-reading it', () => {
    expect(readCurve([1, 2, 3])).toEqual([1, 2, 3]);
    expect(readCurve([1, 'x', 3])).toBeNull();
    expect(readCurve([1, NaN])).toBeNull();
    expect(readCurve([])).toBeNull();
    expect(readCurve(null)).toBeNull();
  });
});
