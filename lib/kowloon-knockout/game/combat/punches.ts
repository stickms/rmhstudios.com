// ============================================================
// Punch Definitions — Jab, Cross, Hook, Uppercut
// ============================================================

import { PunchDef, PunchType } from '../fighters/types';

export const PUNCH_DEFS: Record<PunchType, PunchDef> = {
    jab: {
        type: 'jab',
        baseDamage: 4,
        speed: 8,       // fastest
        range: 48,      // longest reach — quick straight punch
        staminaCost: 5,
        knockback: 2,
        stunFrames: 4,
    },
    cross: {
        type: 'cross',
        baseDamage: 7,
        speed: 14,
        range: 45,      // rear hand extension, slightly shorter than jab
        staminaCost: 10,
        knockback: 5,
        stunFrames: 8,
    },
    hook: {
        type: 'hook',
        baseDamage: 9,
        speed: 15,
        range: 42,      // wide arc, needs to be closer
        staminaCost: 15,
        knockback: 8,
        stunFrames: 12,
    },
    uppercut: {
        type: 'uppercut',
        baseDamage: 11,
        speed: 20,      // slowest
        range: 40,      // shortest range — need to be very close
        staminaCost: 25,
        knockback: 10,
        stunFrames: 14,
    },
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

/** Stale move decay — repeated same punch type does diminishing damage */
const STALE_MOVE_DECAY = [1.0, 0.85, 0.72, 0.60];

/**
 * Calculate stale move multiplier. Counts how many times the same punch type
 * appears consecutively at the end of comboHistory.
 */
export function getStaleMoveMultiplier(
    comboHistory: { type: PunchType; time: number }[],
    currentPunchType: PunchType,
): number {
    let count = 0;
    for (let i = comboHistory.length - 1; i >= 0; i--) {
        if (comboHistory[i].type === currentPunchType) count++;
        else break;
    }
    const idx = Math.min(count, STALE_MOVE_DECAY.length - 1);
    return STALE_MOVE_DECAY[idx];
}

/** Total frames a fighter is committed to a punch (locked out of new actions)
 *  at the sim's 60Hz step. The animation plays across this whole window, so the
 *  fighter reads as committed and can't spam. Tunable; preserves the
 *  jab<cross<hook<uppercut speed ordering. */
export const PUNCH_COMMIT_FRAMES: Record<PunchType, number> = {
    jab: 28, cross: 31, hook: 34, uppercut: 37,
};

/** The single frame a punch becomes active (connects). Kept early in the commit
 *  window so hits stay snappy — only the recovery/lock is extended. */
export function punchHitFrame(punch: PunchType): number {
    return Math.floor(PUNCH_COMMIT_FRAMES[punch] * 0.25);
}
