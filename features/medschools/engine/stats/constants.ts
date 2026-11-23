/** Tunables of the statistics engine (phase 5, D3-D10). Pure; nothing here reads a database. */
export const MODEL_VERSION = 1;
export const DRAWS = 600;
/** Weighted mean share below this: EARLY mode (spec §10). */
export const EARLY_SHARE = 0.05;
/** A history cycle with less than this share at asOf gives no implied total. */
export const IMPLIED_MIN_SHARE = 0.02;
/** A history cycle whose season total is below this is not usable. */
export const MIN_HISTORY_TOTAL = 10;
export const MAX_HISTORY = 4;
export const RECENCY_RATIO = 0.5;
/** EARLY mode widens p10 and p90 around the median by this factor. */
export const EARLY_WIDEN = 1.5;
export const WAVE_FACTOR = 3;
export const WAVE_WINDOW = 14;
export const WAVE_MIN_COUNT = 5;
export const WAVE_MIN_HISTORY = 7;
/** A wait curve exists only when at least this many DISTINCT members contribute (D6). */
export const KM_MIN_MEMBERS = 20;
export const KM_MAX_DAY = 180;
export const KM_MIN_SURVIVAL = 0.02;
export const CHANCE_HORIZONS = [7, 14, 30, 60] as const;
