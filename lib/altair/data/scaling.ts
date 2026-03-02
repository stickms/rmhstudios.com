// =============================================================================
// ALTAIR -- Difficulty Scaling Functions (GDD Section 13)
// =============================================================================
// All enemies receive stat scaling based on elapsed time to maintain challenge
// against the player's growing power.
// =============================================================================

/**
 * HP scaling formula.
 * Scales with quadratic + cubic component -- enemies become significantly tougher over time.
 *
 * @param timeMinutes - elapsed game time in minutes
 * @returns multiplier to apply to base HP
 *
 * Examples:
 *   0:00 ->  1.00x
 *   5:00 ->  2.15x
 *  10:00 ->  4.50x
 *  15:00 ->  8.35x
 *  20:00 -> 14.56x
 */
export function getHPScale(timeMinutes: number): number {
  return 1 + timeMinutes * 0.15 + timeMinutes * timeMinutes * 0.014 + timeMinutes * timeMinutes * timeMinutes * 0.0004;
}

/**
 * Damage scaling formula.
 * Scales linearly with small quadratic component to prevent one-shot deaths.
 *
 * @param timeMinutes - elapsed game time in minutes
 * @returns multiplier to apply to base damage
 *
 * Examples:
 *   0:00 -> 1.00x
 *   5:00 -> 1.43x
 *  10:00 -> 1.90x
 *  15:00 -> 2.43x
 *  20:00 -> 3.00x
 */
export function getDamageScale(timeMinutes: number): number {
  return 1 + timeMinutes * 0.08 + timeMinutes * timeMinutes * 0.001;
}

/**
 * Speed scaling formula.
 * Scales gently -- challenge comes from enemy variety and density, not speed alone.
 *
 * @param timeMinutes - elapsed game time in minutes
 * @returns multiplier to apply to base speed
 *
 * Examples:
 *   0:00 -> 1.00x
 *  10:00 -> 1.25x
 *  15:00 -> 1.41x
 *  20:00 -> 1.60x
 */
export function getSpeedScale(timeMinutes: number): number {
  return 1 + timeMinutes * 0.02 + timeMinutes * timeMinutes * 0.0005;
}

/**
 * REMOVED in v1.1 — XP gems give flat values, no time-based multiplier.
 *
 * @param timeMinutes - elapsed game time in minutes
 * @returns always 1
 */
export function getXPScale(timeMinutes: number): number {
  return 1;
}

/**
 * Spawn budget per second for the Wave Director.
 * Determines how many "threat points" of enemies can spawn each second.
 *
 * @param timeMinutes - elapsed game time in minutes
 * @returns threat points budget per second
 *
 * Examples:
 *   0:00 ->   3.0
 *   2:00 ->   8.1
 *   5:00 ->  19.9
 *   8:00 ->  35.8
 *  10:00 ->  48.5
 *  12:00 ->  65.6
 *  15:00 -> 100.9
 *  18:00 -> 145.0
 *  20:00 -> 178.0
 */
export function getSpawnBudget(timeMinutes: number): number {
  return 3 + timeMinutes * 2.0 + timeMinutes * timeMinutes * 0.25 + timeMinutes * timeMinutes * timeMinutes * 0.005;
}
