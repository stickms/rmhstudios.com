/**
 * The gameplay-feedback cluster: the health gauge, quantisation, and the numbers
 * the HUD and the results screen are made of.
 *
 * Three of these are load-bearing beyond their own feature:
 *
 * - **The gauge is off by default.** It is the only modifier that can end a run
 *   early, so a regression that turns it on silently changes what the game is
 *   for everyone who never asked for it.
 * - **The gauge never ends a multiplayer run.** Dying at twelve seconds and then
 *   watching four minutes of other people's scores is not a game mode anyone
 *   chose — the same reasoning that strips Sudden Death from a lobby.
 * - **The ceiling accounts for every bonus the engine pays.** `scoring.ts` is
 *   shared by the engine, `/api/slice-it/score` and `integrity.ts`. A bonus the
 *   engine adds and `calculateScoreMultiplier` does not makes every honest
 *   submission using it implausible.
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
import { reportScore } from '../net/client';
import { useSliceItStore } from '../store';
import { DEFAULT_MODIFIERS, normalizeModifiers } from '../modifiers';
import {
  COMBO_BREAK_FULL_INTENSITY,
  COMBO_BREAK_THRESHOLD,
  HEALTH_DELTA,
  HEALTH_MAX,
  JUDGEMENT_ORDER,
  MODIFIER_BONUSES,
  QUANT_COLORS,
} from '../constants';
import {
  calculateScoreMultiplier,
  gradeFor,
  maxPlausibleScore,
  missesAllowedFor,
  nextGradeAbove,
} from '../scoring';
import { quantOf } from '../beatmap/charter';
import type { BeatMap, Modifiers } from '../types';

const base = (patch: Partial<Modifiers> = {}): Modifiers => ({ ...DEFAULT_MODIFIERS, ...patch });

/** A chart of taps a run can be made to miss by simply letting time pass. */
function tapChart(count: number): BeatMap {
  return {
    id: 'song-gauge',
    name: 'Gauge',
    artist: 'Test',
    audioUrl: '',
    bpm: 120,
    slices: Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      time: 1 + i * 0.5,
      type: 'STANDARD' as const,
      lane: i % 2,
    })),
  } as unknown as BeatMap;
}

/** When note `index` of a {@link tapChart} is due, in audio seconds. */
const noteTime = (index: number) => 1 + index * 0.5;

/**
 * Load a chart and put the store into a playing run.
 *
 * `performance.now()` is pinned to the audio clock for the whole run, and that
 * is not cosmetic: the engine debounces input per lane by
 * `INPUT_COOLDOWN_MS` of *wall clock*, so a test loop that presses six notes in
 * a microsecond has five of them swallowed by a guard that exists to stop one
 * physical press resolving two notes.
 */
function startedEngine(map: BeatMap, modifiers: Modifiers, multiplayer = false): GameEngine {
  const engine = new GameEngine();
  clock.time = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock.time * 1000);
  useSliceItStore.setState({ modifiers, audioOffset: 0, isPaused: false });
  engine.setMultiplayer(multiplayer);
  void engine.loadMap(map);
  engine.reset();
  useSliceItStore.getState().setStatus('PLAYING');
  return engine;
}

/**
 * Let notes `[from, to)` expire unhit.
 *
 * The clock lands a quarter-second past each note — comfortably outside its miss
 * window and comfortably inside the next note's — so the sweep resolves exactly
 * one note per step. Jumping straight to the end would resolve them all in one
 * `update()`, which is a different code path from the one a run takes.
 */
function missNotes(engine: GameEngine, from: number, to: number): void {
  for (let i = from; i < to; i++) {
    clock.time = noteTime(i) + 0.25;
    engine.update();
  }
}

/** Hit notes `[from, to)` exactly on time. */
function hitNotes(engine: GameEngine, from: number, to: number, lateSeconds = 0): void {
  for (let i = from; i < to; i++) {
    clock.time = noteTime(i) + lateSeconds;
    engine.submitInput(i % 2);
  }
}

