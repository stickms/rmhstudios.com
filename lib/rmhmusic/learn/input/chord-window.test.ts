import { describe, expect, it } from 'vitest';
import { CHORD_WINDOW_MS, createChordWindow } from './chord-window';

const on = (midi: number, time: number, source: 'keys' | 'midi' | 'screen' | 'mic' = 'midi') => ({
  type: 'on' as const,
  midi,
  time,
  source,
});
const off = (midi: number, time: number) => ({
  type: 'off' as const,
  midi,
  time,
  source: 'midi' as const,
});

describe('chord window', () => {
  it('is 600 ms', () => {
    expect(CHORD_WINDOW_MS).toBe(600);
  });

  it('the first note opens it and notes inside 600 ms of that one join', () => {
    const w = createChordWindow();
    expect(w.push(on(60, 1000))).toBe('opened');
    expect(w.push(on(64, 1200))).toBe('added');
    expect(w.push(on(67, 1599))).toBe('added');
    expect(w.take()).toEqual([60, 64, 67]);
  });

  it('a note 600 ms or more after the first is late and not collected', () => {
    const w = createChordWindow();
    w.push(on(60, 1000));
    expect(w.push(on(64, 1600))).toBe('late');
    expect(w.take()).toEqual([60]);
  });

  it('ignores note-offs, the microphone and notes that are not numbers', () => {
    const w = createChordWindow();
    expect(w.push(off(60, 1000))).toBe('ignored');
    expect(w.push(on(60, 1000, 'mic'))).toBe('ignored');
    expect(w.push(on(Number.NaN, 1000))).toBe('ignored');
    expect(w.push(on(60, Number.NaN))).toBe('ignored');
    expect(w.take()).toEqual([]);
    // still closed: the next real note opens it
    expect(w.push(on(60, 1000))).toBe('opened');
  });

  it('counts a repeated pitch once', () => {
    const w = createChordWindow();
    w.push(on(60, 1000));
    expect(w.push(on(60, 1100))).toBe('added');
    expect(w.take()).toEqual([60]);
  });

  it('take closes it, so the next note opens a new one; reset forgets what was collected', () => {
    const w = createChordWindow();
    w.push(on(60, 1000));
    w.take();
    expect(w.push(on(64, 1100))).toBe('opened');
    w.reset();
    expect(w.take()).toEqual([]);
    expect(w.push(on(67, 5000))).toBe('opened');
  });

  it('keys, MIDI and on-screen keys all count', () => {
    const w = createChordWindow();
    w.push(on(60, 0, 'keys'));
    w.push(on(64, 10, 'screen'));
    w.push(on(67, 20, 'midi'));
    expect(w.take()).toEqual([60, 64, 67]);
  });
});
