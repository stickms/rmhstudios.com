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

import { fitToStaff } from './staff';

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

export function liveStaffLayout(
  midi: number,
): LiveStaffLayout {
  const {
    position,
    ottava,
  } =
    fitToStaff(
      midi,
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
