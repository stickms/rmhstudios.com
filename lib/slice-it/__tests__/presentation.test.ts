/**
 * The 2026-08-06 presentation/session wave: combo milestones (`V5`), haptic
 * hit feedback (`A8`), and the lead-in skip's engine half (`H6`).
 *
 * Three invariants this file exists to pin down:
 *
 * - **A milestone fires once per crossing, not once per frame it sits on the
 *   number.** `resolve()` runs once per judged note, so this is really about
 *   not re-firing when a broken combo climbs back through a number it already
 *   celebrated in this run.
 * - **Haptic durations are looked up per judgement, not computed from it.**
 *   MISS is the longest, and the lookup is disabled outright — not just
 *   silenced — while the setting is off.
 * - **A lead-in skip never leaves the miss sweep something to flag.** Seeking
 *   past a stretch with no notes in it must not touch the ones just beyond it.
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
    seek: (seconds: number) => {
      clock.time = Math.max(0, seconds);
    },
  };
  return { AudioManager: { getInstance: () => instance } };
});

vi.mock('../net/client', () => ({
  reportScore: vi.fn(),
  reportFinish: vi.fn(),
}));

// `vi.hoisted` so the object exists before `vi.mock`'s factory — which is
// itself hoisted above every import in this file — tries to close over it.
const platformMock = vi.hoisted(() => ({
  vibrate: vi.fn(),
  hapticsEnabled: vi.fn(() => true),
  hapticsIntensity: vi.fn(() => 1),
}));
vi.mock('@/lib/shared/platform', () => platformMock);

import { COMBO_MILESTONES, GameEngine } from '../engine';
import { useSliceItStore } from '../store';
import { DEFAULT_MODIFIERS } from '../modifiers';
import type { BeatMap, Modifiers } from '../types';

const base = (patch: Partial<Modifiers> = {}): Modifiers => ({ ...DEFAULT_MODIFIERS, ...patch });

function tapChart(count: number, startAt = 1): BeatMap {
  return {
    id: 'song-presentation',
    name: 'Presentation',
    artist: 'Test',
    audioUrl: '',
    bpm: 120,
    slices: Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      time: startAt + i * 0.5,
      type: 'STANDARD' as const,
      lane: i % 2,
    })),
  } as unknown as BeatMap;
}

const noteTime = (index: number, startAt = 1) => startAt + index * 0.5;

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

function hitNotes(engine: GameEngine, from: number, to: number, startAt = 1): void {
  for (let i = from; i < to; i++) {
    clock.time = noteTime(i, startAt);
    engine.submitInput(i % 2);
  }
}

function missNotes(engine: GameEngine, from: number, to: number, startAt = 1): void {
  for (let i = from; i < to; i++) {
    clock.time = noteTime(i, startAt) + 0.25;
    engine.update();
  }
}

beforeEach(() => {
  clock.time = 0;
  clock.duration = 600;
  platformMock.vibrate.mockClear();
  platformMock.hapticsEnabled.mockReturnValue(true);
  platformMock.hapticsIntensity.mockReturnValue(1);
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

/* ─── V5 — combo milestones ───────────────────────────────────────────────── */

describe('V5 combo milestones', () => {
  it('is exactly the escalation the plan named', () => {
    expect(COMBO_MILESTONES).toEqual([50, 100, 250, 500, 1000]);
  });

  it('says nothing before the first milestone', () => {
    const engine = startedEngine(tapChart(60), base());
    hitNotes(engine, 0, 49);
    expect(engine.getComboMilestone()).toBeNull();
  });

  it('fires the instant combo crosses 50', () => {
    const engine = startedEngine(tapChart(60), base());
    hitNotes(engine, 0, 50);
    const milestone = engine.getComboMilestone();
    expect(milestone).not.toBeNull();
    expect(milestone!.value).toBe(50);
  });

  it('does not refire while the combo climbs past it toward the next one', () => {
    const engine = startedEngine(tapChart(120), base());
    hitNotes(engine, 0, 50);
    const first = engine.getComboMilestone();

    hitNotes(engine, 50, 60); // combo now 60 — nowhere near 100
    expect(engine.getComboMilestone()).toBe(first);
  });

  it('does not refire a milestone already celebrated this run, even after a break rebuilds to it', () => {
    const engine = startedEngine(tapChart(120), base());
    hitNotes(engine, 0, 50);
    const first = engine.getComboMilestone();
    expect(first?.value).toBe(50);

    missNotes(engine, 50, 51); // breaks the combo to 0
    hitNotes(engine, 51, 101); // 50 clean hits climbs it back to exactly 50

    expect(engine.getState().combo).toBe(50);
    expect(engine.getComboMilestone()).toBe(first);
  });

  it('clears between runs, so a new attempt can celebrate 50 again', () => {
    const engine = startedEngine(tapChart(60), base());
    hitNotes(engine, 0, 50);
    expect(engine.getComboMilestone()).not.toBeNull();

    engine.reset();
    expect(engine.getComboMilestone()).toBeNull();

    void engine.loadMap(tapChart(60));
    engine.reset();
    hitNotes(engine, 0, 50);
    expect(engine.getComboMilestone()?.value).toBe(50);
  });
});

