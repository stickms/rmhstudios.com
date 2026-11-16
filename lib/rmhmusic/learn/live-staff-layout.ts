/**
 * Where everything on the live staff (`components/rmhmusic/learn/LiveStaff.tsx`) goes — pure, so
 * the drawing can be tested without a DOM.
 *
 * The SVG's box is fixed ({@link VIEW_W} × {@link VIEW_H}) so the staff never changes size between
 * notes; every mark for every MIDI note (0–127) is laid out inside it. A note beyond the drawn
 * range is moved by octaves (`fitToStaff`) and carries an ottava sign, set BESIDE the notehead
 * (to its right, on the note's own line) so it stays in the box even for the lowest and highest
 * drawn steps.
 */

import {
  STAFF_MAX_STEP,
  STAFF_MIN_STEP,
  fitToStaff,
} from './staff';
import {
  clefStep,
  ledgerSteps,
  type Clef,
} from './theory/clef';

export const VIEW_W = 200;
export const VIEW_H = 132;
export const GAP = 10;
/** The top line's y; the drawing runs from 3 ledger lines above to 4 below. */
export const TOP = 42;
export const NOTE_X = 128;
export const LABEL_FONT = 11;
/** A generous width per character of the italic serif label, as a share of the font size. */
const CHAR_W = 0.62;

export const yOf =
  (
    step: number,
  ): number =>
    TOP +
    4 *
      GAP -
    (step *
      GAP) /
      2;

/** The ottava sign for a note drawn `ottava` octaves away from where it sounds ('8vb', '15ma', …). */
export function ottavaText(
  ottava: number,
): string {
  const n =
    Math.abs(
      ottava,
    );
  const interval =
    n ===
    1
      ? 8
      : 7 *
          n +
        1;
  if (
    ottava <
    0
  )
    return n ===
      1
      ? '8vb'
      : `${interval}mb`;
  return n ===
    1
    ? '8va'
    : `${interval}ma`;
}

export interface OttavaLabel {
  text: string;
  /** Text anchor (start) and baseline. */
  x: number;
  y: number;
  /** The label's bounding box, conservatively estimated. */
  box: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface LiveStaffLayout {
  step: number;
  noteY: number;
  ledgerYs: number[];
  sharp: boolean;
  ottava: number;
  label: OttavaLabel | null;
}

/** The black keys' pitch classes: a sharp on the live staff. */
const BLACK =
  new Set(
    [
      1,
      3,
      6,
      8,
      10,
    ],
  );

/**
 * The note's place on the staff of `clef` (treble by default; bass for a bass singer): a note
 * beyond the drawn steps moved by octaves, as on the treble staff.
 */
function fitToClef(
  midi: number,
  clef: Clef,
): {
  position: {
    step: number;
    ledgerLines: number[];
    accidental:
      | string
      | null;
  };
  ottava: number;
} {
  if (
    clef ===
    'treble'
  )
    return fitToStaff(
      midi,
    );
  let m =
    Math.round(
      midi,
    );
  let ottava = 0;
  while (
    clefStep(
      clef,
      m,
    ) <
    STAFF_MIN_STEP
  ) {
    m += 12;
    ottava -= 1;
  }
  while (
    clefStep(
      clef,
      m,
    ) >
    STAFF_MAX_STEP
  ) {
    m -= 12;
    ottava += 1;
  }
  const step =
    clefStep(
      clef,
      m,
    );
  return {
    position:
      {
        step,
        ledgerLines:
          ledgerSteps(
            step,
          ),
        accidental:
          BLACK.has(
            ((m %
              12) +
              12) %
              12,
          )
            ? 'sharp'
            : null,
      },
    ottava,
  };
}

export function liveStaffLayout(
  midi: number,
  clef: Clef = 'treble',
): LiveStaffLayout {
  const {
    position,
    ottava,
  } =
    fitToClef(
      midi,
      clef,
    );
  const noteY =
    yOf(
      position.step,
    );
  let label: OttavaLabel | null =
    null;
  if (
    ottava !==
    0
  ) {
    const text =
      ottavaText(
        ottava,
      );
    // Right of the notehead and its ledger lines, centred on the note's line.
    const x =
      NOTE_X +
      16;
    const y =
      noteY +
      LABEL_FONT *
        0.35;
    label =
      {
        text,
        x,
        y,
        box: {
          x0: x,
          y0:
            y -
            LABEL_FONT *
              0.8,
          x1:
            x +
            text.length *
              LABEL_FONT *
              CHAR_W,
          y1:
            y +
            LABEL_FONT *
              0.25,
        },
      };
  }
  return {
    step: position.step,
    noteY,
    ledgerYs:
      position.ledgerLines.map(
        yOf,
      ),
    sharp:
      position.accidental ===
      'sharp',
    ottava,
    label,
  };
}
