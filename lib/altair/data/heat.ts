// =============================================================================
// ALTAIR -- Heat (difficulty tiers)
// =============================================================================
// Heat is the long-term loop: after a victory the station runs hotter and pays better. A run is
// played at one Heat level, chosen before it starts. Heat 0 is the game as it always was, and every
// modifier at Heat 0 is EXACTLY 1, so a run at Heat 0 replays bit-for-bit as it did before Heat
// existed (multiplying a float by 1 changes nothing).
//
// How a tier is earned: clearing Heat N (a verified victory) unlocks Heat N+1. The server derives
// this from its own ledger of verified victories (lib/altair/solo/heat.server.ts), never from a
// number the browser sends. The chosen level rides inside the loadout the server issues and the log
// carries, so replay verification uses the same Heat the run was issued at.
//
// What a tier does (all pure arithmetic over the tier number, tuned with scripts/altair/balance):
//   hp      enemy health        +10% per tier
//   damage  enemy damage        +5% per tier
//   speed   enemy move speed    +1% per tier (the player cannot outrun a fast horde, so it stays gentle)
//   spawn   spawn budget        +4% per tier (the 200-enemy cap still bounds the horde: this speeds
//                               how fast a killed enemy is replaced, it does not raise the cap)
//   bossHp  boss health         +12% per tier
//   payout  coins paid          +12% per tier, so pushing harder is paid for
// =============================================================================

/** The highest tier. Tier N+1 is unlocked by clearing tier N, so reaching this takes MAX_HEAT clears. */
export const HEAT_MAX = 20;

export interface HeatModifiers {
  hp: number;
  damage: number;
  speed: number;
  spawn: number;
  bossHp: number;
  payout: number;
}

/** A tier as a whole number in 0..HEAT_MAX; anything else (NaN, fractions, out of range) is clamped. */
export function clampHeat(heat: unknown): number {
  if (typeof heat !== 'number' || !Number.isFinite(heat)) return 0;
  return Math.max(0, Math.min(HEAT_MAX, Math.trunc(heat)));
}

export function heatModifiers(heat: number): HeatModifiers {
  const h = clampHeat(heat);
  return {
    hp: 1 + 0.1 * h,
    damage: 1 + 0.05 * h,
    speed: 1 + 0.01 * h,
    spawn: 1 + 0.04 * h,
    bossHp: 1 + 0.12 * h,
    payout: 1 + 0.12 * h,
  };
}

/**
 * The highest tier an account may start, given the tiers of its verified victories. Clearing tier N
 * unlocks N+1; with no victories only tier 0 is open.
 */
export function unlockedHeat(clearedTiers: readonly number[]): number {
  let best = -1;
  for (const t of clearedTiers) {
    const c = clampHeat(t);
    if (c > best) best = c;
  }
  return Math.min(HEAT_MAX, best + 1);
}
