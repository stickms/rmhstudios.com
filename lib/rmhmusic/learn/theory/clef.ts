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

/**
 * Added to a treble-relative step to get a clef-relative one: 0 for treble, +12 for bass (the bass
 * bottom line, G2, sits 12 steps below E4, so every note is 12 steps higher above it).
 */
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
 *
 * Total: a non-finite step (NaN, ±Infinity) has no position, so it gets none (`[]`), and at most
 * MAX_LEDGER_STEPS lines are returned (the nearest ones to the staff), so a wild finite step
 * cannot allocate or loop without bound. 20 lines is well past any note a staff can show.
 */
export const MAX_LEDGER_STEPS = 20;

export function ledgerSteps(step: number): number[] {
  const lines: number[] = [];
  if (!Number.isFinite(step)) return lines;
  for (let s = -2; s >= step && lines.length < MAX_LEDGER_STEPS; s -= 2) lines.push(s);
  for (let s = TOP_LINE_STEP + 2; s <= step && lines.length < MAX_LEDGER_STEPS; s += 2) {
    lines.push(s);
  }
  return lines;
}

export type NoteLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/** Letter of each pitch class, a sharp keeping the natural below it. */
const LETTERS: readonly NoteLetter[] = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];

/** Letter name of a MIDI note. Throws RangeError for a non-finite `midi` (it has no letter). */
export function noteLetter(midi: number): NoteLetter {
  if (!Number.isFinite(midi)) throw new RangeError(`midi must be a finite number, got ${midi}`);
  return LETTERS[((Math.round(midi) % 12) + 12) % 12];
}
