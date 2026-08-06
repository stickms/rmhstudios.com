/**
 * Note and judgement vocabulary, 2026-08-06 wave: judged hold releases (G5),
 * adjustable judgement windows (A9), and perfect-or-die (M6).
 *
 * Three invariants this file exists to pin down, each the failure mode its
 * own feature warns about:
 *
 * - **A release is a judgement, not a bonus.** Before G5, an LN's tail either
 *   paid a flat amount or it didn't — it never touched `notesResolved` or
 *   `hitPoints`, so an LN chart's accuracy was inflated by a tail nothing
 *   judged. It has to actually move the denominator.
 * - **Lenient Timing is the mirror of Strict Timing, and it changes what a
 *   press resolves to** — not just a number shown in settings. A press that
 *   is a ghost tap on stock windows has to become a real (if bad) judgement
 *   on Lenient ones, or the setting is cosmetic.
 * - **Perfectionist and Sudden Death cannot both be active.** Whichever one
 *   wins, only one "one mistake ends it" bonus can ever be on the table for a
 *   single run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A clock the test moves by hand, standing in for the audio context. */
const clock = { time: 0, duration: 600 };

vi.mock('../../audio/AudioManager', () => {
  const instance = {
    getCurrentTime: () => clock.time,
    getDuration: () => clock.duration,
    setPlaybackRate: () => {},
    loadFromBuffer: () => {},
    loadTrack: async () => {},
    play: () => {},
    pause: () => {},
    stop: () => {},
    playSfX: () => {},
    playHitSoundFile: () => {},
    preloadHitSound: async () => {},
    getContext: () => null,
  };
  return { AudioManager: { getInstance: () => instance } };
});

vi.mock('../net/client', () => ({
  reportScore: vi.fn(),
  reportFinish: vi.fn(),
}));

import { GameEngine } from '../engine';
import { useSliceItStore } from '../store';
import { DEFAULT_MODIFIERS, applyExclusions, forMultiplayer } from '../modifiers';
import {
  HIT_WINDOWS,
  LENIENT_TIMING_FACTOR,
  MODIFIER_BONUSES,
  RELEASE_WINDOW_SCALE,
  STRICT_TIMING_FACTOR,
} from '../constants';
import { calculateScoreMultiplier, judge, maxPlausibleScore, timingScale } from '../scoring';
import type { BeatMap, Modifiers } from '../types';

const base = (patch: Partial<Modifiers> = {}): Modifiers => ({ ...DEFAULT_MODIFIERS, ...patch });

/** One LONG note per entry, spaced far enough apart that holds never overlap. */
function holdsChart(count: number, holdSeconds: number): BeatMap {
  return {
    id: 'song-holds',
    name: 'Holds',
    artist: 'Test',
    audioUrl: '',
    bpm: 120,
    slices: Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      time: 1 + i * (holdSeconds + 2),
      type: 'LONG' as const,
      lane: i % 2,
      duration: holdSeconds,
    })),
  } as unknown as BeatMap;
}

/** When hold `index` of a {@link holdsChart} starts and ends, in audio seconds. */
function holdSpan(index: number, holdSeconds: number) {
  const start = 1 + index * (holdSeconds + 2);
  return { start, end: start + holdSeconds };
}

/** A single tap note at t=10, so a press can be judged against it in isolation. */
function oneTapChart(): BeatMap {
  return {
    id: 'song-tap',
    name: 'Tap',
    artist: 'Test',
    audioUrl: '',
    bpm: 120,
    slices: [{ id: 'n1', time: 10, type: 'STANDARD', lane: 0 }],
  } as unknown as BeatMap;
}

/** Load a chart, apply `modifiers`, and put the store into a playing run. */
function startedEngine(map: BeatMap, modifiers: Modifiers): GameEngine {
  const engine = new GameEngine();
  clock.time = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock.time * 1000);
  useSliceItStore.setState({ modifiers, audioOffset: 0, isPaused: false });
  void engine.loadMap(map);
  engine.reset();
  useSliceItStore.getState().setStatus('PLAYING');
  return engine;
}

