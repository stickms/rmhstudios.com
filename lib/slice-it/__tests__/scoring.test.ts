/**
 * Scoring, modifiers and chart preparation.
 *
 * These are the rules the client uses to produce a score and the server uses to
 * decide whether to believe one, so a drift between them is a leaderboard that
 * rejects honest runs or accepts invented ones.
 */

import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_MULTIPLIERS,
  HIT_WINDOWS,
  MAX_SPEED,
  MIN_SPEED,
  MODIFIER_BONUSES,
  STRICT_TIMING_FACTOR,
} from '../constants';
import {
  accuracyOf,
  accuracyWeight,
  calculateScoreMultiplier,
  gradeFor,
  judge,
  maxPlausibleCombo,
  maxPlausibleScore,
  pointsFor,
  timingScale,
} from '../scoring';
import {
  DEFAULT_MODIFIERS,
  activeModifierKeys,
  applyExclusions,
  forMultiplayer,
  normalizeModifiers,
} from '../modifiers';
import {
  applyChartModifiers,
  chartSeed,
  createSeededRandom,
  prepareChart,
  resolveSlices,
  scorableNoteCount,
} from '../chart';
import type { BeatMap, Modifiers, Slice } from '../types';

const base = (patch: Partial<Modifiers> = {}): Modifiers => ({ ...DEFAULT_MODIFIERS, ...patch });

describe('calculateScoreMultiplier', () => {
  it('is 1.0 for a default run', () => {
    expect(calculateScoreMultiplier(base())).toBe(1);
  });

  it('scales with difficulty', () => {
    for (const [difficulty, expected] of Object.entries(DIFFICULTY_MULTIPLIERS)) {
      expect(calculateScoreMultiplier(base({ difficulty: difficulty as never }))).toBeCloseTo(
        expected,
        5,
      );
    }
  });

  it('adds modifier bonuses rather than multiplying them', () => {
    const all = base({
      invisible: true,
      bombs: true,
      switching: false,
      spin: true,
      strictTiming: true,
      oneTrack: true,
    });
    const expected =
      1 +
      MODIFIER_BONUSES.invisible +
      MODIFIER_BONUSES.bombs +
      MODIFIER_BONUSES.spin +
      MODIFIER_BONUSES.strictTiming +
      MODIFIER_BONUSES.oneTrack;
    expect(calculateScoreMultiplier(all)).toBeCloseTo(expected, 5);
  });

  it('rewards speed above 1.0 and never below it', () => {
    expect(calculateScoreMultiplier(base({ speed: 2 }))).toBeGreaterThan(1);
    // Slowing a chart down is not an achievement; it earns no bonus.
    expect(calculateScoreMultiplier(base({ speed: 0.5 }))).toBe(1);
  });

  it('survives a null or partial modifier object', () => {
    expect(calculateScoreMultiplier(null)).toBe(1);
    expect(calculateScoreMultiplier({})).toBe(1);
    expect(calculateScoreMultiplier({ speed: Number.NaN })).toBe(1);
  });
});

describe('judge', () => {
  it('grades by distance from the note', () => {
    expect(judge(0, 1)).toBe('MARVELOUS');
    expect(judge(HIT_WINDOWS.PERFECT * 0.9, 1)).toBe('PERFECT');
    expect(judge(HIT_WINDOWS.GREAT * 0.9, 1)).toBe('GREAT');
    expect(judge(HIT_WINDOWS.GOOD * 0.9, 1)).toBe('GOOD');
    expect(judge(HIT_WINDOWS.BAD * 0.99, 1)).toBe('BAD');
    expect(judge(HIT_WINDOWS.BAD * 1.01, 1)).toBe('MISS');
  });

  it('is symmetric — early and late are judged the same', () => {
    expect(judge(-HIT_WINDOWS.GREAT * 0.9, 1)).toBe(judge(HIT_WINDOWS.GREAT * 0.9, 1));
  });

  it('shrinks with strict timing', () => {
    const scale = timingScale({ strictTiming: true, speed: 1 });
    expect(scale).toBeCloseTo(STRICT_TIMING_FACTOR, 5);
    // A hit that was PERFECT at normal timing is not, once the window shrinks.
    const delta = HIT_WINDOWS.PERFECT * 0.9;
    expect(judge(delta, 1)).toBe('PERFECT');
    expect(judge(delta, scale)).not.toBe('PERFECT');
  });

  it('scales the window with playback rate, keeping musical leniency constant', () => {
    expect(timingScale({ strictTiming: false, speed: 2 })).toBe(2);
    expect(timingScale({ strictTiming: false, speed: 0 })).toBe(1);
  });
});

