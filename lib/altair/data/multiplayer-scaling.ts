// =============================================================================
// ALTAIR DATA -- Multiplayer Scaling Constants
// =============================================================================
// All difficulty scaling formulas and constants for multiplayer mode.
// Derived from the Multiplayer Integration Document §4, §9, §10.
// =============================================================================

/**
 * Enemy HP multiplier: 1 + (n-1) × 0.55
 * 1-player: 1.00×, 2: 1.55×, 3: 2.10×, 4: 2.65×
 */
export function getEnemyHpMultiplier(playerCount: number): number {
  return 1 + (playerCount - 1) * 0.55;
}

/**
 * Enemy damage multiplier: 1 + (n-1) × 0.10
 * 1-player: 1.00×, 2: 1.10×, 3: 1.20×, 4: 1.30×
 */
export function getEnemyDamageMultiplier(playerCount: number): number {
  return 1 + (playerCount - 1) * 0.10;
}

/**
 * Wave Director spawn budget multiplier: 1 + (n-1) × 0.50
 * 1-player: 1.00×, 2: 1.50×, 3: 2.00×, 4: 2.50×
 */
export function getSpawnBudgetMultiplier(playerCount: number): number {
  return 1 + (playerCount - 1) * 0.50;
}

/**
 * Boss HP multiplier (steeper than regular enemies): 1 + (n-1) × 0.70
 * 1-player: 1.00×, 2: 1.70×, 3: 2.40×, 4: 3.10×
 */
export function getBossHpMultiplier(playerCount: number): number {
  return 1 + (playerCount - 1) * 0.70;
}

/**
 * Max enemies on screen per player count.
 */
const MAX_ENEMIES_BY_COUNT: Record<number, number> = {
  1: 450,
  2: 550,
  3: 650,
  4: 750,
};

export function getMaxEnemies(playerCount: number): number {
  return MAX_ENEMIES_BY_COUNT[Math.min(4, Math.max(1, playerCount))] ?? 300;
}

/**
 * Coin drop rate per player count (percentage).
 */
const COIN_DROP_RATE_BY_COUNT: Record<number, number> = {
  1: 0.03,
  2: 0.025,
  3: 0.022,
  4: 0.02,
};

export function getCoinDropRate(playerCount: number): number {
  return COIN_DROP_RATE_BY_COUNT[Math.min(4, Math.max(1, playerCount))] ?? 0.03;
}

/** Duration for scaling to decrease when a player leaves/dies. */
export const SCALING_DECREASE_DURATION = 15; // seconds

/** Duration for scaling to increase when a player joins/revives. */
export const SCALING_INCREASE_DURATION = 10; // seconds

/** Revival constants. */
export const REVIVAL = {
  DOWN_TIMER: 15, // seconds until permanent death
  DOWN_TIMER_DOUBLE_TIME: 7.5, // halved in double time
  CHANNEL_RANGE: 80, // px proximity required
  CHANNEL_DURATION: 3, // real-time seconds to fill
  RESTORE_HP_PERCENT: 0.40, // restored to 40% max HP
  INVULN_DURATION: 2, // seconds of invulnerability after revival
  HEROIC_RESCUE_MIGHT: 0.10, // +10% Might buff for reviver
  HEROIC_RESCUE_DURATION: 15, // buff duration in seconds
} as const;

/** XP trickle for distant players: 0.5 × avgTeamLevel per second. */
export const XP_TRICKLE_RATE = 0.5;

/** AFK detection thresholds. */
export const AFK = {
  FLAG_TIME: 30, // seconds of no input → flagged
  DISCONNECT_TIME: 60, // seconds of no input → auto-kick
} as const;

/** Drop-in constants. */
export const DROP_IN = {
  INVULN_DURATION: 3, // seconds of invulnerability
  LEVEL_OFFSET: 2, // join at avg team level - 2 (min 1)
} as const;

/** Spectator coin rate (50% survival coins). */
export const SPECTATOR_SURVIVAL_COIN_INTERVAL = 30; // 1 coin per 30s instead of 15s

/** Boss leash range — teleports to nearest player if all players beyond this. */
export const BOSS_LEASH_RANGE = 2000;

/** Per-boss multiplayer adjustments data. */
export const BOSS_MULTIPLAYER_CONFIG = {
  hollow_king: {
    shamblerCountMultiplier: 8, // per player count
    deathMarchTargeting: 'farthest' as const,
    boneSpikesPerPlayer: true,
  },
  crimson_countess: {
    bloodLanceTargeting: 'round_robin' as const,
    bloodRainPositions: 2,
    shieldRegenBase: 10, // × player count HP/s in phase 1
    shieldRegenPhase2: 20, // × player count HP/s in phase 2
    furyTargeting: 'random' as const,
  },
  elder_lich: {
    phylacteryHpBase: 200, // × player count
    soulBarragePerPlayer: 3, // orbs per player per volley
    massResurrectBase: 15, // × player count
    gravityWellTargeting: 'rotate' as const,
  },
  terminus: {
    consumePullForceBase: 120, // ÷ sqrt(playerCount)
    voidZonesBase: 3, // × player count (max 12)
    tendrilBase: 4, // + player count tendrils
    deathSpiralTargeting: 'centroid' as const,
    amalgamationIntervalBase: 8, // ÷ player count (min 2)
  },
} as const;

/**
 * Boss DPS cap scaling for multiplayer (v1.1).
 * formula: base_cap × (1 + (n-1) × 0.60)
 */
export function getBossDpsCapMultiplier(playerCount: number): number {
  return 1 + (playerCount - 1) * 0.60;
}