/* ─── A8 — haptic hit feedback ────────────────────────────────────────────── */

describe('A8 haptic hit feedback', () => {
  it('vibrates on a clean hit, scaled by the intensity setting', () => {
    platformMock.hapticsIntensity.mockReturnValue(0.5);
    const engine = startedEngine(tapChart(5), base());
    hitNotes(engine, 0, 1);

    // MARVELOUS is 6ms at full intensity; 0.5 halves it.
    expect(platformMock.vibrate).toHaveBeenCalledWith(3);
  });

  it('uses a longer, distinct duration for a miss than for a clean hit', () => {
    const engine = startedEngine(tapChart(5), base());
    hitNotes(engine, 0, 1);
    const hitMs = platformMock.vibrate.mock.calls.at(-1)?.[0] as number;

    platformMock.vibrate.mockClear();
    missNotes(engine, 1, 2);
    const missMs = platformMock.vibrate.mock.calls.at(-1)?.[0] as number;

    expect(missMs).toBeGreaterThan(hitMs);
  });

  it('does nothing at all when haptics are switched off', () => {
    platformMock.hapticsEnabled.mockReturnValue(false);
    const engine = startedEngine(tapChart(5), base());
    hitNotes(engine, 0, 1);
    missNotes(engine, 1, 2);

    expect(platformMock.vibrate).not.toHaveBeenCalled();
  });

  it('fires on a judged hold release too, not only the head', () => {
    const holdSeconds = 2;
    const map = {
      id: 'song-hold',
      name: 'Hold',
      artist: 'Test',
      audioUrl: '',
      bpm: 120,
      slices: [{ id: 'n1', time: 1, type: 'LONG', lane: 0, duration: holdSeconds }],
    } as unknown as BeatMap;
    const engine = startedEngine(map, base());

    clock.time = 1;
    engine.submitInput(0);
    platformMock.vibrate.mockClear();

    clock.time = 1 + holdSeconds;
    engine.submitRelease(0);

    expect(platformMock.vibrate).toHaveBeenCalledTimes(1);
  });

  it('never vibrates while stepping a replay back — this is feedback for a hand on a device right now', () => {
    const engine = startedEngine(tapChart(5), base());
    hitNotes(engine, 0, 3);
    const log = engine.getReplayLog();
    expect(log.length).toBeGreaterThan(0);

    platformMock.vibrate.mockClear();

    const viewer = startedEngine(tapChart(5), base());
    viewer.loadReplay(log);
    for (let at = 0; at <= 3; at += 1 / 60) viewer.advanceReplay(at);

    expect(platformMock.vibrate).not.toHaveBeenCalled();
  });
});

/* ─── H6 — the lead-in skip's engine half ─────────────────────────────────── */

describe('H6 GameEngine.seek', () => {
  it('moves the audio clock to the requested position', () => {
    const engine = startedEngine(tapChart(20, 10), base());
    engine.seek(8);
    expect(engine.getState().currentTime).toBeCloseTo(8, 5);
  });

  it('leaves every note reachable when the skip lands before them all', () => {
    // A 10s lead-in before the first note — the only situation H6 actually
    // uses this for.
    const engine = startedEngine(tapChart(10, 10), base());
    engine.seek(8); // 2s before the first note, per the skip's own rule

    hitNotes(engine, 0, 10, 10);
    expect(engine.getRunStats().judgements.MISS).toBe(0);
    expect(engine.getRunStats().notesResolved).toBe(10);
  });

  it('never resolves a note itself — a skip is silent, not a hit', () => {
    const engine = startedEngine(tapChart(10, 10), base());
    engine.seek(8);
    expect(engine.getRunStats().notesResolved).toBe(0);
    expect(engine.getState().combo).toBe(0);
  });
});
