/**
 * Daily coin wheel (#17). A free once-per-UTC-day spin awarding coins.
 * Segments and weights are authoritative server-side; the client only
 * animates to the index the server returns, so the reward can't be gamed.
 */

export interface WheelSegment {
  /** Coin reward for landing here. */
  reward: number;
  /** Relative weight (higher = more likely). */
  weight: number;
}

// Order matters: the client renders segments clockwise in this order.
export const WHEEL_SEGMENTS: WheelSegment[] = [
  { reward: 5, weight: 28 },
  { reward: 10, weight: 24 },
  { reward: 15, weight: 16 },
  { reward: 25, weight: 12 },
  { reward: 40, weight: 9 },
  { reward: 60, weight: 6 },
  { reward: 100, weight: 4 },
  { reward: 250, weight: 1 },
];

/** Pick a winning segment index using the weighted distribution. */
export function pickSegment(rng: () => number = Math.random): number {
  const total = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
  let roll = rng() * total;
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    roll -= WHEEL_SEGMENTS[i].weight;
    if (roll < 0) return i;
  }
  return WHEEL_SEGMENTS.length - 1;
}

export function wheelDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}
