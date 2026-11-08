/**
 * Where a note sits on a treble staff — pure, shared by `LiveStaff` and the paper backdrop.
 *
 * Positions are diatonic STEPS above the bottom line: 0 is the bottom line (E4), 1 the first
 * space (F4), 8 the top line (F5). Lines are the even steps 0–8; below and above the staff the
 * even steps need ledger lines (middle C, step −2, sits on the first ledger line below).
 * Accidentals are spelled as sharps (C♯, not D♭), the beginner spelling of the black keys.
 */

/** Letter index (C=0 … B=6) of each pitch class, sharps spelled on the letter below. */
const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6] as const;
const SHARP = [
  false,
  true,
  false,
  true,
  false,
  false,
  true,
  false,
  true,
  false,
  true,
  false,
] as const;
/** E4's diatonic number (octave 4 × 7 + E). */
const BOTTOM_LINE = 4 * 7 + 2;
/** The top line's step (F5). */
export const TOP_LINE_STEP = 8;

export interface StaffPosition {
  /** Diatonic steps above the bottom line (E4 = 0); negative below the staff. */
  step: number;
  accidental: 'sharp' | null;
  /** The ledger lines the note needs, as steps (e.g. [-2] for middle C, [10, 12] for C6). */
  ledgerLines: number[];
}

export function staffPosition(midi: number): StaffPosition {
  const m = Math.round(midi);
  const pc = ((m % 12) + 12) % 12;
  const octave = Math.floor(m / 12) - 1;
  const step = octave * 7 + LETTER[pc] - BOTTOM_LINE;
  const ledgerLines: number[] = [];
  for (let s = -2; s >= step; s -= 2) ledgerLines.push(s);
  for (let s = TOP_LINE_STEP + 2; s <= step; s += 2) ledgerLines.push(s);
  return { step, accidental: SHARP[pc] ? 'sharp' : null, ledgerLines };
}

/** The same step without building the ledger list, for per-frame callers. */
export function staffStep(midi: number): number {
  const m = Math.round(midi);
  const pc = ((m % 12) + 12) % 12;
  return (Math.floor(m / 12) - 1) * 7 + LETTER[pc] - BOTTOM_LINE;
}

/** Whether a MIDI note is a black key (spelled with a sharp). */
export function isSharp(midi: number): boolean {
  return SHARP[((Math.round(midi) % 12) + 12) % 12];
}
