/**
 * Massive March — the body language.
 *
 * The arms are a communication interface (§7), not decoration. Everything here
 * exists because there is a moment in the game where words are unavailable and
 * this is what is left: behind soundproof glass, at four hundred metres, or
 * standing next to somebody wearing a bucket.
 *
 * The set is small on purpose. Eight unambiguous signals that a group can assign
 * its own meanings to beat forty precise ones nobody can remember — "two waves
 * means stop" is a convention a group invents in ten seconds and uses for the
 * rest of the campaign (§8.3).
 *
 * Encoded as an index because it rides in the fifteen-times-a-second tick.
 */

export const GESTURES = [
  'none',
  /** Aimed with the camera — the single most used signal in the game. */
  'point',
  'wave',
  /** Yes. */
  'nod',
  /** No. */
  'shake',
  'cheer',
  'shrug',
  /** Come here. */
  'beckon',
] as const;

export type Gesture = (typeof GESTURES)[number];

export function gestureIndex(gesture: Gesture): number {
  const index = GESTURES.indexOf(gesture);
  return index < 0 ? 0 : index;
}

export function gestureAt(index: number): Gesture {
  return GESTURES[index] ?? 'none';
}

/** How long a gesture plays before the avatar drops back to idle. */
export const GESTURE_MS: Record<Gesture, number> = {
  none: 0,
  point: 2600,
  wave: 1900,
  nod: 1300,
  shake: 1300,
  cheer: 2200,
  shrug: 1600,
  beckon: 1800,
};

/** Keys 1–7 fire these in order; the wheel shows them in the same order. */
export const GESTURE_WHEEL: readonly Gesture[] = [
  'point',
  'wave',
  'nod',
  'shake',
  'beckon',
  'shrug',
  'cheer',
];
