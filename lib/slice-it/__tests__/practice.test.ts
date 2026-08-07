/**
 * P1, P3, P4 — practice transport, autoplay and the guide sounds.
 *
 * The load-bearing assertions here are the two that keep a demo off a
 * leaderboard (`isUnrankable`) and the one that makes a loop re-arm its notes.
 * A loop that rewinds the clock without clearing `hit`/`processedSliceIds`
 * looks like it works — the audio goes back — and the player then watches every
 * note in the section slide past unhittable, which is a much worse bug than not
 * having the feature.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/storage/asset', () => ({ asset: (p: string) => p }));
vi.mock('../net/client', () => ({ reportScore: vi.fn(), reportFinish: vi.fn() }));
vi.mock('@/lib/shared/platform', () => ({
  hapticsEnabled: () => false,
  hapticsIntensity: () => 0,
  vibrate: vi.fn(),
}));

const audio = {
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  setPlaybackRate: vi.fn(),
  setVolume: vi.fn(),
  getCurrentTime: vi.fn(() => 0),
  getDuration: vi.fn(() => 0),
  getContext: vi.fn(() => null),
  playSfX: vi.fn(),
  scheduleSfx: vi.fn(),
  playHitSoundFile: vi.fn(),
  isHitSoundCached: () => true,
  preloadHitSound: vi.fn(),
  loadTrack: vi.fn(),
  loadFromBuffer: vi.fn(),
  initialize: vi.fn(),
};
vi.mock('../../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => audio },
}));

import { GameEngine } from '../engine';
import { useSliceItStore } from '../store';
import type { BeatMap } from '../types';

const MAP: BeatMap = {
  id: 'song-1',
  name: 'Test',
  artist: 'Test',
  audioUrl: '/a.mp3',
  bpm: 120,
  slices: [
    { id: 'n1', time: 1, lane: 0, type: 'STANDARD' },
    { id: 'n2', time: 2, lane: 1, type: 'STANDARD' },
    { id: 'n3', time: 3, lane: 0, type: 'STANDARD' },
    { id: 'n4', time: 9, lane: 1, type: 'STANDARD' },
  ],
};

function engineAt(seconds: number): GameEngine {
  const engine = new GameEngine();
  engine.loadMap(MAP);
  audio.getCurrentTime.mockReturnValue(seconds);
  return engine;
}

beforeEach(() => {
  vi.clearAllMocks();
  audio.getCurrentTime.mockReturnValue(0);
  useSliceItStore.setState({
    metronome: false,
    assistTick: false,
    audioOffset: 0,
    // `update()` no-ops unless the run is live — the engine will not advance a
    // clock for a screen nobody is playing.
    status: 'PLAYING',
    isPaused: false,
  });
});

describe('P1 — practice transport', () => {
  it('is unrankable while practice is on, and rankable again when it is off', () => {
    const engine = engineAt(0);
    expect(engine.isUnrankable()).toBe(false);
    engine.setPractice(true, { start: 1, end: 4 });
    expect(engine.isUnrankable()).toBe(true);
    engine.setPractice(false);
    expect(engine.isUnrankable()).toBe(false);
  });

  it('rewinds at the loop end', () => {
    const engine = engineAt(0);
    engine.setPractice(true, { start: 1, end: 4 });
    audio.getCurrentTime.mockReturnValue(4.2);
    engine.update();
    expect(audio.seek).toHaveBeenCalledWith(1);
  });

  it('re-arms every note after the rewind point, so the section is playable again', () => {
    const engine = engineAt(0);
    engine.setPractice(true, { start: 1, end: 4 });

    // Two notes, two lanes. Deliberately not three: `INPUT_COOLDOWN_MS` is a
    // per-lane debounce measured on the WALL clock, and a test presses the same
    // lane twice inside a millisecond of real time — the second press is
    // correctly swallowed, which says nothing about looping.
    audio.getCurrentTime.mockReturnValue(1);
    engine.submitInput(0);
    audio.getCurrentTime.mockReturnValue(2);
    engine.submitInput(1);
    expect(engine.getProcessedSliceIds().size).toBe(2);

    audio.getCurrentTime.mockReturnValue(4.1);
    engine.update();

    // Everything from the loop start on is hittable again — this is the bug the
    // test exists for.
    expect(engine.getProcessedSliceIds().size).toBe(0);
    expect(engine.getSlices().every((s) => !s.hit)).toBe(true);
  });

  it('drops the combo across a rewind but keeps the tally', () => {
    const engine = engineAt(0);
    engine.setPractice(true, { start: 1, end: 4 });
    audio.getCurrentTime.mockReturnValue(1);
    engine.submitInput(0);
    const scored = engine.getState().score;
    expect(engine.getState().combo).toBe(1);

    audio.getCurrentTime.mockReturnValue(4.1);
    engine.update();

    expect(engine.getState().combo).toBe(0);
    // A lap does not wipe what you already earned — zeroing it every loop makes
    // the numbers on screen useless for judging whether you improved.
    expect(engine.getState().score).toBe(scored);
  });
});

describe('P3 — autoplay', () => {
  it('is unrankable', () => {
    const engine = engineAt(0);
    engine.setAutoplay(true);
    expect(engine.isUnrankable()).toBe(true);
  });

  it('resolves notes at their own time without any input', () => {
    const engine = engineAt(0);
    engine.setAutoplay(true);
    audio.getCurrentTime.mockReturnValue(2.5);
    engine.update();
    // n1 and n2 are behind the playhead; n3 and n4 are not.
    expect(engine.getState().combo).toBe(2);
    expect(engine.getState().accuracy).toBe(1);
  });

  it('never slices a bomb', () => {
    const engine = new GameEngine();
    engine.loadMap({
      ...MAP,
      slices: [{ id: 'b1', time: 1, lane: 0, type: 'BOMB' }],
    });
    engine.setAutoplay(true);
    audio.getCurrentTime.mockReturnValue(2);
    engine.update();
    // The bomb is consumed without being hit — a reference run that eats every
    // mine teaches the opposite of what a demo is for.
    expect(engine.getState().score).toBe(0);
    expect(engine.getState().combo).toBe(0);
  });
});

describe('P4 — guide sounds', () => {
  it('schedules nothing when both guides are off', () => {
    const engine = engineAt(0);
    audio.getContext.mockReturnValue({ currentTime: 0 } as unknown as AudioContext);
    engine.update();
    expect(audio.scheduleSfx).not.toHaveBeenCalled();
  });

  it('schedules ahead on the audio clock when the metronome is on', () => {
    useSliceItStore.setState({ metronome: true });
    const engine = engineAt(0);
    audio.getContext.mockReturnValue({ currentTime: 10 } as unknown as AudioContext);
    engine.update();
    expect(audio.scheduleSfx).toHaveBeenCalled();
    // Every scheduled beat is in the future relative to the context clock —
    // scheduling one in the past is a beat played in the wrong place.
    for (const call of audio.scheduleSfx.mock.calls) {
      expect(call[4]).toBeGreaterThanOrEqual(10);
    }
  });

  it('does not re-schedule a beat it has already handed to the clock', () => {
    useSliceItStore.setState({ metronome: true });
    const engine = engineAt(0);
    audio.getContext.mockReturnValue({ currentTime: 0 } as unknown as AudioContext);
    engine.update();
    const first = audio.scheduleSfx.mock.calls.length;
    engine.update();
    expect(audio.scheduleSfx.mock.calls.length).toBe(first);
  });
});
