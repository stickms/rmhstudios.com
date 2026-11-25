import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RhythmNote, RhythmPattern } from '../theory/rhythm';
import { PLAYBACK_LEAD_S, clickOffsetsS, createRhythmPlayback } from './rhythm-playback';
import type { ClickContext } from './clicks';

const note = (value: RhythmNote['value'], extra: Partial<RhythmNote> = {}): RhythmNote => ({
  value,
  dotted: false,
  rest: false,
  tieToNext: false,
  ...extra,
});
const PATTERN: RhythmPattern = {
  meter: '4/4',
  // A click at 0, none for the rest, one at beat 2 (the tied half sounds once), 72 bpm.
  notes: [note('quarter'), note('quarter', { rest: true }), note('quarter', { tieToNext: true }), note('quarter')],
};

function fakeContext() {
  const starts: number[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const oscillators: { stop: ReturnType<typeof vi.fn>; onended: unknown }[] = [];
  const ctx = {
    currentTime: 10,
    destination: {},
    createOscillator: vi.fn(() => {
      const osc = {
        frequency: param(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn((at: number) => starts.push(at)),
        stop: vi.fn(),
        onended: null as unknown,
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() })),
  };
  return { ctx: ctx as unknown as ClickContext, starts, oscillators };
}

describe('clickOffsetsS', () => {
  it('is one click per sound: rests are silent and a tie does not click again', () => {
    const perBeat = 60 / 72;
    expect(clickOffsetsS(PATTERN, 72)).toEqual([0, 2 * perBeat]);
  });
});

describe('createRhythmPlayback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays each click on the audio clock, names the sounding notes, then reports heard once', () => {
    const { ctx, starts } = fakeContext();
    const heard = vi.fn();
    const notes: (number | null)[] = [];
    const playback = createRhythmPlayback({ ctx: () => ctx, bpm: 72, onHeard: heard, onNote: (n) => notes.push(n) });
    expect(playback.start(3, PATTERN)).toBe(true);
    expect(starts).toHaveLength(2);
    expect(starts[0]).toBeCloseTo(10 + PLAYBACK_LEAD_S, 9);
    expect(starts[1]! - starts[0]!).toBeCloseTo(2 * (60 / 72), 9);
    expect(heard).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(notes).toEqual([0, 2, null]);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith(3);
  });

  it('refuses when sound is not ready, and plays nothing', () => {
    const { ctx, starts } = fakeContext();
    const heard = vi.fn();
    const off = createRhythmPlayback({ ctx: () => ctx, bpm: 72, onHeard: heard, ready: () => false });
    expect(off.start(0, PATTERN)).toBe(false);
    expect(createRhythmPlayback({ ctx: () => null, bpm: 72, onHeard: heard }).start(0, PATTERN)).toBe(false);
    expect(starts).toHaveLength(0);
    vi.advanceTimersByTime(60_000);
    expect(heard).not.toHaveBeenCalled();
  });

  it('reports nothing once cancelled or replaced, and silences what is still to come', () => {
    const { ctx, oscillators } = fakeContext();
    const heard = vi.fn();
    const playback = createRhythmPlayback({ ctx: () => ctx, bpm: 72, onHeard: heard });
    playback.start(0, PATTERN);
    playback.cancel();
    playback.cancel();
    expect(oscillators.every((o) => o.stop.mock.calls.length > 0)).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(heard).not.toHaveBeenCalled();

    playback.start(1, PATTERN);
    playback.start(2, PATTERN);
    vi.advanceTimersByTime(60_000);
    expect(heard.mock.calls).toEqual([[2]]);
  });
});
