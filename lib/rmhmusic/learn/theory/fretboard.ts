/**
 * The guitar's fretboard in standard tuning — pure.
 *
 * Strings are indexed LOW TO HIGH, 0 = the low E (E2, MIDI 40) … 5 = the high E (E4, 64), so the
 * index grows with pitch. Guitarists number strings the other way (string 1 is the high E, string 6
 * the low E); {@link stringNumber} converts, and everything a learner reads or hears uses it.
 *
 * Pitch: a position's MIDI number ({@link fretMidi}) is the pitch it SOUNDS, which is what a MIDI
 * guitar or the microphone reports, so answers are matched on it. Guitar music is written an
 * octave above that (a treble staff read an octave down — the "8" under the clef), so the open low
 * E, which sounds E2 (40), is written as E3 (52) three ledger lines under the treble staff:
 * {@link writtenMidi} is the pitch to DRAW. Display uses written pitch; matching uses sounding
 * pitch.
 */

/** Open strings, low to high: E2 A2 D3 G3 B3 E4. */
export const STANDARD_TUNING: readonly number[] = [40, 45, 50, 55, 59, 64];

export const STRING_COUNT = STANDARD_TUNING.length;

/** The first-frets lessons stay on frets 0 (the open string) to 5. */
export const FIRST_FRETS = 5;

/** No fret past this exists on a guitar. */
export const MAX_FRET = 24;

/** The written octave is this many semitones above the sounding one. */
export const WRITTEN_OCTAVE_UP = 12;

export interface FretPosition {
  /** 0 = the low E … 5 = the high E. */
  string: number;
  /** 0 = the open string. */
  fret: number;
}

/** Whether `string` and `fret` name a place on the board (integers, in range). */
export function isPosition(string: number, fret: number): boolean {
  return (
    Number.isInteger(string) &&
    string >= 0 &&
    string < STRING_COUNT &&
    Number.isInteger(fret) &&
    fret >= 0 &&
    fret <= MAX_FRET
  );
}

/** The pitch a position sounds. Throws RangeError for a place that is not on the board. */
export function fretMidi(string: number, fret: number): number {
  if (!isPosition(string, fret)) {
    throw new RangeError(`no string ${string}, fret ${fret} on a ${STRING_COUNT}-string guitar`);
  }
  return STANDARD_TUNING[string] + fret;
}

/**
 * Every position in frets 0…`maxFret` that sounds `midi`, low string first. Empty for a pitch the
 * board cannot reach there, a non-integer pitch, or a `maxFret` that is negative or not a number.
 */
export function positionsOf(midi: number, maxFret: number): FretPosition[] {
  if (!Number.isInteger(midi) || !Number.isFinite(maxFret) || maxFret < 0) return [];
  const top = Math.min(Math.floor(maxFret), MAX_FRET);
  const out: FretPosition[] = [];
  for (let string = 0; string < STRING_COUNT; string++) {
    const fret = midi - STANDARD_TUNING[string];
    if (fret >= 0 && fret <= top) out.push({ string, fret });
  }
  return out;
}

/** Where guitar music writes a sounding pitch: an octave higher (sounding E2 40 → written E3 52). */
export function writtenMidi(sounding: number): number {
  return sounding + WRITTEN_OCTAVE_UP;
}

/** The guitarist's number for a string index: index 5 (high E) is string 1, index 0 string 6. */
export function stringNumber(index: number): number {
  return STRING_COUNT - index;
}

const NATURAL_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);

/** The natural notes some position in frets 0…`maxFret` sounds, lowest first. */
export function naturalsInFrets(maxFret: number): number[] {
  const low = STANDARD_TUNING[0];
  const high = STANDARD_TUNING[STRING_COUNT - 1] + Math.max(0, Math.floor(maxFret));
  const out: number[] = [];
  for (let m = low; m <= high; m++) {
    if (NATURAL_PITCH_CLASSES.has(m % 12) && positionsOf(m, maxFret).length > 0) out.push(m);
  }
  return out;
}
