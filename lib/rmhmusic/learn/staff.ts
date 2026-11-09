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

/**
 * The lowest and highest steps the live staff draws: four ledger lines below (down to the
 * guitar's low E written an octave up, E3) and three above.
 */
export const STAFF_MIN_STEP = -8;
export const STAFF_MAX_STEP = 14;

/**
 * A note brought onto the drawable staff by whole octaves, the way notation does with an
 * ottava sign: a guitar's low E (E2) is drawn as E3 under "8vb" (`ottava: -1`), which is
 * also how guitar music is written, so it is never
 * pinned to the edge at a wrong pitch. `ottava` is how many octaves the drawn note is ABOVE
 * (negative) or BELOW (positive) the drawing: −1 → "8vb", 1 → "8va".
 */
export function fitToStaff(midi: number): { position: StaffPosition; ottava: number } {
  let m = Math.round(midi);
  let ottava = 0;
  while (staffStep(m) < STAFF_MIN_STEP) {
    m += 12;
    ottava -= 1;
  }
  while (staffStep(m) > STAFF_MAX_STEP) {
    m -= 12;
    ottava += 1;
  }
  return { position: staffPosition(m), ottava };
}