describe('points and accuracy', () => {
  it('multiplies base points by combo and multiplier', () => {
    expect(pointsFor('MARVELOUS', 4, 1)).toBe(1000);
    expect(pointsFor('MARVELOUS', 4, 1.5)).toBe(1500);
  });

  it('treats a zero combo as 1x rather than zeroing the hit', () => {
    expect(pointsFor('GOOD', 0, 1)).toBe(75);
  });

  it('scores a miss at nothing', () => {
    expect(pointsFor('MISS', 100, 2)).toBe(0);
    expect(pointsFor('NONE', 100, 2)).toBe(0);
  });

  it('weights accuracy by judgement', () => {
    expect(accuracyWeight('MARVELOUS')).toBe(100);
    expect(accuracyWeight('PERFECT')).toBe(100);
    expect(accuracyWeight('GREAT')).toBe(75);
    expect(accuracyWeight('BAD')).toBe(0);
    expect(accuracyWeight('MISS')).toBe(0);
  });

  it('reads 0 before anything is judged, not NaN', () => {
    expect(accuracyOf(0, 0)).toBe(0);
  });

  it('clamps to 0–1', () => {
    expect(accuracyOf(100, 1)).toBe(1);
    expect(accuracyOf(500, 1)).toBe(1);
    expect(accuracyOf(-5, 1)).toBe(0);
  });

  it('grades an accuracy', () => {
    expect(gradeFor(1)).toBe('SS');
    expect(gradeFor(0.96)).toBe('S');
    expect(gradeFor(0.91)).toBe('A');
    expect(gradeFor(0.5)).toBe('F');
  });
});

describe('plausibility bounds', () => {
  it('bounds a score by the song length', () => {
    const short = maxPlausibleScore(30, base());
    const long = maxPlausibleScore(300, base());
    expect(long).toBeGreaterThan(short);
  });

  it('is generous enough for a flawless run', () => {
    // A perfect 3-minute Expert chart: every note MARVELOUS, combo climbing.
    const notes = 3 * 60 * 6; // the Expert density budget
    const perfect = 250 * ((notes * (notes + 1)) / 2) * DIFFICULTY_MULTIPLIERS.expert;
    expect(maxPlausibleScore(180, base({ difficulty: 'expert' }))).toBeGreaterThan(perfect);
  });

  it('rejects a number that no run could reach', () => {
    // The old endpoint's only check was "under one billion".
    expect(maxPlausibleScore(120, base())).toBeLessThan(1_000_000_000);
  });

  it('scales the ceiling with the run multiplier', () => {
    expect(maxPlausibleScore(120, base({ strictTiming: true }))).toBeGreaterThan(
      maxPlausibleScore(120, base()),
    );
  });

  it('gives a floor for a song with missing or nonsense duration', () => {
    expect(maxPlausibleScore(0, base())).toBeGreaterThan(0);
    expect(maxPlausibleScore(Number.NaN, base())).toBeGreaterThan(0);
    expect(maxPlausibleCombo(0)).toBeGreaterThanOrEqual(64);
  });
});

