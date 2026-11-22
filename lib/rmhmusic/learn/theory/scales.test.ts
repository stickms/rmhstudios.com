import { describe, expect, it } from 'vitest';
import {
  MAJOR_TONICS,
  MINOR_TONICS,
  noteGlyphs,
  noteId,
  parseNote,
  pitchClass,
  relativeMajor,
  relativeMinor,
  scaleMidis,
  scaleNotes,
  scaleRun,
  type ScaleKind,
  type SpelledNote,
} from './scales';

const n = (id: string): SpelledNote => parseNote(id) as SpelledNote;
const ids = (tonic: string, kind: ScaleKind) => scaleNotes(n(tonic), kind).map(noteId);

/** Every key's scale, spelled out by hand (the circle of fifths). */
const MAJOR: Record<string, string> = {
  C: 'C D E F G A B',
  G: 'G A B C D E F#',
  D: 'D E F# G A B C#',
  A: 'A B C# D E F# G#',
  E: 'E F# G# A B C# D#',
  B: 'B C# D# E F# G# A#',
  'F#': 'F# G# A# B C# D# E#',
  'C#': 'C# D# E# F# G# A# B#',
  F: 'F G A Bb C D E',
  Bb: 'Bb C D Eb F G A',
  Eb: 'Eb F G Ab Bb C D',
  Ab: 'Ab Bb C Db Eb F G',
  Db: 'Db Eb F Gb Ab Bb C',
  Gb: 'Gb Ab Bb Cb Db Eb F',
  Cb: 'Cb Db Eb Fb Gb Ab Bb',
};

const MINOR: Record<string, string> = {
  A: 'A B C D E F G',
  E: 'E F# G A B C D',
  B: 'B C# D E F# G A',
  'F#': 'F# G# A B C# D E',
  'C#': 'C# D# E F# G# A B',
  'G#': 'G# A# B C# D# E F#',
  'D#': 'D# E# F# G# A# B C#',
  'A#': 'A# B# C# D# E# F# G#',
  D: 'D E F G A Bb C',
  G: 'G A Bb C D Eb F',
  C: 'C D Eb F G Ab Bb',
  F: 'F G Ab Bb C Db Eb',
  Bb: 'Bb C Db Eb F Gb Ab',
  Eb: 'Eb F Gb Ab Bb Cb Db',
  Ab: 'Ab Bb Cb Db Eb Fb Gb',
};

describe('scales: spelling', () => {
  it('spells all 15 major keys with one letter per degree', () => {
    expect(MAJOR_TONICS).toHaveLength(15);
    for (const t of MAJOR_TONICS) {
      expect(ids(noteId(t), 'major').join(' '), noteId(t)).toBe(MAJOR[noteId(t)]);
    }
  });

  it('spells all 15 natural minor keys', () => {
    expect(MINOR_TONICS).toHaveLength(15);
    for (const t of MINOR_TONICS) {
      expect(ids(noteId(t), 'natural-minor').join(' '), noteId(t)).toBe(MINOR[noteId(t)]);
    }
  });

  it('spells F major with B flat, never A sharp', () => {
    expect(ids('F', 'major')).toContain('Bb');
    expect(ids('F', 'major')).not.toContain('A#');
  });

  it('uses each letter exactly once in a scale', () => {
    for (const t of [...MAJOR_TONICS, ...MINOR_TONICS]) {
      for (const kind of ['major', 'natural-minor', 'harmonic-minor'] as const) {
        const letters = scaleNotes(t, kind).map((x) => x.letter);
        expect(new Set(letters).size).toBe(7);
      }
    }
  });

  it('raises the seventh of a harmonic minor scale, with a double sharp where the letter needs one', () => {
    expect(ids('A', 'harmonic-minor').join(' ')).toBe('A B C D E F G#');
    const gSharp = scaleNotes(n('G#'), 'harmonic-minor');
    expect(noteId(gSharp[6] as SpelledNote)).toBe('F##');
    expect(noteGlyphs(gSharp[6] as SpelledNote)).toBe('F\u{1D12A}');
  });

  it('runs one octave up, the tonic again on top, at the right pitches', () => {
    expect(scaleRun(n('G'), 'major').map(noteId)).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#', 'G']);
    expect(scaleMidis('major', 67)).toEqual([67, 69, 71, 72, 74, 76, 78, 79]);
    expect(scaleMidis('natural-minor', 57)).toEqual([57, 59, 60, 62, 64, 65, 67, 69]);
  });

  it('agrees with the pitch of every degree', () => {
    for (const t of MAJOR_TONICS) {
      const pcs = scaleNotes(t, 'major').map(pitchClass);
      const want = [0, 2, 4, 5, 7, 9, 11].map((s) => (pitchClass(t) + s) % 12);
      expect(pcs).toEqual(want);
    }
  });
});

describe('scales: names', () => {
  it('prints sharps and flats as glyphs and ids as plain text', () => {
    expect(noteGlyphs(n('F#'))).toBe('F♯');
    expect(noteGlyphs(n('Bb'))).toBe('B♭');
    expect(noteGlyphs(n('C'))).toBe('C');
    expect(noteId(n('Bb'))).toBe('Bb');
  });

  it('parses only note names', () => {
    expect(parseNote('H')).toBeNull();
    expect(parseNote('c')).toBeNull();
    expect(parseNote('Fb')).toEqual({
      letter: 'F',
      accidental: -1,
    });
  });
});

describe('scales: relative keys', () => {
  it('pairs each major key with the minor on its sixth degree, and back', () => {
    const pairs: Array<[string, string]> = [
      ['C', 'A'],
      ['G', 'E'],
      ['D', 'B'],
      ['A', 'F#'],
      ['E', 'C#'],
      ['B', 'G#'],
      ['F#', 'D#'],
      ['C#', 'A#'],
      ['F', 'D'],
      ['Bb', 'G'],
      ['Eb', 'C'],
      ['Ab', 'F'],
      ['Db', 'Bb'],
      ['Gb', 'Eb'],
      ['Cb', 'Ab'],
    ];
    for (const [major, minor] of pairs) {
      expect(noteId(relativeMinor(n(major))), major).toBe(minor);
      expect(noteId(relativeMajor(n(minor))), minor).toBe(major);
    }
  });
});
