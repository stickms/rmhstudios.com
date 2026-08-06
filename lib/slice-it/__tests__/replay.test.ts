/**
 * Replay capture, playback and chart-aware verification (`R3`/`R4`/`R8`).
 *
 * The property under test is the one the whole feature rests on: **a replay
 * reproduces the run that produced it.** Not approximately, and not "renders
 * something plausible" — the same engine, fed its own log instead of a player,
 * has to arrive at the same score, the same combo and the same judgement
 * histogram. Everything else here exists to protect that: the vocabulary map
 * (six judgements down to the cross-game schema's four), the schema round trip
 * (a log the game produces must be a log the shared verifier accepts), and the
 * server-side re-judge that separates a real log from a fabricated one.
 *
 * The engine is driven against a stubbed AudioManager and a hand-moved clock,
 * the same harness `engine-timing.test.ts` uses — the interesting surface is the
 * accounting, not Web Audio.
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

vi.mock('../net/client', () => ({ reportScore: () => {}, reportFinish: () => {} }));
// `verify.server.ts` reaches for Prisma at module scope. Only its pure half is
// under test here; the database half is one query and is not what can be wrong.
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import { GameEngine } from '../engine';
import { useSliceItStore } from '../store';
import { DEFAULT_MODIFIERS } from '../modifiers';
import { prepareChart } from '../chart';
import { getReplayable, sliceItReplaySchema, SLICE_IT_MAX_INPUTS } from '@/lib/game/replay';
import {
  JUDGMENT_CODE,
  REPLAY_JUDGMENTS,
  REPLAY_TO_HIT_RESULT,
  modsFromReplay,
  replayMods,
  replaySeed,
} from '../replay';
import { verifyAgainstChart } from '../verify.server';
import type { BeatMap, Modifiers } from '../types';

/* ─── Harness ────────────────────────────────────────────────────────────── */

/** Eight notes, one second apart, alternating lanes. */
function chart(): BeatMap {
  return {
    id: 'song-replay',
    name: 'Replay',
    artist: 'Test',
    audioUrl: '',
    bpm: 120,
    slices: Array.from({ length: 8 }, (_, i) => ({
      id: `n${i}`,
      time: 1 + i,
      type: 'STANDARD' as const,
      lane: i % 2,
    })),
  } as unknown as BeatMap;
}

/**
 * Land inside PERFECT but outside MARVELOUS (0.02 s < offset ≤ 0.0333 s).
 *
 * Deliberate: `MARVELOUS` and `PERFECT` both store as `perfect`, so a MARVELOUS
 * run is the one case where playback legitimately scores *lower* than the run.
 * Testing exact reproduction needs a judgement that survives the round trip, and
 * the collapse itself is asserted separately below.
 */
const PERFECT_OFFSET = 0.03;

function setModifiers(overrides: Partial<Modifiers> = {}) {
  useSliceItStore.getState().setModifiers({ ...DEFAULT_MODIFIERS, ...overrides });
}

async function freshEngine(map: BeatMap): Promise<GameEngine> {
  const engine = new GameEngine();
  await engine.loadMap(map);
  useSliceItStore.getState().setStatus('PLAYING');
  useSliceItStore.getState().setIsPaused(false);
  return engine;
}

/** Move the clock to `at` and let the engine see it. */
function tick(engine: GameEngine, at: number) {
  clock.time = at;
  engine.update();
}

