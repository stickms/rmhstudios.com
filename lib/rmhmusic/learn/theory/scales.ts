/**
 * Scales with correct spelling — pure.
 *
 * A note is spelled, not just numbered: F major has B♭, never A♯, because a scale uses each letter
 * once, in order. So a scale is built letter by letter (the tonic's letter, then the seven in
 * sequence) and each degree's accidental is whatever makes that letter reach the right pitch
 * class. Major, natural minor and harmonic minor are interval patterns over that.
 *
 * Names come out two ways: `noteId` is plain text ("Bb", "F#"; what tests and ids use) and
 * `noteGlyphs` is for the eye ("B♭", "F♯"). The learner's UI shows the second.
 */

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

/** A written note without an octave: its letter and how far the accidental moves it (−2…2). */
export interface SpelledNote {
  letter: Letter;
  accidental: number;
}

export type ScaleKind = 'major' | 'natural-minor' | 'harmonic-minor';

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const NATURAL_PC: Record<Letter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Semitones above the tonic of each of the seven degrees. */
export const SCALE_STEPS: Record<ScaleKind, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  'natural-minor': [0, 2, 3, 5, 7, 8, 10],
  'harmonic-minor': [0, 2, 3, 5, 7, 8, 11],
};

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** The pitch class (0 = C … 11 = B) a spelled note sounds. */
export function pitchClass(n: SpelledNote): number {
  return mod12(NATURAL_PC[n.letter] + n.accidental);
}

/** Plain-text name: "C", "F#", "Bb", "F##". */
export function noteId(n: SpelledNote): string {
  const a = n.accidental;
  return `${n.letter}${a > 0 ? '#'.repeat(a) : 'b'.repeat(-a)}`;
}

const GLYPH = {
  sharp: '♯',
  flat: '♭',
  doubleSharp: '\u{1D12A}',
  doubleFlat: '\u{1D12B}',
} as const;

/** The name as it is printed: "F♯", "B♭", "F𝄪". */
export function noteGlyphs(n: SpelledNote): string {
  const a = n.accidental;
  let s: string = n.letter;
  let left = Math.abs(a);
  while (left >= 2) {
    s += a > 0 ? GLYPH.doubleSharp : GLYPH.doubleFlat;
    left -= 2;
  }
  if (left === 1) s += a > 0 ? GLYPH.sharp : GLYPH.flat;
  return s;
}

/** "F#", "Bb", "C" → a spelled note; null when it is not a note name. */
export function parseNote(id: string): SpelledNote | null {
  const m = /^([A-G])(#{0,2}|b{0,2})$/.exec(id);
  if (!m) return null;
  const marks = m[2] ?? '';
  return {
    letter: m[1] as Letter,
    accidental: marks.startsWith('#') ? marks.length : -marks.length,
  };
}

/** The note at `semitones` above `from`, spelled on the letter `letterSteps` after its own. */
function spellAbove(from: SpelledNote, letterSteps: number, semitones: number): SpelledNote {
  const letter = LETTERS[(LETTERS.indexOf(from.letter) + letterSteps) % 7] as Letter;
  const target = pitchClass(from) + semitones;
  // The accidental that carries the letter to the target, the short way round (−6…5).
  const accidental = mod12(target - NATURAL_PC[letter] + 6) - 6;
  return {
    letter,
    accidental,
  };
}

/** The seven notes of a scale, tonic first, each on its own letter. */
export function scaleNotes(tonic: SpelledNote, kind: ScaleKind): SpelledNote[] {
  return SCALE_STEPS[kind].map((semitones, degree) => spellAbove(tonic, degree, semitones));
}

/** One octave up: the seven notes and the tonic again (eight notes to play). */
export function scaleRun(tonic: SpelledNote, kind: ScaleKind): SpelledNote[] {
  return [...scaleNotes(tonic, kind), tonic];
}

/** The MIDI numbers of the run, the tonic sounding at `startMidi` (which must be the tonic's pitch class). */
export function scaleMidis(kind: ScaleKind, startMidi: number): number[] {
  return [...SCALE_STEPS[kind], 12].map((s) => startMidi + s);
}

/** The minor key that shares a major key's signature: its sixth degree. */
export function relativeMinor(majorTonic: SpelledNote): SpelledNote {
  return scaleNotes(majorTonic, 'major')[5] as SpelledNote;
}

/** The major key that shares a minor key's signature: its third degree. */
export function relativeMajor(minorTonic: SpelledNote): SpelledNote {
  return scaleNotes(minorTonic, 'natural-minor')[2] as SpelledNote;
}

const note = (id: string): SpelledNote => parseNote(id) as SpelledNote;

/** The 15 major keys, by the circle of fifths: C, then sharps (G…C♯), then flats (F…C♭). */
export const MAJOR_TONICS: readonly SpelledNote[] = [
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
  'Cb',
].map(note);

/** The 15 minor keys, by the circle of fifths: A, then sharps (E…A♯), then flats (D…A♭). */
export const MINOR_TONICS: readonly SpelledNote[] = [
  'A',
  'E',
  'B',
  'F#',
  'C#',
  'G#',
  'D#',
  'A#',
  'D',
  'G',
  'C',
  'F',
  'Bb',
  'Eb',
  'Ab',
].map(note);

/** Whether two spellings are the same note (same letter and accidental). */
export function sameNote(a: SpelledNote, b: SpelledNote): boolean {
  return a.letter === b.letter && a.accidental === b.accidental;
}
