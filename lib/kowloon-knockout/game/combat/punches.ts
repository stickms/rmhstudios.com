// ============================================================
// Punch Definitions — Jab, Cross, Hook, Uppercut
// ============================================================

import { PunchDef, PunchType } from '../fighters/types';

export const PUNCH_DEFS: Record<PunchType, PunchDef> = {
    jab: {
        type: 'jab',
        baseDamage: 5,
        speed: 8,       // fastest
        range: 48,      // longest reach — quick straight punch
        staminaCost: 5,
        knockback: 2,
        stunFrames: 4,
    },
    cross: {
        type: 'cross',
        baseDamage: 10,
        speed: 14,
        range: 45,      // rear hand extension, slightly shorter than jab
        staminaCost: 10,
        knockback: 5,
        stunFrames: 8,
    },
    hook: {
        type: 'hook',
        baseDamage: 15,
        speed: 20,
        range: 42,      // wide arc, needs to be closer
        staminaCost: 15,
        knockback: 8,
        stunFrames: 12,
    },
    uppercut: {
        type: 'uppercut',
        baseDamage: 18,
        speed: 28,      // slowest
        range: 40,      // shortest range — need to be very close
        staminaCost: 25,
        knockback: 10,
        stunFrames: 14,
    },
};

/** Bonus multiplier for landing heavy punches (hook/uppercut) */
export const HEAVY_PUNCH_BONUS: Partial<Record<PunchType, { multiplier: number; displayName: string }>> = {
    hook: { multiplier: 1.15, displayName: 'HEAVY HOOK!' },
    uppercut: { multiplier: 1.15, displayName: 'CRUSHING UPPERCUT!' },
};

/**
 * Calculate actual damage given fighter power stat and optional combo multiplier
 */
export function calculateDamage(
    punch: PunchDef,
    attackerPower: number,
    defenderDefense: number,
    comboMultiplier: number = 1.0,
    isBlocking: boolean = false,
): number {
    const rawDamage = punch.baseDamage * attackerPower * comboMultiplier;
    const blockReduction = isBlocking ? 0.25 : 1.0;
    const defenseReduction = 1 / defenderDefense;
    return Math.max(1, Math.floor(rawDamage * blockReduction * defenseReduction));
}

/**
 * Calculate actual punch speed (in frames) given fighter stats.
 * Both punchSpeed and moveSpeed contribute — faster fighters strike faster.
 */
export function calculatePunchSpeed(punch: PunchDef, punchSpeedStat: number, moveSpeed?: number): number {
    // moveSpeed contributes a 20% bonus to strike speed (baseline moveSpeed ~2.0)
    const moveSpeedBonus = moveSpeed ? 1 + (moveSpeed - 2.0) * 0.2 : 1;
    const effectiveSpeed = punchSpeedStat * moveSpeedBonus;
    return Math.max(4, Math.floor(punch.speed / effectiveSpeed));
}
