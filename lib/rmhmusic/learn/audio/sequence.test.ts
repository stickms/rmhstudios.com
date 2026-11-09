import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const started: { midi: number; released: boolean }[] = [];
let status: 'ready' | 'asleep' | 'none' = 'ready';
vi.mock('./voice', () => ({
  soundStatus: () => status,
  playNote: (midi: number) => {
    const note = { midi, released: false };
    started.push(note);
    return () => {
      note.released = true;
    };
  },
}));

import { CHORD_HOLD_MS, playChord, playSequence } from './sequence';

beforeEach(() => {
  started.length = 0;
  status = 'ready';
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('playSequence', () => {
  it('starts each note a gap after the last and lets each go after the hold', () => {
    playSequence([60, 67], 500, { holdMs: 400 });
    expect(started.map((n) => n.midi)).toEqual([60]);
    vi.advanceTimersByTime(399);
    expect(started[0].released).toBe(false);
    vi.advanceTimersByTime(1);
    expect(started[0].released).toBe(true);
    vi.advanceTimersByTime(100);
    expect(started.map((n) => n.midi)).toEqual([60, 67]);
    vi.advanceTimersByTime(400);
    expect(started[1].released).toBe(true);
  });

  it('plays every note at once with a gap of 0 (a chord), on the call itself', () => {
    playSequence([60, 64, 67], 0, { holdMs: 1000 });
    expect(started.map((n) => n.midi)).toEqual([60, 64, 67]);
    vi.advanceTimersByTime(1000);
    expect(started.every((n) => n.released)).toBe(true);
  });

  it('cancel stops later notes and lets the sounding ones go, and is safe twice', () => {
    const seq = playSequence([60, 67], 500, { holdMs: 900 });
    seq.cancel();
    expect(started[0].released).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(started.map((n) => n.midi)).toEqual([60]);
    expect(() => seq.cancel()).not.toThrow();
  });

  it('skips a note that is not a number', () => {
    playSequence([60, Number.NaN, 64], 0, { holdMs: 100 });
    expect(started.map((n) => n.midi)).toEqual([60, 64]);
  });

  it('reports started, and plays nothing when sound is not ready', () => {
    expect(playSequence([60], 0).started).toBe(true);
    for (const s of ['asleep', 'none'] as const) {
      status = s;
      started.length = 0;
      const seq = playSequence([60, 67], 300);
      expect(seq.started).toBe(false);
      vi.advanceTimersByTime(2000);
      expect(started).toEqual([]);
      expect(() => seq.cancel()).not.toThrow();
    }
  });
});

describe('playChord', () => {
  it('sounds every note at once and lets them ring', () => {
    const chord = playChord([60, 64, 67]);
    expect(chord.started).toBe(true);
    expect(started.map((n) => n.midi)).toEqual([60, 64, 67]);
    vi.advanceTimersByTime(CHORD_HOLD_MS - 1);
    expect(started.some((n) => n.released)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(started.every((n) => n.released)).toBe(true);
  });
  it('cancels like a sequence', () => {
    const chord = playChord([60, 64, 67]);
    chord.cancel();
    expect(started.every((n) => n.released)).toBe(true);
  });
  it('is not started when sound is not ready', () => {
    status = 'asleep';
    expect(playChord([60, 64, 67]).started).toBe(false);
    expect(started).toEqual([]);
  });
});
