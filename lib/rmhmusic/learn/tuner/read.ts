/**
 * Where the note reader writes a played note — pure. The reader draws on the note finder's taller
 * low card (`SprintSheet` with `range="low"`), steps {@link READ_MIN_STEP}…{@link READ_MAX_STEP}:
 *
 * - piano: the treble staff from middle C up, the bass staff below it;
 * - guitar: the treble staff an octave up (guitar music is written an octave above how it sounds,
 *   and the clef carries the small 8).
 *
 * A black key is written as the natural below it with a sharp. A note the card cannot reach is
 * reported as `high` or `low` instead of being drawn at the wrong place.
 */
import { midiToName } from '../pitch/notes';
import {
  clefStep,
  type Clef,
} from '../theory/clef';
import { WRITTEN_OCTAVE_UP } from '../theory/fretboard';

/** The low card's lowest step (`CARD_LOW_MIN_STEP`). */
export const READ_MIN_STEP =
  -7;
/** The card's highest step (`CARD_MAX_STEP`). */
export const READ_MAX_STEP = 12;

/** Middle C: the piano's treble staff starts here. */
const MIDDLE_C = 60;
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

export interface ReadPlacement {
  clef: Clef;
  /** The written note in `SheetNote`'s shape: the natural it sits on and its sharp. */
  note: {
    written: number;
    accidental:
      | 0
      | 1;
  };
  /** The treble clef with the small 8 (guitar). */
  octaveClef: boolean;
}

export function readPlacement(
  midi: number,
  instrument:
    | 'piano'
    | 'guitar',
):
  | ReadPlacement
  | 'high'
  | 'low' {
  if (
    !Number.isFinite(
      midi,
    )
  )
    return 'low';
  const guitar =
    instrument ===
    'guitar';
  const clef: Clef =
    guitar ||
    midi >=
      MIDDLE_C
      ? 'treble'
      : 'bass';
  const written =
    guitar
      ? midi +
        WRITTEN_OCTAVE_UP
      : midi;
  const sharp =
    BLACK.has(
      ((written %
        12) +
        12) %
        12,
    );
  const natural =
    sharp
      ? written -
        1
      : written;
  const step =
    clefStep(
      clef,
      natural,
    );
  if (
    step >
    READ_MAX_STEP
  )
    return 'high';
  if (
    step <
    READ_MIN_STEP
  )
    return 'low';
  return {
    clef,
    note: {
      written:
        natural,
      accidental:
        sharp
          ? 1
          : 0,
    },
    octaveClef:
      guitar,
  };
}

/** A note's name and octave as the reader prints it: "C♯4" (sounding pitch, sharps). */
export function readName(
  midi: number,
): string {
  return midiToName(
    midi,
  ).replace(
    '#',
    '♯',
  );
}
