// =============================================================================
// ALTAIR -- Simulation version
// =============================================================================
// A run is a pure function of (seed, setup, inputs) played through the sim, and the server proves a
// run by replaying its log through ITS copy of the sim. That only works while the browser that
// played the run and the server that replays it run the SAME rules.
//
// `SIM_VERSION` names those rules. BUMP IT in the same commit as anything that changes how a run
// plays out: balance numbers, enemy or boss behaviour, weapons, classes, spawn tables, anything the
// step reads. (Look-and-feel only changes do not bump it.)
//
// What a bump does: every log is stamped with the version it was played on. If a run was played on
// another version than the server's (a tab left open across a deploy, a run still in the
// verification queue when one lands) the server cannot replay it, and that is not the player's
// fault, so it is settled as `unverified` (the capped fallback payout, once) rather than `rejected`
// (no payout, and it looks like cheating in the logs). Logs recorded before this stamp existed have
// no `sim` field and are version 1.
//
// Ids are save data too: class, weapon, enemy and meta-upgrade ids live in players' saves, runs and
// leaderboards. Never delete or repurpose an id; change its name, art or numbers instead.
// =============================================================================

/**
 * History (newest last):
 *   1  the game as first stamped.
 *   2  Heat (difficulty tiers): heat > 0 changes enemy stats, spawn rate, boss health and payout.
 *      Heat 0 plays exactly as version 1; the bump is so a Heat run can never be replayed by a server
 *      that does not know Heat.
 *   3  Boss fights and spawn pacing: an arena seal when a boss spawns, a spawn bank bounded to ~3 s of
 *      spawning (it used to be unbounded while the screen sat at the enemy cap), a leaner Hollow King.
 */
export const SIM_VERSION: number = 3;

/** The version a log was played on; logs that predate the stamp are version 1. */
export function logSimVersion(log: { sim?: unknown }): number {
  return typeof log.sim === 'number' ? log.sim : 1;
}