beforeEach(() => {
  clock.time = 0;
  clock.duration = 600;
  vi.mocked(reportScore).mockClear();
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

/* ─── G1 — the health gauge ──────────────────────────────────────────────── */

describe('the health gauge is opt-in', () => {
  it('is off in the default modifier set', () => {
    expect(DEFAULT_MODIFIERS.healthGauge).toBe(false);
  });

  it('is off for a modifier blob stored before it existed', () => {
    // Exactly what a v2 persisted `modifiers` looks like: no `healthGauge` key.
    const legacy = {
      invisible: false,
      speed: 1,
      suddenDeath: false,
      bombs: false,
      switching: false,
      spin: false,
      strictTiming: false,
      oneTrack: false,
      difficulty: 'normal',
    };
    expect(normalizeModifiers(legacy).healthGauge).toBe(false);
  });

  it('leaves health pinned at full for a run that did not ask for it', () => {
    const engine = startedEngine(tapChart(40), base());
    missNotes(engine, 0, 40);

    expect(engine.getState().health).toBe(HEALTH_MAX);
    expect(engine.getState().gaugeBroken).toBe(false);
    expect(engine.getState().failed).toBe(false);
    // …and the run is still going. A default run cannot end early.
    expect(useSliceItStore.getState().status).toBe('PLAYING');
  });

  it('drains and ends a solo run once it empties', () => {
    // MISS is the largest drain, so this is the fewest notes that can do it.
    const needed = Math.ceil(HEALTH_MAX / -HEALTH_DELTA.MISS);
    const engine = startedEngine(tapChart(needed + 10), base({ healthGauge: true }));

    missNotes(engine, 0, needed + 10);

    expect(engine.getState().health).toBe(0);
    expect(engine.getState().gaugeBroken).toBe(true);
    expect(engine.getState().failed).toBe(true);
    expect(useSliceItStore.getState().status).toBe('FINISHED');
  });

  it('recovers on good hits rather than only ever falling', () => {
    const engine = startedEngine(tapChart(20), base({ healthGauge: true }));

    // Two misses, then a clean hit on the third note.
    missNotes(engine, 0, 2);
    const drained = engine.getState().health;
    expect(drained).toBeLessThan(HEALTH_MAX);

    hitNotes(engine, 2, 3);
    expect(engine.getState().health).toBeGreaterThan(drained);
  });
});

describe('the gauge never ends a multiplayer run', () => {
  it('keeps playing at zero and only forfeits the bonus', () => {
    const needed = Math.ceil(HEALTH_MAX / -HEALTH_DELTA.MISS);
    const engine = startedEngine(tapChart(needed + 10), base({ healthGauge: true }), true);

    missNotes(engine, 0, needed + 10);

    expect(engine.getState().health).toBe(0);
    // Broken — the bonus is gone…
    expect(engine.getState().gaugeBroken).toBe(true);
    // …but the run is not.
    expect(engine.getState().failed).toBe(false);
    expect(useSliceItStore.getState().status).toBe('PLAYING');
  });

  it('publishes the real gauge rather than a hard-coded 100', () => {
    const engine = startedEngine(tapChart(20), base({ healthGauge: true }), true);

    missNotes(engine, 0, 5);

    const calls = vi.mocked(reportScore).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)?.[0].health).toBeLessThan(HEALTH_MAX);
  });
});

/* ─── Scoring: engine and plausibility ceiling stay in step ──────────────── */

describe('calculateScoreMultiplier and the plausibility ceiling agree', () => {
  it('accounts for every declared modifier bonus', () => {
    // The invariant that keeps `/api/slice-it/score` honest: a bonus the engine
    // pays but the ceiling does not know about turns every legitimate run using
    // it into a 422.
    for (const [key, bonus] of Object.entries(MODIFIER_BONUSES)) {
      const on = calculateScoreMultiplier(base({ [key]: true } as Partial<Modifiers>));
      expect(on - calculateScoreMultiplier(base()), `bonus for ${key}`).toBeCloseTo(bonus, 5);
    }
  });

  it('raises the ceiling for a gauge run, so an honest one is not rejected', () => {
    expect(maxPlausibleScore(180, base({ healthGauge: true }))).toBeGreaterThan(
      maxPlausibleScore(180, base()),
    );
  });

  it('forfeits the bonus when the gauge breaks, and only then', () => {
    const modifiers = base({ healthGauge: true });
    expect(calculateScoreMultiplier(modifiers, { gaugeBroken: false })).toBeCloseTo(
      1 + MODIFIER_BONUSES.healthGauge,
      5,
    );
    expect(calculateScoreMultiplier(modifiers, { gaugeBroken: true })).toBeCloseTo(1, 5);
  });

  it('ignores the broken flag when the gauge was never on', () => {
    expect(calculateScoreMultiplier(base(), { gaugeBroken: true })).toBe(1);
  });

  it('keeps a real gauge run under the server ceiling it will be checked against', () => {
    const modifiers = base({ healthGauge: true });
    const engine = startedEngine(tapChart(60), modifiers);

    // Hit every note dead on.
    hitNotes(engine, 0, 60);

    const duration = noteTime(60);
    expect(engine.getState().score).toBeGreaterThan(0);
    expect(engine.getState().score).toBeLessThanOrEqual(maxPlausibleScore(duration, modifiers));
  });
});

