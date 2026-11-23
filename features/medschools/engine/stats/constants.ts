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
/** Times in the curve are whole weeks (R13): a step never reveals a day. */
export const KM_BIN_DAYS = 7;
/** Fewer members at risk than this at a week and the curve says nothing about it (R13). */
export const KM_MIN_AT_RISK = 10;
/** A curve exists only with at least this many invite events, on top of the member floor (R13). */
export const KM_MIN_INVITES = 10;
/** A stored curve is replaced only when invites or members moved by at least this many (R13, delta k-anonymity). */
export const KM_REFRESH_DELTA = 3;
/**
 * Hysteresis (R13): a curve is CREATED only at this many members and this many invites, one refresh delta above the
 * floors that delete it. Without the margin a row deleted at 19 members and recreated at 20 is a new figure differing by
 * one member, which is exactly the differencing the refresh delta exists to stop.
 */
export const KM_CREATE_MEMBERS = KM_MIN_MEMBERS + KM_REFRESH_DELTA;
export const KM_CREATE_INVITES = KM_MIN_INVITES + KM_REFRESH_DELTA;
/** The shown chance is rounded to the nearest multiple of this many percent (R13). */
export const CHANCE_STEP_PERCENT = 5;
export const CHANCE_HORIZONS = [7, 14, 30, 60] as const;

/**
 * Secondary turnaround (received -> submitted), owner 2026-11-23. A figure exists only when at least this many DISTINCT
 * members who share contribute a valid pair of dates for a school x program (a member with two cycles counts once).
 */
export const TURNAROUND_MIN_MEMBERS = 20;
/** A stored figure is replaced only when the member count moved by at least this many (delta k-anonymity, as R13). */
export const TURNAROUND_REFRESH_DELTA = 3;
/** A figure is CREATED only at this many members (the floor plus one refresh delta); it is deleted below the floor. Hysteresis, as `KM_CREATE_MEMBERS`. */
export const TURNAROUND_CREATE_MEMBERS = TURNAROUND_MIN_MEMBERS + TURNAROUND_REFRESH_DELTA;
/** A pair further apart than this is a typo or a different thing (a deferred secondary); it neither counts nor feeds the floor. */
export const TURNAROUND_MAX_DAYS = 120;
