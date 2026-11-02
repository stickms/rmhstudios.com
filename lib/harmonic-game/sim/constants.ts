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

// ─── Cold and shelters (H1.2, sim/cold.ts) ──────────────────────────────────────────────────

/** The exposure meter's full value (a warm player). */
export const COLD_MAX = 100;
/** Meter points lost per second outdoors (empty in 40 s). */
export const COLD_DRAIN_OUTDOOR = 2.5;
/** Outdoor drain multiplier inside a `wind` volume (empty in ~13 s). */
export const COLD_WIND_MULTIPLIER = 3;
/** Meter points regained per second in a shelter. */
export const COLD_REFILL_SHELTER = 10;
/** Extra points per second, at the heater itself; it falls off linearly to 0 at the heater's radius. */
export const COLD_HEATER_REFILL = 25;
/** Default `harmonic_heater` radius (Source inches). */
export const COLD_HEATER_RADIUS = 192;
/** Height above the player's feet that is measured against a heater (the torso). */
export const COLD_PLAYER_CENTER_Z = 36;
/** At zero, the player takes this much cold damage ... */
export const COLD_DAMAGE = 2;
/** ... every this many seconds. */
export const COLD_DAMAGE_INTERVAL = 1;
/** Frost starts to creep in below this fraction of the meter and reaches 1 at empty. */
export const COLD_FROST_START = 0.6;
/** Below this fraction (and outside a shelter) the HUD hint says to find shelter. */
export const COLD_HINT_FRACTION = 0.4;
