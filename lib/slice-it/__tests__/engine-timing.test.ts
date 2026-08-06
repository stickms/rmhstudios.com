/**
 * The engine's clock, and the property everything else rests on: **the same run
 * scores the same on any hardware.**
 *
 * A rhythm game that accumulates anything per rendered frame is a rhythm game
 * where a 144 Hz display outscores a 60 Hz one and a stuttering phone is
 * penalised for stuttering. It is also, quietly, a cheat: cap your frame rate
 * high and the number goes up. This file drives the engine at several frame
 * rates over identical audio and requires the outcome to match.
 *
 * The engine is driven directly against a stubbed AudioManager — the interesting
 * surface is the accounting, not Web Audio.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A clock the test moves by hand, standing in for the audio context. */
const clock = { time: 0, duration: 600, playing: true };

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
  reportScore: () => {},
  reportFinish: () => {},
}));

import { GameEngine } from '../engine';
import { useSliceItStore } from '../store';
import { DEFAULT_MODIFIERS } from '../modifiers';
import { HOLD_TICK_POINTS_PER_SECOND } from '../constants';
import type { BeatMap } from '../types';

/** One long hold, so hold accrual is the only thing moving. */
function holdChart(holdSeconds: number): BeatMap {
  return {
    id: 'song-hold',
    name: 'Hold',
    artist: 'Test',
    audioUrl: '',
    bpm: 120,
    slices: [{ id: 'n1', time: 1, type: 'LONG', lane: 0, duration: holdSeconds }],
  } as unknown as BeatMap;
}

/**
 * Play the chart at `fps`, holding the note for its whole length.
 *
 * The audio clock advances by exactly `1/fps` per update, which is what a real
 * frame loop does — the point is that the engine must not care how many times
 * it was called to cover the same span of audio.
 */
function runAtFps(fps: number, holdSeconds: number): number {
  const engine = new GameEngine();
  clock.time = 0;

  void engine.loadMap(holdChart(holdSeconds));
  useSliceItStore.getState().setStatus('PLAYING');
  engine.reset();
  useSliceItStore.getState().setStatus('PLAYING');

  const step = 1 / fps;
  // Land on the note, which starts the hold.
  clock.time = 1;
  engine.submitInput(0);

  const end = 1 + holdSeconds;
  while (clock.time < end - step) {
    clock.time += step;
    engine.update();
  }
  return engine.getState().score;
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

describe('frame-rate independence', () => {
  it('scores a hold the same at 30, 60, 144 and 240 fps', () => {
    const rates = [30, 60, 144, 240];
    const scores = rates.map((fps) => runAtFps(fps, 4));

    // Every score must be within a point or two of the others: the only
    // permitted difference is where the fractional carry happened to land.
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    expect(
      max - min,
      `scores across ${rates.join('/')} fps: ${scores.join(', ')}`,
    ).toBeLessThanOrEqual(2);
    // And it must actually have scored something, or this proves nothing.
    expect(min).toBeGreaterThan(0);
  });

  it('pays a hold at the documented rate per second of audio', () => {
    // Compared as a difference, not a ratio: both runs also include the points
    // for the tap that started the hold, which is a constant and would make a
    // ratio meaningless.
    const short = runAtFps(60, 2);
    const long = runAtFps(60, 6);
    // Four more seconds of hold at combo 1, at the normal-difficulty multiplier.
    const expected = HOLD_TICK_POINTS_PER_SECOND * 4;
    expect(long - short).toBeGreaterThan(expected * 0.95);
    expect(long - short).toBeLessThan(expected * 1.05);
  });

  it('does not pay out a stall the player was absent for', () => {
    const engine = new GameEngine();
    clock.time = 0;
    void engine.loadMap(holdChart(30));
    useSliceItStore.getState().setStatus('PLAYING');
    engine.reset();
    useSliceItStore.getState().setStatus('PLAYING');

    clock.time = 1;
    engine.submitInput(0);
    engine.update();

    // Jump twenty seconds in one update — a backgrounded tab, or a client that
    // suspended the loop on purpose to bank the time in a single frame.
    clock.time = 21;
    engine.update();
    const banked = engine.getState().score;

    // Held honestly for the same twenty seconds.
    const honest = runAtFps(60, 20);
    expect(banked).toBeLessThan(honest / 2);
  });
});

describe('input timestamping', () => {
  /** A chart with one note at t=10, so a press can be judged against it. */
  const tapChart = (): BeatMap =>
    ({
      id: 'song-tap',
      name: 'Tap',
      artist: 'Test',
      audioUrl: '',
      bpm: 120,
      slices: [{ id: 'n1', time: 10, type: 'STANDARD', lane: 0 }],
    }) as unknown as BeatMap;

  function judgeWith(pressTime: number | undefined, handlerDelayMs: number): string {
    const engine = new GameEngine();
    clock.time = 0;
    void engine.loadMap(tapChart());
    useSliceItStore.getState().setStatus('PLAYING');
    engine.reset();
    useSliceItStore.getState().setStatus('PLAYING');

    // The player pressed exactly on the note; the handler ran `handlerDelayMs`
    // later, by which point the audio clock has moved on.
    clock.time = 10 + handlerDelayMs / 1000;
    vi.spyOn(performance, 'now').mockReturnValue(1000 + handlerDelayMs);
    engine.submitInput(0, pressTime);

    return engine.feedbackQueue.at(-1)?.text ?? 'NONE';
  }

  it('credits back the time the event spent queued', () => {
    // 25 ms of main-thread latency is an ordinary busy frame, and it is past the
    // 20 ms MARVELOUS window — so without the correction a perfectly-timed press
    // is downgraded for the browser being busy.
    expect(judgeWith(undefined, 25)).not.toBe('MARVELOUS');
    expect(judgeWith(1000, 25)).toBe('MARVELOUS');
  });

  it('ignores a timestamp from the future', () => {
    // A press that claims to have happened after the handler ran is nonsense,
    // and must not be treated as a negative delay.
    expect(judgeWith(2000, 25)).toBe(judgeWith(undefined, 25));
  });

  it('clamps an absurd claimed delay so it cannot rescue a real miss', () => {
    // 2 seconds late is a miss. Claiming the event sat in the queue for 2
    // seconds must not turn it into a hit.
    expect(judgeWith(1000 - 2000, 2000)).toBe('MISS');
  });
});
