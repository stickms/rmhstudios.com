import { describe, expect, it } from 'vitest';
import { describeMiss, playedMidi } from './miss';

describe('playedMidi', () => {
  it('keeps a played note exactly, octave and all', () => {
    expect(playedMidi(64, { kind: 'midi', midi: 76 })).toBe(76);
  });

  it('puts a letter at the octave nearest the right note', () => {
    expect(playedMidi(64, { kind: 'letter', letter: 'D' })).toBe(62); // E4 -> D4, not D5
    expect(playedMidi(64, { kind: 'letter', letter: 'C' })).toBe(60);
    expect(playedMidi(60, { kind: 'letter', letter: 'B' })).toBe(59); // C4 -> B3, not B4
    expect(playedMidi(71, { kind: 'letter', letter: 'C' })).toBe(72); // B4 -> C5, not C4
  });

  it('is null for a non-note answer or a non-finite target', () => {
    expect(playedMidi(64, { kind: 'letter', letter: 'H' })).toBeNull();
    expect(playedMidi(Number.NaN, { kind: 'letter', letter: 'C' })).toBeNull();
    expect(playedMidi(64, { kind: 'midi', midi: Number.NaN })).toBeNull();
  });
});

describe('describeMiss', () => {
  it('counts staff steps and says which way', () => {
    const above = describeMiss(60, { kind: 'midi', midi: 64 }); // C4 -> E4
    expect(above).toMatchObject({ name: 'E4', steps: 2, direction: 'above', sameLetter: false, letterOnly: false });
    const below = describeMiss(64, { kind: 'letter', letter: 'D' });
    expect(below).toMatchObject({ name: 'D4', steps: 1, direction: 'below', letterOnly: true });
  });

  it('calls the right letter in the wrong octave an octave off', () => {
    expect(describeMiss(60, { kind: 'midi', midi: 72 })).toMatchObject({
      steps: 7,
      direction: 'above',
      sameLetter: true,
    });
  });

  it('puts a sharp of the right letter level with it', () => {
    expect(describeMiss(60, { kind: 'midi', midi: 61 })).toMatchObject({ steps: 0, direction: 'level' });
  });
});
