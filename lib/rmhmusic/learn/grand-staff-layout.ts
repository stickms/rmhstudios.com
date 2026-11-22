/**
 * Where everything on a grand-staff card goes — pure, so the drawing can be checked without a DOM.
 *
 * A grand staff is two staves joined by a brace and a bar line: the treble staff above, the bass
 * staff below, the gap between them {@link GRAND_GAP_SPACES} spaces from the treble's bottom line
 * (E4) to the bass's top line (A3). That gap is wide enough that middle C is two different marks:
 * written on the treble staff it hangs on a ledger line one space under E4; written on the bass staff
 * it hangs on a ledger line one space over A3, two spaces lower on the page. A note's ledger lines
 * always belong to the staff it is written on.
 *
 * The coordinates continue the flashcard's (`staff-card-layout.ts`): the treble staff's top line is
 * at {@link CARD_TOP}, the note is at {@link CARD_NOTE_X}, a space is {@link CARD_GAP}. The box starts
 * at {@link GRAND_VIEW_X} so the brace has room to the left of the staves.
 */

import { CARD_GAP, CARD_NOTE_X, CARD_TOP, CARD_W, HEAD_RX, ribbon } from './staff-card-layout';
import { clefStep, ledgerSteps, type Clef } from './theory/clef';

/** Spaces from the treble staff's bottom line to the bass staff's top line. */
export const GRAND_GAP_SPACES = 4;
/** The bass staff's top line, y. */
export const GRAND_BASS_TOP = CARD_TOP + 4 * CARD_GAP + GRAND_GAP_SPACES * CARD_GAP;
/** How far the bass staff is moved down from where a single staff's top line is. */
export const GRAND_BASS_DY = GRAND_BASS_TOP - CARD_TOP;
/** The bass staff's bottom line, y. */
export const GRAND_BASS_BOTTOM = GRAND_BASS_TOP + 4 * CARD_GAP;
/** The lowest and highest steps a grand-staff note can be written at, on either staff (two ledger lines each way). */
export const GRAND_MIN_STEP = -4;
export const GRAND_MAX_STEP = 12;
/** The SVG box: two ledger lines under the bass staff and a little paper. */
export const GRAND_H = GRAND_BASS_BOTTOM + 2 * CARD_GAP + 8;
/** The box's left edge: the brace lives left of the staves, which start at x = 4. */
export const GRAND_VIEW_X = -12;
export const GRAND_W = CARD_W - GRAND_VIEW_X;
/** The bar line joining the two staves, x. */
export const GRAND_BAR_X = 4;
/** A stem is three and a half spaces long (as on a flashcard). */
const STEM = 3.5 * CARD_GAP;

/** The y of a staff's top line. */
export const staffTopY = (staff: Clef): number => (staff === 'treble' ? CARD_TOP : GRAND_BASS_TOP);

/** The y of `step` (diatonic steps above the bottom line) on `staff`. */
export const grandY = (staff: Clef, step: number): number => staffTopY(staff) + 4 * CARD_GAP - (step * CARD_GAP) / 2;

export interface GrandStaffLayout {
  /** The staff the note is written on. */
  staff: Clef;
  /** Steps above that staff's bottom line (negative below it), clamped to what the box can draw. */
  step: number;
  noteY: number;
  /** The note's ledger lines (y), all on its own staff's side. */
  ledgerYs: number[];
  stem: {
    x: number;
    y1: number;
    y2: number;
  };
}

/**
 * The note `midi` written on `staff` of the grand staff. A step outside {@link GRAND_MIN_STEP}…
 * {@link GRAND_MAX_STEP} is clamped to the edge (no deck or finder target asks for one).
 */
export function grandStaffLayout(staff: Clef, midi: number): GrandStaffLayout {
  const step = Math.min(GRAND_MAX_STEP, Math.max(GRAND_MIN_STEP, clefStep(staff, midi)));
  const noteY = grandY(staff, step);
  const up = step < 4;
  return {
    staff,
    step,
    noteY,
    ledgerYs: ledgerSteps(step).map((s) => grandY(staff, s)),
    stem: up
      ? {
          x: CARD_NOTE_X + HEAD_RX - 0.6,
          y1: noteY - 1,
          y2: noteY - STEM,
        }
      : {
          x: CARD_NOTE_X - HEAD_RX + 0.6,
          y1: noteY + 1,
          y2: noteY + STEM,
        },
  };
}

/** The staff a pianist reads `midi` on: the bass staff below middle C, the treble staff from it up. */
export function pianoStaffOf(midi: number): Clef {
  return midi < 60 ? 'bass' : 'treble';
}

/**
 * Where a note sits on its staff, in words' terms (the card's text alternative says it): a line or a
 * space of the staff, or a ledger line or space beyond it. `n` counts from the staff's bottom
 * (lines 1–5, spaces 1–4) or outward from the staff (ledger lines and spaces 1–2).
 */
export type StaffSpot =
  | { kind: 'line'; n: 1 | 2 | 3 | 4 | 5 }
  | { kind: 'space'; n: 1 | 2 | 3 | 4 }
  | { kind: 'ledger-line'; side: 'below' | 'above'; n: 1 | 2 }
  | { kind: 'ledger-space'; side: 'below' | 'above'; n: 1 | 2 };

/**
 * The spot a step names, for steps {@link GRAND_MIN_STEP}…{@link GRAND_MAX_STEP}. A space just beyond
 * the staff (step −1, 9) is the first ledger space; the one past the first ledger line is the second.
 */
export function staffSpot(step: number): StaffSpot {
  const s = Math.min(GRAND_MAX_STEP, Math.max(GRAND_MIN_STEP, Math.round(step)));
  if (s >= 0 && s <= 8) {
    return s % 2 === 0
      ? { kind: 'line', n: (s / 2 + 1) as 1 | 2 | 3 | 4 | 5 }
      : { kind: 'space', n: ((s + 1) / 2) as 1 | 2 | 3 | 4 };
  }
  const side = s < 0 ? 'below' : 'above';
  const out = s < 0 ? -s : s - 8; // 1 … 4 steps beyond the staff's outer line
  return out % 2 === 0
    ? { kind: 'ledger-line', side, n: (out / 2) as 1 | 2 }
    : { kind: 'ledger-space', side, n: ((out + 1) / 2) as 1 | 2 };
}

// ── The brace ────────────────────────────────────────────────────────────────

/** The brace's centreline in staff spaces: x from the bar line (negative is left), y from the treble top line, pen width. */
const BRACE_POINTS: readonly (readonly [number, number, number])[] = [
  [0.1, 0.0, 0.05],
  [-0.4, 0.55, 0.14],
  [-0.78, 1.5, 0.26],
  [-0.84, 2.9, 0.3],
  [-0.7, 4.6, 0.26],
  [-0.9, 5.5, 0.2],
  [-1.2, 6.0, 0.08],
  [-0.9, 6.5, 0.2],
  [-0.7, 7.4, 0.26],
  [-0.84, 9.1, 0.3],
  [-0.78, 10.5, 0.26],
  [-0.4, 11.45, 0.14],
  [0.1, 12.0, 0.05],
];

/** The brace as one filled outline, from the treble staff's top line to the bass staff's bottom line. */
export const GRAND_BRACE_PATH: string = ribbon(BRACE_POINTS, 16, GRAND_BAR_X - 3, CARD_TOP, CARD_GAP);

/** The bar line that joins the staves, at the left. */
export const GRAND_BAR: { x: number; y1: number; y2: number } = {
  x: GRAND_BAR_X,
  y1: CARD_TOP,
  y2: GRAND_BASS_BOTTOM,
};
