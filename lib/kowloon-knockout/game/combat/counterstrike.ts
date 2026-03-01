// ============================================================
// Counter-Strike System — Punishes punch spamming
// ============================================================

import { Fighter } from '../fighters/types';

const SPAM_WINDOW_MS = 3000;
const SPAM_THRESHOLD = 5;
const COUNTER_MULT_PER_PUNCH = 0.15;
const COUNTER_MULT_MAX = 1.6;

/**
 * Calculate counter-strike multiplier based on how aggressively
 * the target has been throwing punches. If the target is spamming,
 * the attacker gets bonus damage against them.
 */
export function getCounterStrikeMultiplier(target: Fighter): {
    multiplier: number;
    isCounterStrike: boolean;
} {
    const now = Date.now();
    const recentPunches = target.comboHistory.filter(
        h => now - h.time <= SPAM_WINDOW_MS,
    );

    if (recentPunches.length <= SPAM_THRESHOLD) {
        return { multiplier: 1.0, isCounterStrike: false };
    }

    const excess = recentPunches.length - SPAM_THRESHOLD;
    const multiplier = Math.min(
        COUNTER_MULT_MAX,
        1.0 + excess * COUNTER_MULT_PER_PUNCH,
    );

    return { multiplier, isCounterStrike: true };
}

export const COUNTER_STRIKE_DISPLAY = 'COUNTER!';
