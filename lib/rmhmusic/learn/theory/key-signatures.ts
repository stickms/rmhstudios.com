/**
 * Key signatures — pure.
 *
 * A key's signature is the accidentals its scale needs, written once at the start of the staff.
 * Sharps arrive in the order F C G D A E B and flats in the reverse, B E A D G C F, so a signature
 * with `count` accidentals is the first `count` of one list. The signature is derived from the
 * spelled scale (`scales.ts`), so it cannot disagree with it; `key-signatures.test.ts` holds it to
 * the circle of fifths written out by hand.
 */
import type { Clef } from './clef';
import {
  MAJOR_TONICS,
  MINOR_TONICS,
  relativeMajor,
  relativeMinor,
  noteGlyphs,
  noteId,
  scaleNotes,
  sameNote,
  type Letter,
  type SpelledNote,
} from './scales';

export type KeyMode = 'major' | 'minor';

export interface Key {
  tonic: SpelledNote;
  mode: KeyMode;
}

export type Accidental = 'sharp' | 'flat';

export interface KeySignature {
  /** Null when the key has none (C major, A minor). */
  accidental: Accidental | null;
  /** 0…7. */
  count: number;
}

export const ORDER_OF_SHARPS: readonly Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];

export const ORDER_OF_FLATS: readonly Letter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

export const MAJOR_KEYS: readonly Key[] = MAJOR_TONICS.map((tonic) => ({
  tonic,
  mode: 'major' as const,
}));

export const MINOR_KEYS: readonly Key[] = MINOR_TONICS.map((tonic) => ({
  tonic,
  mode: 'minor' as const,
}));

/** A key's id: "Bb-major", "F#-minor". */
export function keyId(key: Key): string {
  return `${noteId(key.tonic)}-${key.mode}`;
}

/** The tonic as printed ("B♭"); the mode's word is the UI's. */
export function keyTonicGlyphs(key: Key): string {
  return noteGlyphs(key.tonic);
}

/** The signature of a major or natural minor key. */
export function keySignature(key: Key): KeySignature {
  const notes = scaleNotes(key.tonic, key.mode === 'major' ? 'major' : 'natural-minor');
  const sharps = notes.filter((n) => n.accidental > 0).length;
  const flats = notes.filter((n) => n.accidental < 0).length;
  if (sharps > 0)
    return {
      accidental: 'sharp',
      count: sharps,
    };
  if (flats > 0)
    return {
      accidental: 'flat',
      count: flats,
    };
  return {
    accidental: null,
    count: 0,
  };
}

/** The letters a signature marks, in the order they are written. */
export function signatureLetters(sig: KeySignature): Letter[] {
  if (sig.accidental === null) return [];
  return (sig.accidental === 'sharp' ? ORDER_OF_SHARPS : ORDER_OF_FLATS).slice(0, sig.count);
}

/**
 * Where each accidental sits on the staff, as the MIDI number of a natural note on its line or
 * space (`clefStep` turns it into a position). The conventional zig-zag shapes: on the treble
 * staff the sharps run F5 C5 G5 D5 A4 E5 B4 and the flats B4 E5 A4 D5 G4 C5 F4; the bass staff's
 * are the same shapes a third lower on the staff (each is the treble's note minus 24 semitones, which the bass clef reads two steps down).
 */
const POSITIONS: Record<Clef, Record<Accidental, readonly number[]>> = {
  treble: {
    sharp: [77, 72, 79, 74, 69, 76, 71],
    flat: [71, 76, 69, 74, 67, 72, 65],
  },
  bass: {
    sharp: [53, 48, 55, 50, 45, 52, 47],
    flat: [47, 52, 45, 50, 43, 48, 41],
  },
};

/** The note (a MIDI number) each of a signature's accidentals sits on, in the order written. */
export function signaturePositions(sig: KeySignature, clef: Clef): number[] {
  if (sig.accidental === null) return [];
  return POSITIONS[clef][sig.accidental].slice(0, sig.count);
}

/** The key with the same signature and the other mode. */
export function relativeKey(key: Key): Key {
  return key.mode === 'major'
    ? {
        tonic: relativeMinor(key.tonic),
        mode: 'minor',
      }
    : {
        tonic: relativeMajor(key.tonic),
        mode: 'major',
      };
}

/** The keys of one mode that have exactly this signature (one for any of the 15). */
export function keysWithSignature(sig: KeySignature, mode: KeyMode): Key[] {
  return (mode === 'major' ? MAJOR_KEYS : MINOR_KEYS).filter((k) => {
    const s = keySignature(k);
    return s.count === sig.count && s.accidental === sig.accidental;
  });
}

export function sameKey(a: Key, b: Key): boolean {
  return a.mode === b.mode && sameNote(a.tonic, b.tonic);
}
