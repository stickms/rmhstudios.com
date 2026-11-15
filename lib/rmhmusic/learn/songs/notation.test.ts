import { describe, expect, it } from 'vitest';
import { parseBars, parseNote } from './notation';

describe('parseNote', () => {
  it('reads a letter, an octave and a duration in beats (default one beat)', () => {
    expect(parseNote('C4')).toEqual({ letter: 'C', alter: 0, octave: 4, pitch: 60, beats: 1 });
    expect(parseNote('E4:2')).toEqual({ letter: 'E', alter: 0, octave: 4, pitch: 64, beats: 2 });
    expect(parseNote('G3:0.5')?.pitch).toBe(55);
    expect(parseNote('D5:1.5')?.beats).toBe(1.5);
  });

  it('keeps the spelling: a sharp and a flat on the same key are different notes on paper', () => {
    expect(parseNote('F#4')).toEqual({ letter: 'F', alter: 1, octave: 4, pitch: 66, beats: 1 });
    expect(parseNote('Gb4')).toEqual({ letter: 'G', alter: -1, octave: 4, pitch: 66, beats: 1 });
    expect(parseNote('Bb3:3')?.pitch).toBe(58);
  });

  it('refuses anything that is not a note of a known length', () => {
    for (const bad of ['', 'H4', 'C', 'c4', 'C4:0', 'C4:5', 'C4:0.25', 'C4:x', 'C#', 'Cx4', 'r:1', 'C10'])
      expect(parseNote(bad), bad).toBeNull();
  });
});

describe('parseBars', () => {
  it('splits bars on | and notes on spaces, ignoring extra spaces and a trailing bar line', () => {
    const bars = parseBars('E4 D4 C4 D4 |  E4 E4 E4:2 |');
    expect(bars).toHaveLength(2);
    expect(bars[0]?.map((n) => n.pitch)).toEqual([64, 62, 60, 62]);
    expect(bars[1]?.map((n) => n.beats)).toEqual([1, 1, 2]);
  });

  it('throws on a bad token or an empty bar, naming it', () => {
    expect(() => parseBars('C4 Q4')).toThrow(/Q4/);
    expect(() => parseBars('C4 || D4')).toThrow(/empty/);
  });
});
