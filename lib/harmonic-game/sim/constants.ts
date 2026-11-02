/**
 * Harmonic simulation tunables (plan H1). Every number the combat code uses is named here;
 * later work packages add their own sections (cold H1.2, weapons H1.3 in `weapon-table.ts`).
 * Units: Source inches, seconds.
 */

/** The debug "pulse" the player fires before H1.3 lands real weapons. */
export const DEBUG_PULSE_DAMAGE = 12;
export const DEBUG_PULSE_RANGE = 4096;
/** Seconds between debug pulses while attack is held. */
export const DEBUG_PULSE_INTERVAL = 0.25;

/** Melee: a short hull sweep from the eye. */
export const MELEE_RANGE = 64;
/** Half-extent of the melee sweep hull. */
export const MELEE_HULL_RADIUS = 6;
export const MELEE_DAMAGE = 25;

/** `harmonic_target` defaults. */
export const TARGET_DEFAULT_HEALTH = 40;
export const TARGET_HULL_HALF_WIDTH = 16;
export const TARGET_HULL_HEIGHT = 64;

/** Impulse scale given to `DamageInfo.force` (ragdolls and effects read it). */
export const HIT_FORCE_SCALE = 60;
