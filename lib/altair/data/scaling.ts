// =============================================================================
// ALTAIR -- Difficulty Scaling Functions (GDD Section 13)
// =============================================================================
// All enemies receive stat scaling based on elapsed time to maintain challenge
// against the player's growing power.
// =============================================================================

/**
 * HP scaling formula.
 * Scales quadratically -- enemies become significantly tougher over time.
 *
 * @param timeMinutes - elapsed game time in minutes
 * @returns multiplier to apply to base HP
 *
 * Examples:
 *   0:00 -> 1.00x
 *   5:00 -> 1.80x
 *  10:00 -> 3.00x
 *  15:00 -> 4.60x
 *  20:00 -> 6.60x
 */
export function getHPScale(timeMinutes: number): number {
  return 1 + timeMinutes * 0.12 + timeMinutes * timeMinutes * 0.008;
}

/**
 * Damage scaling formula.
 * Scales linearly and more slowly than HP to prevent one-shot deaths.
 *
 * @param timeMinutes - elapsed game time in minutes
 * @returns multiplier to apply to base damage
 *
 * Examples:
 *   0:00 -> 1.00x
 *   5:00 -> 1.30x
 *  10:00 -> 1.60x
 *  15:00 -> 1.90x
 *  20:00 -> 2.20x
 */
export function getDamageScale(timeMinutes: number): number {
  return 1 + timeMinutes * 0.06;
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
 *  10:00 -> 1.15x
 *  20:00 -> 1.30x
 */
export function getSpeedScale(timeMinutes: number): number {
  return 1 + timeMinutes * 0.015;
}

/**
 * XP gem value scaling formula.
 * Ensures the player can keep leveling at a reasonable pace as enemies become harder.
 *
 * @param timeMinutes - elapsed game time in minutes
 * @returns multiplier to apply to base XP drop value
 *
 * Examples:
 *   0:00 -> 1.00x
 *  10:00 -> 1.50x
 *  20:00 -> 2.00x
 */
export function getXPScale(timeMinutes: number): number {
  return 1 + timeMinutes * 0.05;
}

/**
 * Spawn budget per second for the Wave Director.
 * Determines how many "threat points" of enemies can spawn each second.
 *
 * @param timeMinutes - elapsed game time in minutes
 * @returns threat points budget per second
 *
 * Examples:
 *   0:00 ->  2.0
 *   2:00 ->  5.6
 *   5:00 -> 13.3
 *   8:00 -> 23.6
 *  10:00 -> 32.0
 *  12:00 -> 42.0
 *  15:00 -> 58.3
 *  18:00 -> 78.0
 *  20:00 -> 92.0
 */
export function getSpawnBudget(timeMinutes: number): number {
  return 2 + timeMinutes * 1.5 + timeMinutes * timeMinutes * 0.15;
}