/* ─── H2 — combo-break feedback ──────────────────────────────────────────── */

describe('combo breaks', () => {
  it('says nothing about a small one', () => {
    const engine = startedEngine(tapChart(40), base());
    // Build a chain shorter than the threshold, then drop it.
    hitNotes(engine, 0, COMBO_BREAK_THRESHOLD - 5);
    missNotes(engine, COMBO_BREAK_THRESHOLD - 5, COMBO_BREAK_THRESHOLD - 4);

    expect(engine.getState().combo).toBe(0);
    expect(engine.getComboBreak()).toBeNull();
  });

  it('reports a big one, scaled by what was lost', () => {
    const chain = COMBO_BREAK_THRESHOLD + 20;
    const engine = startedEngine(tapChart(chain + 5), base());
    hitNotes(engine, 0, chain);
    expect(engine.getState().combo).toBe(chain);

    missNotes(engine, chain, chain + 1);

    const broke = engine.getComboBreak();
    expect(broke).not.toBeNull();
    expect(broke!.magnitude).toBeCloseTo(chain / COMBO_BREAK_FULL_INTENSITY, 5);
  });

  it('fires for a sliced bomb too, not only for a missed note', () => {
    // Every path that zeroes the combo is a combo break; a bomb is the one that
    // is easiest to forget, because it does not go through `resolve`.
    const chain = COMBO_BREAK_THRESHOLD + 5;
    const map = tapChart(chain + 2);
    (map.slices as { type: string }[])[chain].type = 'BOMB';
    const engine = startedEngine(map, base());

    hitNotes(engine, 0, chain);
    hitNotes(engine, chain, chain + 1);

    expect(engine.getState().combo).toBe(0);
    expect(engine.getComboBreak()).not.toBeNull();
  });

  it('clears between runs', () => {
    const chain = COMBO_BREAK_THRESHOLD + 5;
    const engine = startedEngine(tapChart(chain + 5), base());
    hitNotes(engine, 0, chain);
    missNotes(engine, chain, chain + 1);
    expect(engine.getComboBreak()).not.toBeNull();

    engine.reset();
    expect(engine.getComboBreak()).toBeNull();
  });
});

/* ─── H7 — full combo and perfect ────────────────────────────────────────── */

describe('full-combo and perfect are derived, never tracked', () => {
  it('starts a run full-combo and stops being one on the first miss', () => {
    const engine = startedEngine(tapChart(10), base());
    expect(engine.isFullCombo).toBe(true);
    // Nothing is resolved yet, so it cannot be perfect.
    expect(engine.isPerfect).toBe(false);

    missNotes(engine, 0, 1);
    expect(engine.isFullCombo).toBe(false);
  });

  it('is perfect only when every resolved note was MARVELOUS', () => {
    const engine = startedEngine(tapChart(6), base());

    hitNotes(engine, 0, 6);

    const stats = engine.getRunStats();
    expect(stats.judgements.MARVELOUS).toBe(6);
    expect(stats.notesResolved).toBe(6);
    expect(engine.isPerfect).toBe(true);
    expect(engine.isFullCombo).toBe(true);
  });

  it('keeps a histogram that adds up to the notes resolved', () => {
    const engine = startedEngine(tapChart(12), base());

    // Half hit, half missed.
    hitNotes(engine, 0, 6);
    missNotes(engine, 6, 12);

    const stats = engine.getRunStats();
    const total = JUDGEMENT_ORDER.reduce((sum, j) => sum + stats.judgements[j], 0);
    expect(total).toBe(stats.notesResolved);
    expect(stats.judgements.MISS).toBeGreaterThan(0);
  });
});