describe('normalizeModifiers', () => {
  it('fills in defaults for a missing object', () => {
    expect(normalizeModifiers(undefined)).toEqual(DEFAULT_MODIFIERS);
    expect(normalizeModifiers(null)).toEqual(DEFAULT_MODIFIERS);
    expect(normalizeModifiers('nonsense')).toEqual(DEFAULT_MODIFIERS);
  });

  it('clamps speed to range and to slider steps', () => {
    expect(normalizeModifiers({ speed: 99 }).speed).toBe(MAX_SPEED);
    expect(normalizeModifiers({ speed: -3 }).speed).toBe(MIN_SPEED);
    expect(normalizeModifiers({ speed: 1.34 }).speed).toBe(1.3);
  });

  it('coerces junk booleans and an unknown difficulty', () => {
    const parsed = normalizeModifiers({ bombs: 'yes', difficulty: 'nightmare' });
    expect(parsed.bombs).toBe(false);
    expect(parsed.difficulty).toBe('normal');
  });

  it('resolves the switching/one-track contradiction rather than letting the engine pick', () => {
    const parsed = normalizeModifiers({ switching: true, oneTrack: true });
    expect(parsed.switching).toBe(false);
    expect(parsed.oneTrack).toBe(true);
  });

  it('leaves a valid set alone', () => {
    const input = base({ speed: 1.5, bombs: true, difficulty: 'hard' });
    expect(normalizeModifiers(input)).toEqual(input);
  });
});

describe('forMultiplayer', () => {
  it('floors speed at 1.0 — a slower chart in a race is a free easy mode', () => {
    expect(forMultiplayer(base({ speed: 0.5 })).speed).toBe(1);
  });

  it('leaves a faster chart alone', () => {
    expect(forMultiplayer(base({ speed: 1.8 })).speed).toBe(1.8);
  });

  it('drops sudden death — dying at 12 seconds is not a multiplayer mode', () => {
    expect(forMultiplayer(base({ suddenDeath: true })).suddenDeath).toBe(false);
  });

  it('still applies the exclusions', () => {
    expect(forMultiplayer(base({ switching: true, oneTrack: true })).switching).toBe(false);
  });
});

describe('activeModifierKeys', () => {
  it('lists only what differs from the defaults', () => {
    expect(activeModifierKeys(base())).toEqual([]);
    expect(activeModifierKeys(base({ bombs: true, speed: 1.5 }))).toEqual(['bombs', 'speed']);
  });
});

describe('applyExclusions', () => {
  it('is a no-op when nothing conflicts', () => {
    const input = base({ bombs: true });
    expect(applyExclusions(input)).toEqual(input);
  });
});

/* ─── Charts ─────────────────────────────────────────────────────────────── */

function slicesOf(count: number): Slice[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    time: i * 0.25,
    type: 'STANDARD' as const,
    lane: i % 2,
  }));
}

const flatMap: BeatMap = {
  id: 'song',
  name: 'Song',
  artist: 'Artist',
  audioUrl: '',
  bpm: 120,
  slices: slicesOf(200),
};

const tieredMap: BeatMap = {
  ...flatMap,
  slices: {
    easy: slicesOf(20),
    normal: slicesOf(50),
    hard: slicesOf(100),
    expert: slicesOf(200),
  },
};

describe('resolveSlices', () => {
  it('reads a legacy flat chart at any difficulty', () => {
    expect(resolveSlices(flatMap, 'expert')).toHaveLength(200);
  });

  it('picks the per-difficulty variant', () => {
    expect(resolveSlices(tieredMap, 'easy')).toHaveLength(20);
    expect(resolveSlices(tieredMap, 'expert')).toHaveLength(200);
  });

  it('falls back to normal for a difficulty the chart lacks', () => {
    const partial = { ...flatMap, slices: { normal: slicesOf(7) } } as unknown as BeatMap;
    expect(resolveSlices(partial, 'expert')).toHaveLength(7);
  });

  it('returns a copy, so a run cannot mutate the stored chart', () => {
    const first = resolveSlices(flatMap, 'normal');
    first[0].hit = true;
    expect(resolveSlices(flatMap, 'normal')[0].hit).toBeUndefined();
  });

  it('returns nothing for a chart with no usable slices', () => {
    const broken = { ...flatMap, slices: {} } as unknown as BeatMap;
    expect(resolveSlices(broken, 'normal')).toEqual([]);
  });
});