beforeEach(() => {
  clock.time = 0;
  clock.duration = 600;
  useSliceItStore.setState({
    modifiers: { ...DEFAULT_MODIFIERS },
    audioOffset: 0,
    status: 'PLAYING',
    isPaused: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ─── G5 — judged hold releases ───────────────────────────────────────────── */

describe('G5: a hold release is judged, not a flat bonus', () => {
  it('judges a dead-on release MARVELOUS and folds it into accuracy', () => {
    const holdSeconds = 2;
    const engine = startedEngine(holdsChart(1, holdSeconds), base());
    const { start, end } = holdSpan(0, holdSeconds);

    clock.time = start;
    engine.submitInput(0);
    clock.time = end;
    engine.submitRelease(0);

    const stats = engine.getRunStats();
    // Head + release, both MARVELOUS: two judged notes, full accuracy.
    expect(stats.notesResolved).toBe(2);
    expect(stats.judgements.MARVELOUS).toBe(2);
    expect(stats.accuracy).toBeCloseTo(1, 5);
  });

  it('judges a release outside a TAP window but inside the wider RELEASE window', () => {
    const holdSeconds = 2;
    const lateBy = 0.2; // > tap BAD (0.191666s), < release GOOD (0.158333 * 1.5)
    expect(lateBy).toBeGreaterThan(HIT_WINDOWS.BAD);
    expect(lateBy).toBeLessThan(HIT_WINDOWS.GOOD * RELEASE_WINDOW_SCALE);

    const engine = startedEngine(holdsChart(1, holdSeconds), base());
    const { start, end } = holdSpan(0, holdSeconds);

    clock.time = start;
    engine.submitInput(0);
    clock.time = end + lateBy;
    engine.submitRelease(0);

    const stats = engine.getRunStats();
    // A real judgement (GOOD), not a MISS and not silently ignored — the whole
    // point of G5 is that this offset now means something.
    expect(stats.judgements.GOOD).toBe(1);
    expect(stats.judgements.MISS).toBe(0);
  });

  it('judges a release outside the RELEASE window as a MISS, and it costs accuracy', () => {
    const holdSeconds = 2;
    const wayLate = HIT_WINDOWS.BAD * RELEASE_WINDOW_SCALE + 0.1;

    const engine = startedEngine(holdsChart(1, holdSeconds), base());
    const { start, end } = holdSpan(0, holdSeconds);

    clock.time = start;
    engine.submitInput(0);
    clock.time = end + wayLate;
    engine.submitRelease(0);

    const stats = engine.getRunStats();
    expect(stats.notesResolved).toBe(2);
    expect(stats.judgements.MISS).toBe(1);
    // One MARVELOUS head (100) + one MISS release (0) out of 2 notes = 50%.
    expect(stats.accuracy).toBeCloseTo(0.5, 5);
  });

  it('judges a hold nobody released at all as a MISS once its release window elapses', () => {
    const holdSeconds = 2;
    const engine = startedEngine(holdsChart(1, holdSeconds), base());
    const { start, end } = holdSpan(0, holdSeconds);

    clock.time = start;
    engine.submitInput(0);
    // Never call submitRelease — advance well past the release's own MISS
    // boundary and let the frame loop's sweep catch it.
    clock.time = end + HIT_WINDOWS.BAD * RELEASE_WINDOW_SCALE + 0.5;
    engine.update();

    const stats = engine.getRunStats();
    expect(stats.notesResolved).toBe(2);
    expect(stats.judgements.MISS).toBe(1);
    expect(stats.accuracy).toBeCloseTo(0.5, 5);

    // A late `submitRelease` after the sweep already resolved it must not
    // double-count — the hold is gone from `activeHolds`.
    engine.submitRelease(0);
    expect(engine.getRunStats().notesResolved).toBe(2);
  });

  it('sizes the HUD denominator (totalNotes) to include every hold release', () => {
    const engine = startedEngine(holdsChart(3, 1), base());
    // 3 chart notes, all LONG: 3 heads + 3 releases = 6 judgeable events.
    expect(engine.getState().totalNotes).toBe(6);
  });

  it('keeps a flawless multi-hold run under the server ceiling it will be checked against', () => {
    const holdSeconds = 1.5;
    const count = 8;
    const modifiers = base();
    const engine = startedEngine(holdsChart(count, holdSeconds), modifiers);

    for (let i = 0; i < count; i++) {
      const { start, end } = holdSpan(i, holdSeconds);
      clock.time = start;
      engine.submitInput(i % 2);
      clock.time = end;
      engine.submitRelease(i % 2);
    }

    const { end: duration } = holdSpan(count - 1, holdSeconds);
    const score = engine.getState().score;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(maxPlausibleScore(duration, modifiers));
  });
});

/* ─── A9 — adjustable judgement windows ───────────────────────────────────── */

describe('A9: Lenient Timing mirrors Strict Timing', () => {
  it('widens the scale by LENIENT_TIMING_FACTOR, unlike strict which shrinks it', () => {
    expect(timingScale(base({ lenientTiming: true }))).toBe(LENIENT_TIMING_FACTOR);
    expect(LENIENT_TIMING_FACTOR).toBeGreaterThan(1);
    expect(STRICT_TIMING_FACTOR).toBeLessThan(1);
  });

  it('lets strict win the tie so the two can never disagree with applyExclusions', () => {
    expect(timingScale(base({ strictTiming: true, lenientTiming: true }))).toBe(
      STRICT_TIMING_FACTOR,
    );
  });

  it('is dropped by applyExclusions when strict is also on', () => {
    const result = applyExclusions(base({ strictTiming: true, lenientTiming: true }));
    expect(result.strictTiming).toBe(true);
    expect(result.lenientTiming).toBe(false);
  });

  it('is unranked: it earns no score bonus', () => {
    expect(calculateScoreMultiplier(base({ lenientTiming: true }))).toBe(1);
    expect(MODIFIER_BONUSES).not.toHaveProperty('lenientTiming');
  });

  it('turns a ghost tap on stock windows into a real judgement on lenient ones', () => {
    // Just past the tap BAD window (0.191666s) — a ghost tap on stock timing.
    const lateBy = 0.23;
    expect(lateBy).toBeGreaterThan(HIT_WINDOWS.BAD);
    expect(lateBy).toBeLessThan(HIT_WINDOWS.BAD * LENIENT_TIMING_FACTOR);

    const stock = startedEngine(oneTapChart(), base());
    clock.time = 10 + lateBy;
    stock.submitInput(0);
    // Ghost tap: nothing was judged, so it does not touch accuracy.
    expect(stock.getRunStats().notesResolved).toBe(0);

    const lenient = startedEngine(oneTapChart(), base({ lenientTiming: true }));
    clock.time = 10 + lateBy;
    lenient.submitInput(0);
    // Same press, same offset, wider window: this time it is a real (if bad)
    // judgement — the abstraction changed what actually happened, not just
    // what a settings screen reports.
    expect(lenient.getRunStats().notesResolved).toBe(1);
  });

  it('judge() itself widens the same way, with no NONE outcome to guard against', () => {
    const offset = HIT_WINDOWS.BAD * 1.1;
    expect(judge(offset, timingScale(base()))).toBe('MISS');
    expect(judge(offset, timingScale(base({ lenientTiming: true })))).not.toBe('MISS');
  });
});

/* ─── M6 — perfect-or-die ─────────────────────────────────────────────────── */

describe('M6: Perfectionist and Sudden Death are mutually exclusive', () => {
  it('drops Sudden Death when Perfectionist is set, never the other way round', () => {
    const both = applyExclusions(base({ perfectionist: true, suddenDeath: true }));
    expect(both.perfectionist).toBe(true);
    expect(both.suddenDeath).toBe(false);
  });

  it('is a no-op when only one of the pair is set', () => {
    expect(applyExclusions(base({ perfectionist: true })).perfectionist).toBe(true);
    expect(applyExclusions(base({ suddenDeath: true })).suddenDeath).toBe(true);
  });

  it('is dropped in multiplayer, same as Sudden Death', () => {
    expect(forMultiplayer(base({ perfectionist: true })).perfectionist).toBe(false);
  });

  it('pays a bonus larger than every other single modifier — "correspondingly large"', () => {
    for (const [key, bonus] of Object.entries(MODIFIER_BONUSES)) {
      if (key === 'perfectionist') continue;
      expect(MODIFIER_BONUSES.perfectionist, `vs ${key}`).toBeGreaterThan(bonus);
    }
  });

  it('ends the run the instant a judgement is worse than PERFECT', () => {
    const engine = startedEngine(oneTapChart(), base({ perfectionist: true }));
    // Late enough for GREAT, nowhere near a MISS.
    clock.time = 10 + HIT_WINDOWS.PERFECT * 1.5;
    engine.submitInput(0);

    const stats = engine.getRunStats();
    expect(stats.judgements.GREAT).toBe(1);
    expect(stats.failed).toBe(true);
    expect(stats.failReason).toBe('perfectionist');
    expect(useSliceItStore.getState().status).toBe('FINISHED');
  });

  it('does not end the run on MARVELOUS or PERFECT', () => {
    const engine = startedEngine(oneTapChart(), base({ perfectionist: true }));
    clock.time = 10;
    engine.submitInput(0);

    const stats = engine.getRunStats();
    expect(stats.judgements.MARVELOUS).toBe(1);
    expect(stats.failed).toBe(false);
    expect(stats.failReason).toBeNull();
    expect(useSliceItStore.getState().status).toBe('PLAYING');
  });

  it('also ends the run on a bad hold RELEASE, not only a tap', () => {
    const holdSeconds = 2;
    const engine = startedEngine(holdsChart(1, holdSeconds), base({ perfectionist: true }));
    const { start, end } = holdSpan(0, holdSeconds);

    clock.time = start;
    engine.submitInput(0); // MARVELOUS head — survives.
    expect(engine.getRunStats().failed).toBe(false);

    clock.time = end + HIT_WINDOWS.GOOD * RELEASE_WINDOW_SCALE * 1.1; // a GOOD-or-worse release
    engine.submitRelease(0);

    const stats = engine.getRunStats();
    expect(stats.failed).toBe(true);
    expect(stats.failReason).toBe('perfectionist');
  });

  it('never ends the run for a modifier set where it is off', () => {
    const engine = startedEngine(oneTapChart(), base());
    clock.time = 10 + HIT_WINDOWS.BAD * 0.9; // a BAD, not a MISS
    engine.submitInput(0);

    expect(engine.getRunStats().failed).toBe(false);
    expect(useSliceItStore.getState().status).toBe('PLAYING');
  });
});
