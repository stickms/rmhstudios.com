/**
 * difficultyConfig.ts
 * Linear difficulty scaling applied per wave/stage.
 * All increase values are added once per wave beyond wave 1.
 */

export interface DifficultyConfig {
    /** Extra HP added to regular enemies per wave */
    hpIncrease: number;
    /** Extra damage added to enemy projectiles per wave */
    damageIncrease: number;
    /** Extra enemies spawned in budget per wave (multiplicative on budget) */
    spawnBudgetPerWave: number;
    /** Extra projectile speed added per wave */
    projectileSpeedIncrease: number;
    /** Reduction in enemy dash charge time per wave (minimum 0.15) */
    dashChargeReduction: number;
    /** Boss HP flat bonus per tier (stacks on top of BOSS_HP_PER_TIER) */
    bossHpBonus: number;
    /** Extra boss attack speed per tier */
    bossAttackSpeedBonus: number;
}

export const difficultyPerStage: DifficultyConfig = {
    hpIncrease: 0.15,           // Regular enemy HP grows 0.15 per wave
    damageIncrease: 0.05,       // Damage per wave (applied as fractional stacking)
    spawnBudgetPerWave: 2,      // base budget = 3 + wave * 2 (already in game.ts)
    projectileSpeedIncrease: 4, // Projectile speed grows 4 units/wave
    dashChargeReduction: 0.008, // Dasher charge time shrinks 8ms/wave
    bossHpBonus: 5,             // Extra HP per boss tier
    bossAttackSpeedBonus: 0.05, // Boss fires 5% faster per tier
};

/**
 * Compute scaled enemy HP for a given wave.
 * Returns additional HP points beyond base.
 */
export function getScaledEnemyHp(baseHp: number, wave: number): number {
    if (wave <= 1) return baseHp;
    return baseHp + Math.floor((wave - 1) * difficultyPerStage.hpIncrease);
}

/**
 * Compute scaled projectile speed for a given wave.
 */
export function getScaledProjSpeed(baseSpeed: number, wave: number): number {
    if (wave <= 1) return baseSpeed;
    // Cap the speed bonus so late-game bullets stay dodgeable (difficulty comes
    // from bullet density/count, not unreadably fast projectiles).
    return baseSpeed + Math.min((wave - 1) * difficultyPerStage.projectileSpeedIncrease, 90);
}

/**
 * Compute scaled boss HP for a given tier.
 * Tier = wave / BOSS_WAVE_INTERVAL (integer).
 */
export function getScaledBossHp(baseHp: number, tier: number): number {
    return baseHp + tier * difficultyPerStage.bossHpBonus;
}

/**
 * Compute scaled boss attack interval (lower = faster).
 */
export function getScaledBossAttackInterval(baseInterval: number, tier: number): number {
    return Math.max(0.6, baseInterval - tier * difficultyPerStage.bossAttackSpeedBonus);
}

/**
 * Compute scaled enemy damage (fractional, use in projectile damage logic).
 */
export function getScaledEnemyDamage(baseDamage: number, wave: number): number {
    if (wave <= 6) return baseDamage;
    // Bullets do more over time but are CAPPED at +2 — the late game must remain
    // survivable (you dodge dense curtains, you don't get one-shot). Difficulty
    // comes from bullet count/patterns, not escalating per-hit damage.
    return baseDamage + Math.min(2, Math.floor((wave - 6) / 6));
}
