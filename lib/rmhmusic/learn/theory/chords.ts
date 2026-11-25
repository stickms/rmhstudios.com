/**
 * The four triads the chord lessons name and ask for: a root with a third and a fifth above it.
 * A chord is its pitch classes, so an inversion, a doubled note or another octave is the same
 * chord (`chordQuality`, `matchesChord`). Pure; client-safe.
 */
import { LETTERS, parseNote, pitchClass, type Letter, type SpelledNote } from './scales';

export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented';

/** The qualities, in the order the lessons list them. */
export const CHORD_QUALITIES: readonly ChordQuality[] = ['major', 'minor', 'diminished', 'augmented'];

/** Semitones above the root. */
export const CHORDS: Record<ChordQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
};

/** The notes of `quality` on `root`, lowest first (root position). */
export function chordNotes(root: number, quality: ChordQuality): number[] {
  return CHORDS[quality].map((s) => root + s);
}

/**
 * The distinct pitch classes (0..11) of the notes, ascending. A list holding anything that is not
 * a note (NaN, Infinity) has none: it is not a chord, and `chordQuality` and `matchesChord` say
 * the same, so a bad value is never quietly dropped and the rest judged.
 */
export function pitchClasses(midis: readonly number[]): number[] {
  if (midis.some((m) => !Number.isFinite(m))) return [];
  const set = new Set<number>();
  for (const m of midis) set.add(((Math.round(m) % 12) + 12) % 12);
  return [...set].sort((a, b) => a - b);
}

/**
 * The triad these notes make, in any order, octave or inversion (and with a note doubled), or null
 * when they are not exactly one of the four triads.
 */
export function chordQuality(midis: readonly number[]): ChordQuality | null {
  const pcs = pitchClasses(midis);
  if (pcs.length !== 3) return null;
  for (const root of pcs) {
    const stack = pcs.map((p) => (p - root + 12) % 12).sort((a, b) => a - b);
    for (const quality of CHORD_QUALITIES) {
      if (CHORDS[quality].every((s, i) => s === stack[i])) return quality;
    }
  }
  return null;
}

/**
 * Whether the played notes are exactly the pitch classes of `quality` on `root`. False when the
 * root or any played note is not a number.
 */
export function matchesChord(played: readonly number[], root: number, quality: ChordQuality): boolean {
  const want = pitchClasses(chordNotes(root, quality));
  const got = pitchClasses(played);
  return want.length > 0 && want.length === got.length && want.every((p, i) => p === got[i]);
}

/** The fewest distinct pitch classes that make an attempt at a chord. */
export const MIN_CHORD_PITCH_CLASSES = 3;

/**
 * Whether these notes are a try at a chord rather than a lone tap or a dyad: at least
 * {@link MIN_CHORD_PITCH_CLASSES} distinct pitch classes. Only an attempt is graded; fewer notes
 * are the learner finding the keys.
 */
export function isChordAttempt(midis: readonly number[]): boolean {
  return pitchClasses(midis).length >= MIN_CHORD_PITCH_CLASSES;
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/**
 * The three written notes of a triad, root first: each is a third above the last by LETTER (C, E, G;
 * never C, F♭, G), with whatever accidental brings its letter to the pitch the quality asks for. So
 * F♯ major is F♯ A♯ C♯ and A♭ minor is A♭ C♭ E♭. A root that needs a double accidental somewhere
 * (D♯ major: F𝄪) still spells, with `accidental` of ±2: {@link hasDoubleAccidental} says so, and the
 * lessons' pools leave those triads out. `root` is a note or its plain id ("F#", "Bb"); an id that
 * is not a note spells nothing (an empty list).
 */
export function spellTriad(root: SpelledNote | string, quality: ChordQuality): SpelledNote[] {
  const tonic = typeof root === 'string' ? parseNote(root) : root;
  if (!tonic) return [];
  const rootPc = pitchClass(tonic);
  return CHORDS[quality].map((semitones, i) => {
    const letter = LETTERS[(LETTERS.indexOf(tonic.letter) + 2 * i) % 7] as Letter;
    // The accidental that carries the letter to the target pitch class, the short way round (-6..5).
    const accidental = mod12(rootPc + semitones - pitchClass({ letter, accidental: 0 }) + 6) - 6;
    return { letter, accidental };
  });
}

/** Whether any written note has more than one sharp or flat (a note such as F𝄪 or B𝄫). */
export function hasDoubleAccidental(notes: readonly SpelledNote[]): boolean {
  return notes.some((n) => Math.abs(n.accidental) > 1);
}

/** The inversion of a triad: 0 root position, 1 first (the third lowest), 2 second (the fifth lowest). */
export type Inversion = 0 | 1 | 2;

/**
 * The inversion the notes are played in, by which chord note is LOWEST: the root (0), the third (1)
 * or the fifth (2). Any octave, order or doubled note: only the lowest sounding note and the
 * pitch classes matter. `rootPc` (0..11) says which note is the root; without it the root is found
 * from the notes, which an augmented triad cannot say (every one of its notes can be the root), so
 * that gives null. Null too when the notes are not exactly one triad, or the root is not in it.
 */
export function inversionOf(midis: readonly number[], rootPc?: number): Inversion | null {
  const quality = chordQuality(midis);
  if (quality === null) return null;
  let root: number;
  if (rootPc === undefined) {
    if (quality === 'augmented') return null;
    const pcs = pitchClasses(midis);
    const found = pcs.find((p) => matchesChord(midis, p, quality));
    if (found === undefined) return null;
    root = found;
  } else {
    if (!Number.isFinite(rootPc)) return null;
    root = mod12(Math.round(rootPc));
    if (!matchesChord(midis, root, quality)) return null;
  }
  const bass = mod12(Math.round(Math.min(...midis)));
  const above = mod12(bass - root);
  const at = CHORDS[quality].indexOf(above);
  return at === 0 || at === 1 || at === 2 ? at : null;
}

const note = (id: string): SpelledNote => {
  const n = parseNote(id) as SpelledNote;
  // `parseNote` gives a natural's accidental as -0.
  return { letter: n.letter, accidental: n.accidental === 0 ? 0 : n.accidental };
};

/**
 * The root each of the twelve major triads is written on, by the keys a player meets (F♯ major, not
 * G♭ major; A♭, B♭, D♭ and E♭ on the flat side).
 */
export const MAJOR_ROOTS: readonly SpelledNote[] = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
].map(note);

/** The root each of the twelve minor triads is written on (C♯, E♭, F♯, G♯ and B♭ minor). */
export const MINOR_ROOTS: readonly SpelledNote[] = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'Bb',
  'B',
].map(note);

/** The seven natural roots, for the diminished and augmented triads. */
export const NATURAL_ROOTS: readonly SpelledNote[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map(note);

/** A triad a lesson can ask for: its written root and quality. */
export interface Triad {
  root: SpelledNote;
  quality: ChordQuality;
}

/** The roots a quality is asked on: twelve for major and minor, the seven naturals for the other two. */
export function rootsFor(quality: ChordQuality): readonly SpelledNote[] {
  return quality === 'major' ? MAJOR_ROOTS : quality === 'minor' ? MINOR_ROOTS : NATURAL_ROOTS;
}

/** Every triad of these qualities in the tables above, major first. */
export function triadsOf(qualities: readonly ChordQuality[]): Triad[] {
  return qualities.flatMap((quality) => rootsFor(quality).map((root) => ({ root, quality })));
}
