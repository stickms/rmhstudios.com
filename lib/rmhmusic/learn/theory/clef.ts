/**
 * Where a natural note sits on a treble or a bass staff — pure.
 *
 * `staff.ts` counts diatonic steps from the TREBLE bottom line (E4). A bass staff is the same
 * five lines with a different bottom line (G2), so its step is that count shifted by the
 * distance between the two bottom lines. Sharps land on their natural's step (the Phase 2
 * drills use naturals only, so no enharmonic spelling is needed).
 */
import { staffStep, TOP_LINE_STEP } from '../staff';

export type Clef = 'treble' | 'bass';

/** Each clef's bottom line: treble E4, bass G2. */
const BOTTOM_LINE_MIDI: Record<Clef, number> = { treble: 64, bass: 43 };

/** The steps from the treble bottom line to each clef's own (treble 0, bass −12). */
const CLEF_OFFSET: Record<Clef, number> = {
  treble: -staffStep(BOTTOM_LINE_MIDI.treble),
  bass: -staffStep(BOTTOM_LINE_MIDI.bass),
};

/** Diatonic steps above the clef's bottom line; negative below the staff. */
export function clefStep(clef: Clef, midi: number): number {
  return staffStep(midi) + CLEF_OFFSET[clef];
}

/**
 * The even steps that need a ledger line to reach `step`: below 0 → −2, −4 … down to `step`,
 * above the top line → 10, 12 … up to `step`, none inside or just outside the staff.
 */
export function ledgerSteps(step: number): number[] {
  const lines: number[] = [];
  for (let s = -2; s >= step; s -= 2) lines.push(s);
  for (let s = TOP_LINE_STEP + 2; s <= step; s += 2) lines.push(s);
  return lines;
}

export type NoteLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/** Letter of each pitch class, a sharp keeping the natural below it. */
const LETTERS: readonly NoteLetter[] = [
  'C',
  'C',
  'D',
  'D',
  'E',
  'F',
  'F',
  'G',
  'G',
  'A',
  'A',
  'B',
];

export function noteLetter(midi: number): NoteLetter {
  return LETTERS[((Math.round(midi) % 12) + 12) % 12];
}
