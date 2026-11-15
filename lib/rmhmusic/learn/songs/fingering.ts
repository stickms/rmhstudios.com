/**
 * Where a guitarist plays a melody note, for the tab staff — pure.
 *
 * The rule is the lowest fret. In standard tuning two strings reach the same pitch at frets five
 * apart (four between G and B), so in the first frets the lowest fret is the one in OPEN POSITION
 * (frets 0–4), where a beginner's melodies live: B3 is the open B string, not the G string at the
 * 4th fret; A3 is the G string at the 2nd. A note above open position (A4 and up on the high E
 * string) takes its lowest fret too, which keeps the hand as low as it can go. A note below the
 * low E, past the last fret, or not a whole semitone has no fingering.
 */
import { MAX_FRET, positionsOf, type FretPosition } from '../theory/fretboard';

export function fingerFor(sounding: number): FretPosition | null {
  let best: FretPosition | null = null;
  for (const p of positionsOf(sounding, MAX_FRET)) if (!best || p.fret < best.fret) best = p;
  return best;
}