/* ─── H1 / P5 / P6 — the timing readouts ─────────────────────────────────── */

describe('hit-offset history', () => {
  it('retains the recent signed offsets the error bar draws', () => {
    const engine = startedEngine(tapChart(5), base());

    // Press 10 ms late on every note.
    hitNotes(engine, 0, 5, 0.01);

    const { offsets, times } = engine.getRecentOffsets();
    const written = Array.from(offsets).filter((_, i) => times[i] !== 0);
    expect(written).toHaveLength(5);
    for (const offset of written) expect(offset).toBeCloseTo(0.01, 3);
  });

  it('returns the same array object every call, so the renderer allocates nothing', () => {
    const engine = startedEngine(tapChart(1), base());
    expect(engine.getRecentOffsets()).toBe(engine.getRecentOffsets());
  });

  it('reports an ungated summary for the renderer and a gated one for the wire', () => {
    const engine = startedEngine(tapChart(5), base());
    hitNotes(engine, 0, 5, 0.01);

    // Five samples is nothing to draw a conclusion from, so the submission
    // withholds it — but the error bar still needs a mean to point at.
    expect(engine.getTimingSummary()).toBeNull();
    expect(engine.getTimingStats().samples).toBe(5);
    expect(engine.getTimingStats().meanMs).toBeCloseTo(10, 0);
  });

  it('clears the ring between runs', () => {
    const engine = startedEngine(tapChart(5), base());
    hitNotes(engine, 0, 1);
    expect(engine.getTimingStats().samples).toBe(1);

    engine.reset();
    const { times } = engine.getRecentOffsets();
    expect(Array.from(times).every((t) => t === 0)).toBe(true);
    expect(engine.getTimingStats().samples).toBe(0);
  });
});

/* ─── H4 — live grade and accuracy pace ──────────────────────────────────── */

describe('nextGradeAbove', () => {
  it('names the next grade up, not the top one', () => {
    // The naive `.find(g => g.min > accuracy)` over a highest-first list answers
    // "SS" for every accuracy below 1.0, which is the bug this exists to avoid.
    expect(nextGradeAbove(0.85)?.grade).toBe('A');
    expect(nextGradeAbove(0.5)?.grade).toBe('D');
    expect(nextGradeAbove(0.96)?.grade).toBe('SS');
  });

  it('has nothing above a flawless run', () => {
    expect(nextGradeAbove(1)).toBeNull();
    expect(gradeFor(1)).toBe('SS');
  });
});

describe('missesAllowedFor', () => {
  it('counts what a spotless run still has in hand', () => {
    // 100 notes, none played yet, targeting 95%: five may be dropped.
    expect(missesAllowedFor(0, 0, 100, 0.95)).toBe(5);
  });

  it('spends the budget as notes are dropped', () => {
    // 100 notes, 10 resolved of which 2 were missed (800 weight banked).
    expect(missesAllowedFor(800, 10, 100, 0.95)).toBe(3);
  });

  it('floors at zero rather than going negative', () => {
    expect(missesAllowedFor(0, 100, 100, 0.95)).toBe(0);
  });

  it('says nothing when the chart length is unknown', () => {
    // A "0 misses left" that really means "we do not know" is worse than silence.
    expect(missesAllowedFor(0, 0, 0, 0.95)).toBeNull();
  });
});

/* ─── G8 — quantisation colouring ────────────────────────────────────────── */

describe('quantOf', () => {
  it('maps each snap position to its subdivision denominator', () => {
    expect(quantOf(0)).toBe(1);
    expect(quantOf(1 / 4)).toBe(4);
    expect(quantOf(1 / 3)).toBe(3);
    expect(quantOf(1 / 2)).toBe(2);
    expect(quantOf(2 / 3)).toBe(3);
    expect(quantOf(3 / 4)).toBe(4);
  });

  it('survives the float that an exact lookup would miss', () => {
    // A third is not representable, so any arithmetic that produces a different
    // last bit must still land on the triplet rather than falling through to
    // "on the beat".
    expect(quantOf(2 / 6)).toBe(3);
    expect(quantOf(0.3333333)).toBe(3);
    expect(quantOf(0.6666667)).toBe(3);
  });

  it('has a colour for every denominator it can return', () => {
    for (const fraction of [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4]) {
      expect(QUANT_COLORS[quantOf(fraction)]).toBeDefined();
    }
  });
});
