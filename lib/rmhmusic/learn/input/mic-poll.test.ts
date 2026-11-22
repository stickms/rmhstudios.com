import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteEvent } from './events';

// The 25 ms poll: silence never reaches the pitch detector, a steady tone
// becomes one note, and stopping leaves no timer and releases the note.
const signal = vi.hoisted(() => ({
  freq: 0,
  /** Peak amplitude of the fake tone (its RMS is about 0.7 of this). */
  amp: 0.4,
}));
const ctx = vi.hoisted(() => ({
  state: 'running',
  sampleRate: 48000,
  resume: () => Promise.resolve(),
  createMediaStreamSource: () => ({
    connect: () => {},
    disconnect: () => {},
  }),
  createBiquadFilter: () => ({
    type: 'lowpass',
    frequency: { value: 350 },
    Q: { value: 1 },
    connect: () => {},
    disconnect: () => {},
  }),
  createGain: () => ({
    gain: { value: 1 },
    connect: () => {},
    disconnect: () => {},
  }),
  createAnalyser: () => ({
    fftSize: 0,
    disconnect: () => {},
    getFloatTimeDomainData: (buf: Float32Array) => {
      for (let i = 0; i < buf.length; i++) {
        buf[i] = signal.freq ? signal.amp * Math.sin((2 * Math.PI * signal.freq * i) / 48000) : 0;
      }
    },
  }),
}));
vi.mock('@/lib/shared/platform', () => ({
  getAudioContext: () => ctx,
}));
const detect = vi.hoisted(() => ({
  calls: 0,
}));
vi.mock('../pitch/yin', async (orig) => {
  const real = await orig<typeof import('../pitch/yin')>();
  return {
    ...real,
    detectPitch: (...args: Parameters<typeof real.detectPitch>) => {
      detect.calls++;
      return real.detectPitch(...args);
    },
  };
});

import { createMicInput, setMicSettings } from './mic';

describe('mic poll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signal.freq = 0;
    signal.amp = 0.4;
    detect.calls = 0;
    const track = {
      stop: vi.fn(),
    };
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: () =>
          Promise.resolve({
            getTracks: () => [track],
          }),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('skips the detector on silence, hears a steady A4 once, and stops clean', async () => {
    const levels: number[] = [];
    const mic = createMicInput({
      onLevel: (rms) => levels.push(rms),
    });
    const got: NoteEvent[] = [];
    mic.subscribe((e) => got.push(e));
    await mic.start();

    await vi.advanceTimersByTimeAsync(250);
    expect(levels.length).toBe(10);
    expect(levels.every((l) => l === 0)).toBe(true);
    expect(detect.calls).toBe(0);
    expect(got).toEqual([]);

    signal.freq = 440;
    await vi.advanceTimersByTimeAsync(250);
    expect(detect.calls).toBe(10);
    expect(got.map((e) => [e.type, e.midi])).toEqual([['on', 69]]);
    expect(Math.abs(got[0].cents ?? 99)).toBeLessThan(5);

    mic.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(got.map((e) => [e.type, e.midi])).toEqual([
      ['on', 69],
      ['off', 69],
    ]);
  });

  it('hands every poll to onFrame: no pitch on silence, the tone and its clarity on a tone', async () => {
    const frames: {
      freq: number | null;
      clarity: number;
      rms: number;
    }[] = [];
    const mic = createMicInput({
      onFrame: (f) =>
        frames.push({
          freq: f.freq,
          clarity: f.clarity,
          rms: f.rms,
        }),
    });
    await mic.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(frames.length).toBe(4);
    expect(frames.every((f) => f.freq === null && f.rms === 0)).toBe(true);
    signal.freq = 440;
    await vi.advanceTimersByTimeAsync(100);
    const last = frames[frames.length - 1];
    expect(Math.abs((last?.freq ?? 0) - 440)).toBeLessThan(0.5);
    expect(last?.clarity ?? 0).toBeGreaterThan(0.9);
    mic.stop();
    const count = frames.length;
    await vi.advanceTimersByTimeAsync(100);
    expect(frames.length).toBe(count);
  });

  it('a throwing onFrame listener neither drops note events nor stops the poll', async () => {
    let calls = 0;
    const mic = createMicInput({
      onFrame: () => {
        calls++;
        throw new Error('listener bug');
      },
    });
    const got: NoteEvent[] = [];
    mic.subscribe((e) => got.push(e));
    await mic.start();
    signal.freq = 440;
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toBe(10);
    expect(got.map((e) => [e.type, e.midi])).toEqual([['on', 69]]);
    mic.stop();
  });

  describe('the cutoff', () => {
    afterEach(() => setMicSettings({ auto: true, gain: 1, gate: 0.01, hum: 'off' }));

    it('keeps sound below the cutoff away from the detector, and hears it once the cutoff is lowered', async () => {
      setMicSettings({ auto: false, gate: 0.05 });
      signal.freq = 440;
      signal.amp = 0.05; // RMS about 0.035: under 0.05
      const got: NoteEvent[] = [];
      const levels: [number, number][] = [];
      const mic = createMicInput({ onLevel: (rms, gate) => levels.push([rms, gate]) });
      mic.subscribe((e) => got.push(e));
      await mic.start();
      await vi.advanceTimersByTimeAsync(250);
      expect(detect.calls).toBe(0);
      expect(got).toEqual([]);
      expect(levels.every(([, gate]) => gate === 0.05)).toBe(true);
      setMicSettings({ gate: 0.01 });
      await vi.advanceTimersByTimeAsync(250);
      expect(detect.calls).toBeGreaterThan(0);
      expect(got.map((e) => [e.type, e.midi])).toEqual([['on', 69]]);
      mic.stop();
    });

    it('hears a note quieter than the old fixed 0.01 floor, because the detector is given the cutoff too', async () => {
      setMicSettings({ auto: false, gate: 0.002 });
      signal.freq = 440;
      signal.amp = 0.012; // RMS about 0.0085
      const got: NoteEvent[] = [];
      const mic = createMicInput();
      mic.subscribe((e) => got.push(e));
      await mic.start();
      await vi.advanceTimersByTimeAsync(250);
      expect(got.map((e) => [e.type, e.midi])).toEqual([['on', 69]]);
      mic.stop();
    });

    it('in automatic mode learns the room from silence and reports the cutoff and gain it uses', async () => {
      setMicSettings({ auto: true });
      const seen: [number, number][] = [];
      const mic = createMicInput({ onLevel: (_rms, gate, gain) => seen.push([gate, gain]) });
      await mic.start();
      await vi.advanceTimersByTimeAsync(500);
      const [gate, gain] = seen[seen.length - 1]!;
      expect(gate).toBe(0.002); // a silent room: the lowest automatic cutoff
      expect(gain).toBe(1); // nothing sounded, so the gain held
      mic.stop();
    });
  });
});