beforeEach(() => {
  clock.time = 0;
  clock.duration = 600;
  setModifiers();
  useSliceItStore.getState().setStatus('PLAYING');
  useSliceItStore.getState().setIsPaused(false);
  // The input cooldown is measured in `performance.now()`, and a test loop
  // resolves eight notes inside one millisecond of real time — every press after
  // the first would be swallowed. Pinning it to the audio clock makes the
  // simulated spacing the real spacing.
  vi.spyOn(performance, 'now').mockImplementation(() => clock.time * 1000);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Play the chart: hit every note whose index is not in `missed`, at
 * {@link PERFECT_OFFSET} past its time.
 */
async function playRun(missed: number[] = []): Promise<GameEngine> {
  const map = chart();
  const engine = await freshEngine(map);
  const slices = engine.getSlices();

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    if (missed.includes(i)) {
      // Past the miss window, so the sweep resolves it.
      tick(engine, slice.time + 0.5);
      continue;
    }
    tick(engine, slice.time + PERFECT_OFFSET);
    engine.submitInput(slice.lane);
  }
  tick(engine, 12);
  return engine;
}

/* ─── The vocabulary map ─────────────────────────────────────────────────── */

describe('judgement mapping', () => {
  it("narrows six engine judgements onto the schema's four", () => {
    // The contract is four values. A sixth would make every cross-game consumer
    // of `lib/game/replay.ts` non-exhaustive.
    expect(REPLAY_JUDGMENTS).toHaveLength(4);
    expect(JUDGMENT_CODE.MARVELOUS).toBe(JUDGMENT_CODE.PERFECT);
    expect(JUDGMENT_CODE.BAD).toBe(JUDGMENT_CODE.GOOD);
    expect(JUDGMENT_CODE.GREAT).not.toBe(JUDGMENT_CODE.GOOD);
    // `NONE` is "nothing was judged" and never reaches a log.
    expect(JUDGMENT_CODE.NONE).toBeLessThan(0);
  });

  it('round-trips the four values it does keep', () => {
    for (const judgment of REPLAY_JUDGMENTS) {
      const engineResult = REPLAY_TO_HIT_RESULT[judgment];
      expect(REPLAY_JUDGMENTS[JUDGMENT_CODE[engineResult]]).toBe(judgment);
    }
  });
});

describe('the run seed', () => {
  it('is stable for the same settings and different for chart-changing ones', () => {
    const base = { ...DEFAULT_MODIFIERS };
    expect(replaySeed('song-a', base)).toBe(replaySeed('song-a', base));
    expect(replaySeed('song-a', base)).not.toBe(replaySeed('song-b', base));
    expect(replaySeed('song-a', base)).not.toBe(replaySeed('song-a', { ...base, bombs: true }));
    expect(replaySeed('song-a', base)).toBeLessThan(100_000_000);
  });

  it('carries every modifier the chart is generated from', () => {
    const mods = replayMods({ ...DEFAULT_MODIFIERS, bombs: true, switching: true, speed: 1.5 });
    const restored = modsFromReplay(mods);
    // These five decide the notes and the windows, so they must survive.
    expect(restored.difficulty).toBe(DEFAULT_MODIFIERS.difficulty);
    expect(restored.bombs).toBe(true);
    expect(restored.switching).toBe(true);
    expect(restored.speed).toBe(1.5);
    expect(replaySeed('song-a', restored)).toBe(
      replaySeed('song-a', { ...DEFAULT_MODIFIERS, bombs: true, switching: true, speed: 1.5 }),
    );
  });
});

/* ─── Recording ──────────────────────────────────────────────────────────── */

describe('recording (R3)', () => {
  it('appends one entry per resolution, hits and misses alike', async () => {
    const engine = await playRun([2, 5]);
    const log = engine.getReplayLog();

    expect(log).toHaveLength(8);
    expect(log.filter((input) => input.judgment === 'miss')).toHaveLength(2);
    expect(log.filter((input) => input.judgment === 'perfect')).toHaveLength(6);
    expect(engine.getReplayStats()).toEqual({ count: 8, truncated: false });
  });

  it('records timestamps that are monotonic and in the right lane', async () => {
    const log = (await playRun([3])).getReplayLog();
    for (let i = 1; i < log.length; i++) expect(log[i].t).toBeGreaterThanOrEqual(log[i - 1].t);
    // Notes alternate lanes, and the log is in resolution order.
    expect(log.map((input) => input.lane)).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
  });

  it('logs a missed note at the note, not at the sweep that noticed it', async () => {
    // The sweep fires a full miss window after the note. On a dense chart that
    // reading can sit nearer the *following* note than its own, which is an
    // ambiguity `R8` cannot resolve — so a miss is stamped at its note's time.
    const engine = await playRun([0]);
    expect(engine.getReplayLog()[0].t).toBe(1_000);
  });

  it('produces a payload the shared schema and verifier accept', async () => {
    const engine = await playRun([1, 4]);
    const replay = engine.getReplay();
    expect(replay).not.toBeNull();

    const parsed = sliceItReplaySchema.safeParse(replay);
    expect(parsed.success).toBe(true);

    // The cross-game consistency tier must accept a log the game just produced.
    // It rejecting one would mean every honest replay was thrown away on upload.
    const verify = getReplayable('slice-it')?.verify;
    expect(verify?.(replay)).not.toBeNull();
  });

  it('is empty before anything is resolved and after a reset', async () => {
    const engine = await freshEngine(chart());
    expect(engine.getReplay()).toBeNull();

    tick(engine, 1 + PERFECT_OFFSET);
    engine.submitInput(0);
    expect(engine.getReplayStats().count).toBe(1);

    engine.reset();
    expect(engine.getReplayStats().count).toBe(0);
    expect(engine.getReplay()).toBeNull();
  });

  it("bounds the log at the schema's own limit", async () => {
    // The cap is what stops a pathological chart producing a payload that would
    // be rejected whole on arrival.
    expect(SLICE_IT_MAX_INPUTS).toBe(20_000);
    const parsed = sliceItReplaySchema.safeParse({
      track: 'song',
      inputs: Array.from({ length: SLICE_IT_MAX_INPUTS + 1 }, (_, i) => ({
        t: i,
        lane: 0,
        judgment: 'perfect' as const,
      })),
    });
    expect(parsed.success).toBe(false);
  });
});

/* ─── Playback ───────────────────────────────────────────────────────────── */

describe('playback (R4)', () => {
  it('reproduces the run it recorded', async () => {
    const played = await playRun([2, 6]);
    const original = played.getRunStats();
    const log = played.getReplayLog();

    const viewer = await freshEngine(chart());
    viewer.loadReplay(log);
    for (let at = 0; at <= 12; at += 1 / 60) viewer.advanceReplay(at);

    const replayed = viewer.getRunStats();
    expect(replayed.score).toBe(original.score);
    expect(replayed.maxCombo).toBe(original.maxCombo);
    expect(replayed.notesResolved).toBe(original.notesResolved);
    expect(replayed.accuracy).toBeCloseTo(original.accuracy, 10);
    expect(replayed.judgements.PERFECT).toBe(original.judgements.PERFECT);
    expect(replayed.judgements.MISS).toBe(original.judgements.MISS);
  });

  it('takes no input from the log twice, and records nothing while playing back', async () => {
    const log = (await playRun()).getReplayLog();
    const viewer = await freshEngine(chart());
    viewer.loadReplay(log);
    for (let at = 0; at <= 12; at += 1 / 60) viewer.advanceReplay(at);

    expect(viewer.getRunStats().notesResolved).toBe(8);
    // Playback must not write the log back over itself.
    expect(viewer.getReplayStats().count).toBe(0);
  });

  it('scrubs by re-simulating, landing where playing straight through lands', async () => {
    const log = (await playRun([4])).getReplayLog();

    const straight = await freshEngine(chart());
    straight.loadReplay(log);
    for (let at = 0; at <= 6; at += 1 / 60) straight.advanceReplay(at);
    const expected = straight.getRunStats();

    const scrubbed = await freshEngine(chart());
    scrubbed.loadReplay(log);
    // Jump forward, then back, then forward again — a scrubber's real usage.
    scrubbed.seekReplay(9);
    scrubbed.seekReplay(2);
    scrubbed.seekReplay(6);

    const after = scrubbed.getRunStats();
    expect(after.score).toBe(expected.score);
    expect(after.notesResolved).toBe(expected.notesResolved);
    expect(after.maxCombo).toBe(expected.maxCombo);
    expect(scrubbed.getReplayTime()).toBe(6);
  });

  it('leaves the store as it found it after a scrub of a paused replay', async () => {
    const log = (await playRun()).getReplayLog();
    const viewer = await freshEngine(chart());
    viewer.loadReplay(log);

    useSliceItStore.getState().setIsPaused(true);
    viewer.seekReplay(5);

    // The seek forces the run "live" to re-simulate; a viewer that was paused
    // must still be paused when it is done.
    expect(useSliceItStore.getState().isPaused).toBe(true);
    expect(viewer.getRunStats().notesResolved).toBeGreaterThan(0);
  });
});

/* ─── Server-side verification ───────────────────────────────────────────── */

describe('verification against the chart (R8)', () => {
  it('accepts an honest run and re-derives its score', async () => {
    const engine = await playRun([3]);
    const replay = engine.getReplay()!;
    const notes = prepareChart(chart(), modsFromReplay(replay.mods));

    const result = verifyAgainstChart(replay, notes, engine.getRunStats().score);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The chart-aware re-judge reaches the same number the engine did.
    expect(result.score).toBe(engine.getRunStats().score);
    expect(result.notesResolved).toBe(8);
    expect(result.maxCombo).toBe(engine.getRunStats().maxCombo);
  });

  it('rejects a log whose inputs land where the chart has no notes', async () => {
    const replay = (await playRun())!.getReplay()!;
    const notes = prepareChart(chart(), modsFromReplay(replay.mods));

    // The exact cheat the consistency tier cannot see: a well-formed, monotonic,
    // internally consistent log of judgements for notes that do not exist.
    const fabricated = {
      ...replay,
      inputs: Array.from({ length: 40 }, (_, i) => ({
        t: 20_000 + i * 20,
        lane: 0,
        judgment: 'perfect' as const,
      })),
    };
    // It passes the shared verifier…
    expect(getReplayable('slice-it')?.verify?.(fabricated)).not.toBeNull();
    // …and fails this one.
    const result = verifyAgainstChart(fabricated, notes);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('input-matches-no-note');
  });

  it('rejects a judgement the timing does not support', async () => {
    const engine = await playRun();
    const replay = engine.getReplay()!;
    const notes = prepareChart(chart(), modsFromReplay(replay.mods));

    // Same inputs, same times — one of them relabelled as a better judgement
    // than its own timing earns. The claim is data, not evidence.
    const inputs = replay.inputs.map((input, i) =>
      i === 2 ? { ...input, t: input.t + 150, judgment: 'perfect' as const } : input,
    );
    const result = verifyAgainstChart({ ...replay, inputs }, notes);
    expect(result.ok).toBe(false);
  });

  it('rejects a score its own inputs cannot produce', async () => {
    const engine = await playRun([1, 2, 3, 4, 5, 6, 7]);
    const replay = engine.getReplay()!;
    const notes = prepareChart(chart(), modsFromReplay(replay.mods));

    // One note hit, seven missed — and a claim of a hundred thousand points.
    const result = verifyAgainstChart(replay, notes, 100_000);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('score-mismatch');
  });

  it('will not let two inputs claim the same note', async () => {
    const engine = await playRun();
    const replay = engine.getReplay()!;
    const notes = prepareChart(chart(), modsFromReplay(replay.mods));

    const doubled = { ...replay, inputs: [replay.inputs[0], ...replay.inputs] };
    const result = verifyAgainstChart(doubled, notes);
    expect(result.ok).toBe(false);
  });
});
