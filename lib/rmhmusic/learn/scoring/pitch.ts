/**
 * How close a played note is to the one asked for — the pitch match's scoring. Pure.
 *
 * The error is measured in cents across note boundaries: `(played.midi − target) × 100 + cents`,
 * so the microphone's B3 +95 cents is 5 cents flat of C4, not a wrong note. `cents` is the
 * microphone's refinement of the note it heard; every other source (MIDI, the computer keys, the
 * on-screen piano) plays exact pitches and passes none, which counts as 0 cents — for them a note
 * is simply right (100) or wrong (0).
 *
 * Points: 100 within {@link SPOT_ON_CENTS}, falling linearly to 0 at {@link MISS_CENTS} (a
 * semitone). A different octave is more than a semitone away, so it scores 0 like any wrong note.
 */

/** Within this many cents a note is spot on. */
export const SPOT_ON_CENTS = 10;
/** At this many cents off (a semitone) a note scores nothing. */
export const MISS_CENTS = 100;
/** Up to this many cents off, a close note is "a little" flat or sharp. */
export const A_LITTLE_CENTS = 50;

export interface PlayedPitch {
  midi: number;
  /** The microphone's deviation from `midi`; absent (0) for exact sources. */
  cents?: number;
}

/**
 * Signed error in cents: negative is flat, positive sharp. A non-finite `cents` counts as 0; a
 * non-finite `midi` (or target) gives NaN or ±Infinity, which no verdict or score treats as close.
 */
export function centsOff(targetMidi: number, played: PlayedPitch): number {
  const cents = Number.isFinite(played.cents) ? (played.cents as number) : 0;
  return (played.midi - targetMidi) * 100 + cents;
}

/** 0..100 for how close `played` is to `targetMidi` (see the header). */
export function pitchPoints(targetMidi: number, played: PlayedPitch): number {
  if (!Number.isFinite(targetMidi) || !Number.isFinite(played.midi)) return 0;
  const off = Math.abs(centsOff(targetMidi, played));
  if (off <= SPOT_ON_CENTS) return 100;
  if (off >= MISS_CENTS) return 0;
  return ((MISS_CENTS - off) / (MISS_CENTS - SPOT_ON_CENTS)) * 100;
}

export type PitchVerdictKind =
  'spot-on' | 'a-little-flat' | 'a-little-sharp' | 'flat' | 'sharp' | 'octave' | 'wrong';

/**
 * What to tell the learner about one note: spot on, a little (≤ 50 cents) or more flat or sharp
 * (under a semitone, which only the microphone can be), the right letter in another octave, or a
 * wrong note. `heard` is the semitone nearest to what was played, for naming it.
 */
export function pitchVerdict(
  targetMidi: number,
  played: PlayedPitch,
): { kind: PitchVerdictKind; heard: number } {
  const off = centsOff(targetMidi, played);
  const heard = Math.round(targetMidi + off / 100);
  const size = Math.abs(off);
  if (size <= SPOT_ON_CENTS) return { kind: 'spot-on', heard };
  if (size < MISS_CENTS) {
    if (size <= A_LITTLE_CENTS)
      return { kind: off < 0 ? 'a-little-flat' : 'a-little-sharp', heard };
    return { kind: off < 0 ? 'flat' : 'sharp', heard };
  }
  const apart = heard - targetMidi;
  return { kind: apart !== 0 && apart % 12 === 0 ? 'octave' : 'wrong', heard };
}
