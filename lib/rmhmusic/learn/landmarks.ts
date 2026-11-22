/**
 * Landmark notes — reading from an anchor — pure.
 *
 * A beginner who reads every note by counting up from the bottom line is slow; one who knows a few
 * anchors and counts from the nearest is not. Each clef has four: the treble's G on its second line
 * (where the clef curls), middle C on the ledger line below, the C in the third space and the F on
 * the top line; the bass's G on its bottom line, the C in the second space, the F on its fourth line
 * (between the clef's two dots) and middle C on the ledger line above. After a wrong answer the
 * flashcards say where the RIGHT note sits from the nearest anchor ("one step above the treble G").
 *
 * Positions are staff steps (`clefStep`): a line to the next space is one step. A card is measured by
 * the natural it is written on, so a B♭ counts from B.
 */
import { clefStep, type Clef } from './theory/clef';

export type LandmarkId =
  'treble-middle-c' | 'treble-g' | 'treble-c' | 'treble-f' | 'bass-g' | 'bass-c' | 'bass-f' | 'bass-middle-c';

export interface Landmark {
  id: LandmarkId;
  clef: Clef;
  /** The natural note it is (MIDI). */
  midi: number;
}

/** Each clef's anchors, lowest first (a tie between two goes to the lower). */
export const LANDMARKS: Readonly<Record<Clef, readonly Landmark[]>> = {
  treble: [
    { id: 'treble-middle-c', clef: 'treble', midi: 60 },
    { id: 'treble-g', clef: 'treble', midi: 67 },
    { id: 'treble-c', clef: 'treble', midi: 72 },
    { id: 'treble-f', clef: 'treble', midi: 77 },
  ],
  bass: [
    { id: 'bass-g', clef: 'bass', midi: 43 },
    { id: 'bass-c', clef: 'bass', midi: 48 },
    { id: 'bass-f', clef: 'bass', midi: 53 },
    { id: 'bass-middle-c', clef: 'bass', midi: 60 },
  ],
};

export interface LandmarkHint {
  landmark: Landmark;
  /** The note is on the anchor, above it or below it. */
  direction: 'on' | 'above' | 'below';
  /** How many staff steps from the anchor (0 when `on`). */
  steps: number;
}

/**
 * The anchor nearest a written natural on `clef`, and the note's place from it. A note far from every
 * anchor (high ledger lines) still gets the nearest one, with a larger count.
 */
export function landmarkHint(clef: Clef, written: number): LandmarkHint {
  const step = clefStep(clef, written);
  const anchors = LANDMARKS[clef];
  let best = anchors[0]!;
  let bestDistance = Math.abs(step - clefStep(clef, best.midi));
  for (const a of anchors) {
    const d = Math.abs(step - clefStep(clef, a.midi));
    if (d < bestDistance) {
      best = a;
      bestDistance = d;
    }
  }
  const diff = step - clefStep(clef, best.midi);
  return { landmark: best, direction: diff === 0 ? 'on' : diff > 0 ? 'above' : 'below', steps: Math.abs(diff) };
}
