/**
 * The songbook's notation — a tiny text format a melody is transcribed in by hand, parsed by a pure
 * function so a typo fails a test rather than a page.
 *
 * A note is a letter, an optional `#` or `b`, an octave (scientific pitch: C4 is middle C) and an
 * optional duration in beats after a colon (default one beat): `E4`, `F#4:0.5`, `G4:3`. Bars are
 * split by `|`; spaces separate notes. Only the lengths a beginner melody uses are known (an
 * eighth, a quarter, a dotted quarter, a half, a dotted half and a whole note). There are no rests
 * and no ties: the songbook's melodies need none.
 *
 * The spelling is kept (F♯ and G♭ are the same key but different notes on paper), so the staff
 * shows a note as it was written.
 */

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export interface SongNote {
  letter: Letter;
  /** −1 flat, 0 natural, 1 sharp. */
  alter: -1 | 0 | 1;
  octave: number;
  /** The written pitch, MIDI (60 = middle C). */
  pitch: number;
  /** Length in beats (a quarter note is one). */
  beats: number;
}

/** Pitch classes of the natural letters. */
export const LETTER_PC: Readonly<Record<Letter, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** The lengths the format knows, in beats. */
export const NOTE_BEATS: readonly number[] = [0.5, 1, 1.5, 2, 3, 4];

const TOKEN = /^([A-G])(#|b)?([0-8])(?::(\d+(?:\.\d+)?))?$/;

/** One note token, or null when it is not one. */
export function parseNote(token: string): SongNote | null {
  const m = TOKEN.exec(token);
  if (!m) return null;
  const letter = m[1] as Letter;
  const alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = Number(m[3]);
  const beats = m[4] === undefined ? 1 : Number(m[4]);
  if (!NOTE_BEATS.includes(beats)) return null;
  return {
    letter,
    alter,
    octave,
    pitch: 12 * (octave + 1) + LETTER_PC[letter] + alter,
    beats,
  };
}

/** Bars of notes. Throws, naming the token, on anything it cannot read. */
export function parseBars(src: string): SongNote[][] {
  const parts = src.split('|');
  // A trailing bar line leaves one empty part at the end; any other empty part is a mistake.
  if (parts.length > 1 && parts[parts.length - 1]?.trim() === '') parts.pop();
  return parts.map((part, i) => {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) throw new Error(`bar ${i + 1} is empty`);
    return tokens.map((token) => {
      const note = parseNote(token);
      if (!note) throw new Error(`bar ${i + 1}: cannot read "${token}"`);
      return note;
    });
  });
}