describe('chart modifiers', () => {
  it('collapses every note to one lane under One Track', () => {
    const out = applyChartModifiers(
      slicesOf(50),
      base({ oneTrack: true }),
      createSeededRandom('s'),
    );
    expect(out.every((s) => s.lane === 0)).toBe(true);
  });

  it('converts some notes to bombs under Bombs', () => {
    const out = applyChartModifiers(slicesOf(500), base({ bombs: true }), createSeededRandom('s'));
    const bombs = out.filter((s) => s.type === 'BOMB').length;
    expect(bombs).toBeGreaterThan(0);
    expect(bombs).toBeLessThan(out.length / 2);
  });

  it('never converts a hold into a bomb or a switch', () => {
    const withHold: Slice[] = [
      { id: 'h', time: 1, type: 'LONG', lane: 0, duration: 2 },
      ...slicesOf(50),
    ];
    const out = applyChartModifiers(
      withHold,
      base({ bombs: true, switching: true }),
      createSeededRandom('s'),
    );
    expect(out.find((s) => s.id === 'h')?.type).toBe('LONG');
  });

  it('never switches a note into a lane a hold is occupying', () => {
    // A hold covering lane 1 for the whole chart: no note may switch into it.
    const chart: Slice[] = [
      { id: 'hold', time: 0, type: 'LONG', lane: 1, duration: 60 },
      ...slicesOf(200).map((s) => ({ ...s, lane: 0 })),
    ];
    const out = applyChartModifiers(chart, base({ switching: true }), createSeededRandom('s'));
    expect(out.filter((s) => s.type === 'SWITCH')).toHaveLength(0);
  });

  it('does nothing without a chart-rewriting modifier', () => {
    const input = slicesOf(30);
    expect(applyChartModifiers(input, base(), createSeededRandom('s'))).toEqual(input);
  });
});

describe('prepareChart determinism', () => {
  it('produces the same chart twice for the same settings', () => {
    const modifiers = base({ bombs: true, switching: true, difficulty: 'hard' });
    expect(JSON.stringify(prepareChart(tieredMap, modifiers))).toBe(
      JSON.stringify(prepareChart(tieredMap, modifiers)),
    );
  });

  it('produces a different chart for different settings', () => {
    expect(JSON.stringify(prepareChart(tieredMap, base({ bombs: true })))).not.toBe(
      JSON.stringify(prepareChart(tieredMap, base())),
    );
  });

  it('seeds on everything that changes the notes, and nothing that does not', () => {
    // Speed changes playback, not the chart — so it must not reseed it, or a
    // player could not practise the same bombs at a different speed.
    expect(chartSeed('song', base({ speed: 1 }))).toBe(chartSeed('song', base({ speed: 2 })));
    expect(chartSeed('song', base({ bombs: true }))).not.toBe(chartSeed('song', base()));
    expect(chartSeed('a', base())).not.toBe(chartSeed('b', base()));
  });

  it('clears runtime hit state', () => {
    const prepared = prepareChart(tieredMap, base());
    expect(prepared.every((s) => s.hit === false && s.hitTime === undefined)).toBe(true);
  });
});

describe('scorableNoteCount', () => {
  it('excludes bombs and silent notes', () => {
    const chart: Slice[] = [
      { id: 'a', time: 0, type: 'STANDARD', lane: 0 },
      { id: 'b', time: 1, type: 'BOMB', lane: 0 },
      { id: 'c', time: 2, type: 'SILENT', lane: 0 },
      { id: 'd', time: 3, type: 'LONG', lane: 1, duration: 1 },
    ];
    expect(scorableNoteCount(chart)).toBe(2);
  });
});

describe('createSeededRandom', () => {
  it('is reproducible', () => {
    const a = createSeededRandom('seed');
    const b = createSeededRandom('seed');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('differs by seed', () => {
    expect(createSeededRandom('a')()).not.toBe(createSeededRandom('b')());
  });

  it('stays in [0, 1)', () => {
    const random = createSeededRandom('range');
    for (let i = 0; i < 500; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
