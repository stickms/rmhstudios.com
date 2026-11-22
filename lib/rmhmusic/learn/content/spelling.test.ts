import { describe, expect, it } from 'vitest';
import { clefStep, noteLetter } from '../theory/clef';
import {
  FLAT_KEYS,
  KEY_CARD_KEYS,
  SHARP_KEYS,
  accidentalCards,
  alterationGlyph,
  cardAlteration,
  cardLetter,
  cardStep,
  cardWritten,
  isSpelledCard,
  keyAlterationOf,
  keyAlterations,
  keyCardTonic,
  keyCards,
  spelledName,
  spelledNameWords,
} from './spelling';

describe('accidental cards', () => {
  it('put each black key on its written natural, once as a sharp and once as a flat', () => {
    const treble = accidentalCards('treble');
    const f = treble.filter((c) => c.written === 65);
    // F♯ (sharp of F4) only: F♭ sounds like E, so it is left out.
    expect(f.map((c) => [c.id, c.midi, c.accidental])).toEqual([['treble:66:sharp', 66, 1]]);
    const b = treble.filter((c) => c.written === 71);
    // B♭ only: B♯ sounds like C.
    expect(b.map((c) => [c.id, c.midi, c.accidental])).toEqual([['treble:70:flat', 70, -1]]);
  });

  it('spells the same black key two ways as two cards', () => {
    const treble = accidentalCards('treble');
    // G♭4 and F♯4 are both 66.
    expect(treble.filter((c) => c.midi === 66).map((c) => c.id)).toEqual(['treble:66:sharp', 'treble:66:flat']);
  });

  it('never leaves a white key as the answer, on either clef', () => {
    for (const clef of ['treble', 'bass'] as const) {
      for (const c of accidentalCards(clef)) {
        expect([0, 2, 4, 5, 7, 9, 11], c.id).not.toContain(((c.midi % 12) + 12) % 12);
        expect(Math.abs(c.midi - (c.written ?? c.midi)), c.id).toBe(1);
      }
    }
  });

  it('draws every card on the staff body', () => {
    for (const c of accidentalCards('treble')) expect(cardStep(c)).toBeGreaterThanOrEqual(0);
    for (const c of accidentalCards('bass')) {
      expect(cardStep(c)).toBeGreaterThanOrEqual(0);
      expect(cardStep(c)).toBeLessThanOrEqual(8);
    }
  });
});

describe('key cards', () => {
  it('alter exactly the letters the key signature marks, and no others', () => {
    const g = keyCards('G');
    for (const c of g) {
      const l = noteLetter(cardWritten(c));
      expect(cardAlteration(c), c.id).toBe(l === 'F' ? 1 : 0);
    }
    const bb = keyCards('Bb');
    for (const c of bb) {
      const l = noteLetter(cardWritten(c));
      expect(cardAlteration(c), c.id).toBe(l === 'B' || l === 'E' ? -1 : 0);
    }
  });

  it('knows each key: sharps for G, D and A, flats for F, B♭ and E♭', () => {
    expect(SHARP_KEYS.map((k) => keyAlterations(k).alteration)).toEqual([1, 1, 1]);
    expect(FLAT_KEYS.map((k) => keyAlterations(k).alteration)).toEqual([-1, -1, -1]);
    expect(keyAlterations('G').letters).toEqual(['F']);
    expect(keyAlterations('D').letters).toEqual(['F', 'C']);
    expect(keyAlterations('A').letters).toEqual(['F', 'C', 'G']);
    expect(keyAlterations('F').letters).toEqual(['B']);
    expect(keyAlterations('Bb').letters).toEqual(['B', 'E']);
    expect(keyAlterations('Eb').letters).toEqual(['B', 'E', 'A']);
    expect(keyAlterationOf('D', 'C')).toBe(1);
    expect(keyAlterationOf('D', 'G')).toBe(0);
    expect(keyAlterationOf('Eb', 'A')).toBe(-1);
  });

  it('carry their key, a stable id, and a written note only where the key changes it', () => {
    const g = keyCards('G');
    const f4 = g.find((c) => c.id === 'key:G:treble:66');
    expect(f4).toMatchObject({ clef: 'treble', midi: 66, written: 65, key: 'G' });
    const g4 = g.find((c) => c.id === 'key:G:treble:67');
    expect(g4).toMatchObject({ midi: 67, key: 'G' });
    expect(g4?.written).toBeUndefined();
  });

  it('cover both staves, with unique ids across all six keys', () => {
    const ids = KEY_CARD_KEYS.flatMap((k) => keyCards(k).map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(keyCards('A').some((c) => c.clef === 'bass')).toBe(true);
    expect(keyCards('A').some((c) => c.clef === 'treble')).toBe(true);
  });

  it('names a key as printed', () => {
    expect(keyCardTonic('G')).toBe('G');
    expect(keyCardTonic('Bb')).toBe('B♭');
    expect(keyCardTonic('Eb')).toBe('E♭');
  });
});

describe('spelled names', () => {
  const f = { midi: 66, written: 65 };
  const bb = { midi: 70, written: 71 };
  const g = { midi: 67 };
  it('name a note by its letter and sign', () => {
    expect(spelledName(f)).toBe('F♯');
    expect(spelledName(bb)).toBe('B♭');
    expect(spelledName(g)).toBe('G');
    expect(alterationGlyph(1)).toBe('♯');
    expect(alterationGlyph(-1)).toBe('♭');
    expect(alterationGlyph(0)).toBe('');
  });
  it('name it in words for a screen reader', () => {
    const words = { sharp: 'sharp', flat: 'flat' };
    expect(spelledNameWords(f, words)).toBe('F sharp');
    expect(spelledNameWords(bb, words)).toBe('B flat');
    expect(spelledNameWords(g, words)).toBe('G');
  });
  it('read the letter from the written note, not the sounding one', () => {
    expect(cardLetter(bb)).toBe('B');
    expect(cardLetter(f)).toBe('F');
    expect(cardStep({ clef: 'treble', ...bb })).toBe(clefStep('treble', 71));
  });
  it('tell spelled cards from natural ones', () => {
    expect(isSpelledCard({ accidental: 1 })).toBe(true);
    expect(isSpelledCard({ key: 'G' })).toBe(true);
    expect(isSpelledCard({})).toBe(false);
  });
});
