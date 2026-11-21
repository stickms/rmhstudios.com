/**
 * A singer's range — pure, client-safe. Each range is a comfortable beginner compass (not the
 * extremes of a trained voice) and the staff it reads on: soprano and alto the treble staff as
 * written; tenor the treble staff with the small 8 under the clef (written an octave above where it
 * sounds, as guitar music is); baritone and bass the bass staff. Lessons ask only notes inside the
 * range, at their sounding pitch; what the staff shows is `voiceStaff`.
 */
import { clefStep, type Clef } from '../theory/clef';
import { CARD_MIN_STEP } from '../staff-card-layout';
import { VOICE_RANGES, type VoiceRange } from '../schemas';

export interface VoiceRangeSpec {
  id: VoiceRange;
  /** Lowest and highest sounding MIDI notes lessons ask for. */
  low: number;
  high: number;
  clef: Clef;
  /** The treble clef with the small 8 below it (tenor). */
  octaveClef: boolean;
  /** Added to a sounding pitch to get the written one. */
  writtenShift: 0 | 12;
}

export const VOICE_RANGE: Readonly<Record<VoiceRange, VoiceRangeSpec>> = {
  /** C4 to G5. */
  soprano: {
    id: 'soprano',
    low: 60,
    high: 79,
    clef: 'treble',
    octaveClef: false,
    writtenShift: 0,
  },
  /** G3 to D5: G3 is below the deck card's two ledger lines, so an alto reads on the low card. */
  alto: {
    id: 'alto',
    low: 55,
    high: 74,
    clef: 'treble',
    octaveClef: false,
    writtenShift: 0,
  },
  /** C3 to G4, written C4 to G5 with the octave clef. */
  tenor: {
    id: 'tenor',
    low: 48,
    high: 67,
    clef: 'treble',
    octaveClef: true,
    writtenShift: 12,
  },
  /** G2 to C4: baritone and bass. */
  bass: {
    id: 'bass',
    low: 43,
    high: 60,
    clef: 'bass',
    octaveClef: false,
    writtenShift: 0,
  },
};

/** The range a voice learner who has not chosen yet is given (the dialog asks at once). */
export const DEFAULT_VOICE_RANGE: VoiceRange = 'alto';

export function isVoiceRange(value: unknown): value is VoiceRange {
  return typeof value === 'string' && (VOICE_RANGES as readonly string[]).includes(value);
}

/** A stored range, or the default for null or anything unknown. */
export function resolveVoiceRange(value: unknown): VoiceRange {
  return isVoiceRange(value) ? value : DEFAULT_VOICE_RANGE;
}

/** How a range reads: its clef, the octave clef, and the shift from sounding to written. */
export function voiceReading(range: VoiceRange): {
  clef: Clef;
  octaveClef: boolean;
  writtenShift: 0 | 12;
} {
  const r = VOICE_RANGE[range];
  return {
    clef: r.clef,
    octaveClef: r.octaveClef,
    writtenShift: r.writtenShift,
  };
}

/** Where a sung (sounding) note is written for this range. */
export function voiceStaff(
  midi: number,
  range: VoiceRange,
): {
  clef: Clef;
  midi: number;
  octaveClef: boolean;
} {
  const r = VOICE_RANGE[range];
  return {
    clef: r.clef,
    midi: midi + r.writtenShift,
    octaveClef: r.octaveClef,
  };
}

/** The range as written on its staff, `[low, high]`. */
export function writtenRange(range: VoiceRange): [number, number] {
  const r = VOICE_RANGE[range];
  return [r.low + r.writtenShift, r.high + r.writtenShift];
}

const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11];

/** The natural notes (sounding) of a range, lowest first. */
export function rangeNaturals(range: VoiceRange): number[] {
  const r = VOICE_RANGE[range];
  const out: number[] = [];
  for (let m = r.low; m <= r.high; m++) if (NATURAL_PCS.includes(((m % 12) + 12) % 12)) out.push(m);
  return out;
}

/** `midi` moved by whole octaves into the range (every range spans more than an octave). */
export function foldIntoRange(midi: number, range: VoiceRange): number {
  const r = VOICE_RANGE[range];
  let m = midi;
  while (m < r.low) m += 12;
  while (m > r.high) m -= 12;
  return m;
}

/** Whether every note fits the range. */
export function fitsRange(notes: readonly number[], range: VoiceRange): boolean {
  const r = VOICE_RANGE[range];
  return notes.every((n) => n >= r.low && n <= r.high);
}

/**
 * The staff card a range's notes are drawn on: the low card (`range="low"`, three ledger lines
 * below the treble staff, `CARD_LOW_MIN_STEP`) when the range writes below the deck card's floor
 * (an alto's G3), else the deck card. A placeholder takes the same card's height.
 */
export function staffCardRange(range: VoiceRange): 'deck' | 'low' {
  const { clef } = VOICE_RANGE[range];
  const [lo] = writtenRange(range);
  return clefStep(clef, lo) < CARD_MIN_STEP ? 'low' : 'deck';
}
