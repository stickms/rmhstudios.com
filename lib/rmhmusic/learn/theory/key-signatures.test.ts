import { describe, expect, it } from 'vitest';
import { clefStep } from './clef';
import {
  MAJOR_KEYS,
  MINOR_KEYS,
  ORDER_OF_FLATS,
  ORDER_OF_SHARPS,
  keyId,
  keySignature,
  keysWithSignature,
  relativeKey,
  signatureLetters,
  signaturePositions,
  type Key,
} from './key-signatures';
import { noteId, parseNote, type SpelledNote } from './scales';

const major = (id: string): Key => ({
  tonic: parseNote(id) as SpelledNote,
  mode: 'major',
});
const minor = (id: string): Key => ({
  tonic: parseNote(id) as SpelledNote,
  mode: 'minor',
});

describe('key signatures', () => {
  it('counts the accidentals of all 15 major keys (the circle of fifths)', () => {
    const table: Record<string, [string | null, number]> = {
      C: [null, 0],
      G: ['sharp', 1],
      D: ['sharp', 2],
      A: ['sharp', 3],
      E: ['sharp', 4],
      B: ['sharp', 5],
      'F#': ['sharp', 6],
      'C#': ['sharp', 7],
      F: ['flat', 1],
      Bb: ['flat', 2],
      Eb: ['flat', 3],
      Ab: ['flat', 4],
      Db: ['flat', 5],
      Gb: ['flat', 6],
      Cb: ['flat', 7],
    };
    expect(MAJOR_KEYS).toHaveLength(15);
    for (const k of MAJOR_KEYS) {
      const [accidental, count] = table[noteId(k.tonic)] as [string | null, number];
      expect(keySignature(k), keyId(k)).toEqual({
        accidental,
        count,
      });
    }
  });

  it('gives every minor key its relative major signature', () => {
    expect(MINOR_KEYS).toHaveLength(15);
    for (const k of MINOR_KEYS) {
      expect(keySignature(k), keyId(k)).toEqual(keySignature(relativeKey(k)));
    }
    expect(keySignature(minor('A'))).toEqual({
      accidental: null,
      count: 0,
    });
    expect(keySignature(minor('D'))).toEqual({
      accidental: 'flat',
      count: 1,
    });
    expect(keySignature(minor('A#'))).toEqual({
      accidental: 'sharp',
      count: 7,
    });
    expect(keySignature(minor('Ab'))).toEqual({
      accidental: 'flat',
      count: 7,
    });
  });

  it('lists accidentals in the order of sharps and of flats', () => {
    expect(ORDER_OF_SHARPS.join('')).toBe('FCGDAEB');
    expect(ORDER_OF_FLATS.join('')).toBe('BEADGCF');
    expect(signatureLetters(keySignature(major('D')))).toEqual(['F', 'C']);
    expect(signatureLetters(keySignature(major('Eb')))).toEqual(['B', 'E', 'A']);
    expect(signatureLetters(keySignature(major('C')))).toEqual([]);
  });

  it('marks exactly the letters the key spells with an accidental', () => {
    for (const k of [...MAJOR_KEYS, ...MINOR_KEYS]) {
      const sig = keySignature(k);
      const marked = new Set(signatureLetters(sig));
      expect(marked.size).toBe(sig.count);
    }
  });

  it('pairs each major key with its relative minor, and back', () => {
    expect(keyId(relativeKey(major('Bb')))).toBe('G-minor');
    expect(keyId(relativeKey(minor('F#')))).toBe('A-major');
  });

  it('finds the one key of a mode with a signature', () => {
    const three = {
      accidental: 'flat',
      count: 3,
    } as const;
    expect(keysWithSignature(three, 'major').map(keyId)).toEqual(['Eb-major']);
    expect(keysWithSignature(three, 'minor').map(keyId)).toEqual(['C-minor']);
  });

  it('places the accidentals on the staff in the familiar zig-zag, on both clefs', () => {
    const sharps = keySignature(major('C#'));
    const flats = keySignature(major('Cb'));
    // Treble sharps: F5 C5 G5 D5 A4 E5 B4 — steps above the bottom line E4.
    expect(signaturePositions(sharps, 'treble').map((m) => clefStep('treble', m))).toEqual([8, 5, 9, 6, 3, 7, 4]);
    expect(signaturePositions(flats, 'treble').map((m) => clefStep('treble', m))).toEqual([4, 7, 3, 6, 2, 5, 1]);
    // The bass staff has the same shapes, a third lower: two steps down for every accidental
    // (sharps F3 C3 G3 D3 A2 E3 B2, flats B2 E3 A2 D3 G2 C3 F2).
    for (const sig of [sharps, flats]) {
      expect(signaturePositions(sig, 'bass').map((m) => clefStep('bass', m))).toEqual(
        signaturePositions(sig, 'treble').map((m) => clefStep('treble', m) - 2),
      );
    }
    expect(signaturePositions(keySignature(major('C')), 'treble')).toEqual([]);
    for (const clef of ['treble', 'bass'] as const) {
      for (const m of [...signaturePositions(sharps, clef), ...signaturePositions(flats, clef)]) {
        expect(clefStep(clef, m)).toBeGreaterThanOrEqual(-1);
        expect(clefStep(clef, m)).toBeLessThanOrEqual(9);
      }
    }
  });
});
