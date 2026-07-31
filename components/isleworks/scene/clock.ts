/**
 * Isleworks — the world clock.
 *
 * A single mutable object outside React. Every animated thing in the scene reads
 * `world.time` (seconds since the scene mounted) and `world.daylight` (0 at
 * midnight, 1 at noon) from inside `useFrame`, where a React re-render would be
 * a bug rather than a cost.
 *
 * `GameClock` (the component that owns the advance loop) is the only writer.
 */

export const world = {
  /** Seconds since mount, scaled by nothing — real time, for idle motion. */
  time: 0,
  /** 0…1 through the current in-game month. */
  monthProgress: 0,
  /** 0 = deep night, 1 = midday. Derived from `monthProgress`. */
  daylight: 1,
  /** True while the lamps should be on. */
  night: false,
};

/**
 * Daylight curve.
 *
 * A month is one day/night cycle. The curve spends most of its length in
 * daylight and dips briefly — the city is meant to be *readable*, and a game
 * that is dark half the time is a game you cannot see. Night is roughly the last
 * fifth of the month, eased in and out so the lamps fade rather than snap.
 */
export function daylightFor(progress: number): number {
  const t = ((progress % 1) + 1) % 1;
  // Roughly: daylight until 0.62, dusk to 0.74, night to 0.90, dawn to 0.99.
  // Night is a sixth of the month — long enough that the streetlights coming on
  // is an event you notice, short enough that the city is legible almost always.
  if (t < 0.62) return 1;
  if (t < 0.74) return 1 - (t - 0.62) / 0.12;
  if (t < 0.9) return 0;
  if (t < 0.99) return (t - 0.9) / 0.09;
  return 1;
}
