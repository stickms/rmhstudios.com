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

describe('spelled answers and targets', () => {
  it('puts a letter with an accidental at the octave nearest the right note', () => {
    expect(playedMidi(66, { kind: 'letter', letter: 'G', accidental: -1 })).toBe(66); // G♭ for an F♯4 card
    expect(playedMidi(66, { kind: 'letter', letter: 'F', accidental: 1 })).toBe(66);
    expect(playedMidi(66, { kind: 'letter', letter: 'F' })).toBe(65);
    expect(playedMidi(72, { kind: 'letter', letter: 'B', accidental: -1 })).toBe(70); // B♭4, not B♭5
    expect(playedMidi(66, { kind: 'letter', letter: 'F', accidental: Number.NaN })).toBe(65);
  });

  it('puts a pitch class at the nearest octave', () => {
    expect(playedMidi(64, { kind: 'pitch-class', pc: 2 })).toBe(62);
    expect(playedMidi(64, { kind: 'pitch-class', pc: 9 })).toBe(69);
    expect(playedMidi(64, { kind: 'pitch-class', pc: Number.NaN })).toBeNull();
  });

  it('draws a wrong G♭ on the G line with a flat, one step above the F♯ it should be', () => {
    const miss = describeMiss(66, { kind: 'letter', letter: 'G', accidental: -1 }, { written: 65 });
    expect(miss).toMatchObject({ midi: 66, written: 67, accidental: -1, name: 'G♭4', steps: 1, direction: 'above' });
    expect(miss?.letterOnly).toBe(true);
  });

  it('counts the distance between written notes when the target is spelled', () => {
    // B♭4 (sounds 70, written B4 = 71) against an answer of A4: the written steps are 1 apart.
    expect(describeMiss(70, { kind: 'midi', midi: 69 }, { written: 71 })).toMatchObject({
      steps: 1,
      direction: 'below',
      accidental: 0,
      name: 'A4',
    });
  });

  it('spells a black key played where no spelling was given as a sharp, or a flat when asked', () => {
    expect(describeMiss(64, { kind: 'midi', midi: 66 })).toMatchObject({ written: 65, accidental: 1, name: 'F♯4' });
    expect(describeMiss(64, { kind: 'midi', midi: 66 }, { spell: -1 })).toMatchObject({
      written: 67,
      accidental: -1,
      name: 'G♭4',
    });
    expect(describeMiss(64, { kind: 'pitch-class', pc: 6 })).toMatchObject({ written: 65, letterOnly: true });
  });

  it('keeps the plain-note names it always had', () => {
    expect(describeMiss(64, { kind: 'midi', midi: 62 })?.name).toBe('D4');
    expect(describeMiss(64, { kind: 'letter', letter: 'C' })?.name).toBe('C4');
  });
});
