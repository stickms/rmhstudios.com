// ============================================================
// Combo Detection System
// ============================================================

import { ComboDef, FighterClass, PunchType } from '../fighters/types';

export const COMBO_WINDOW_MS = 800; // max time between punches to count as combo

export const COMBO_DEFS: ComboDef[] = [
    // ── Universal Combos ──────────────────────────────────────

    // 2-hit combos
    {
        name: 'one-two',
        sequence: ['jab', 'cross'],
        bonusDamageMultiplier: 1.35,
        bonusStun: 4,
        displayName: 'ONE-TWO!',
    },
    // 3-hit combos
    {
        name: 'classic-triple',
        sequence: ['jab', 'cross', 'hook'],
        bonusDamageMultiplier: 1.65,
        bonusStun: 8,
        displayName: 'CLASSIC TRIPLE!',
    },
    {
        name: 'body-breaker',
        sequence: ['jab', 'jab', 'uppercut'],
        bonusDamageMultiplier: 1.60,
        bonusStun: 10,
        displayName: 'BODY BREAKER!',
    },
    {
        name: 'speedster',
        sequence: ['jab', 'jab', 'cross'],
        bonusDamageMultiplier: 1.50,
        bonusStun: 6,
        displayName: 'SPEEDSTER!',
    },
    {
        name: 'haymaker-setup',
        sequence: ['cross', 'hook', 'uppercut'],
        bonusDamageMultiplier: 1.90,
        bonusStun: 14,
        displayName: 'HAYMAKER!',
    },
    // 4-hit combo — hardest to land
    {
        name: 'fury-combo',
        sequence: ['jab', 'cross', 'hook', 'uppercut'],
        bonusDamageMultiplier: 2.20,
        bonusStun: 20,
        displayName: '★ FURY COMBO! ★',
    },

    // ── Fighter-Specific Combos ───────────────────────────────

    // Stone Tiger — IRON CLAW: slow devastating hook chain
    {
        name: 'iron-claw',
        sequence: ['hook', 'hook', 'uppercut'],
        bonusDamageMultiplier: 1.75,
        bonusStun: 16,
        displayName: '★ IRON CLAW! ★',
        classRestriction: 'stone_tiger',
    },
    // Red Phoenix — PHOENIX STRIKE: fast entry into devastating finish
    {
        name: 'phoenix-strike',
        sequence: ['jab', 'cross', 'cross', 'uppercut'],
        bonusDamageMultiplier: 2.00,
        bonusStun: 18,
        displayName: '★ PHOENIX STRIKE! ★',
        classRestriction: 'red_phoenix',
    },
    // Jade Dragon — DRAGON RISING: versatile 4-hit chain
    {
        name: 'dragon-rising',
        sequence: ['cross', 'jab', 'hook', 'uppercut'],
        bonusDamageMultiplier: 1.80,
        bonusStun: 14,
        displayName: '★ DRAGON RISING! ★',
        classRestriction: 'jade_dragon',
    },
    // Silver Viper — FANG FLURRY: fast 4-hit jab-focused chain
    {
        name: 'fang-flurry',
        sequence: ['jab', 'jab', 'cross', 'hook'],
        bonusDamageMultiplier: 1.85,
        bonusStun: 12,
        displayName: '★ FANG FLURRY! ★',
        classRestriction: 'silver_viper',
    },
    // Night Crane — CRANE COUNTER: punishing double-cross into uppercut
    {
        name: 'crane-counter',
        sequence: ['cross', 'cross', 'uppercut'],
        bonusDamageMultiplier: 1.90,
        bonusStun: 16,
        displayName: '★ CRANE COUNTER! ★',
        classRestriction: 'night_crane',
    },
    // Ghost Monkey — MONKEY MADNESS: unconventional hook opener
    {
        name: 'monkey-madness',
        sequence: ['hook', 'jab', 'uppercut'],
        bonusDamageMultiplier: 1.70,
        bonusStun: 14,
        displayName: '★ MONKEY MADNESS! ★',
        classRestriction: 'ghost_monkey',
    },
    // Black Tortoise — SHELL CRUSHER: grinding 4-hit pressure
    {
        name: 'shell-crusher',
        sequence: ['jab', 'cross', 'hook', 'hook'],
        bonusDamageMultiplier: 1.65,
        bonusStun: 10,
        displayName: '★ SHELL CRUSHER! ★',
        classRestriction: 'black_tortoise',
    },
    // Iron Bull — BULL RUSH: devastating close-range finisher
    {
        name: 'bull-rush',
        sequence: ['hook', 'uppercut', 'uppercut'],
        bonusDamageMultiplier: 1.95,
        bonusStun: 20,
        displayName: '★ BULL RUSH! ★',
        classRestriction: 'iron_bull',
    },
    // Smoke Leopard — SMOKE SCREEN: safe triple-jab into cross
    {
        name: 'smoke-screen',
        sequence: ['jab', 'jab', 'jab', 'cross'],
        bonusDamageMultiplier: 1.55,
        bonusStun: 8,
        displayName: '★ SMOKE SCREEN! ★',
        classRestriction: 'smoke_leopard',
    },
];

// Sort longest combos first so we match the most specific combo
const SORTED_COMBOS = [...COMBO_DEFS].sort((a, b) => b.sequence.length - a.sequence.length);

/**
 * Check if the recent punch history ends with a known combo.
 * Returns the combo definition if found, null otherwise.
 * fighterClass is used to filter class-restricted combos.
 */
export function detectCombo(
    history: { type: PunchType; time: number }[],
    currentTime: number,
    fighterClass?: FighterClass,
): ComboDef | null {
    // Filter to only recent punches within the combo window
    const recent = history.filter(h => currentTime - h.time <= COMBO_WINDOW_MS * history.length);

    if (recent.length < 2) return null;

    for (const combo of SORTED_COMBOS) {
        // Skip class-restricted combos that don't belong to this fighter
        if (combo.classRestriction && combo.classRestriction !== fighterClass) continue;

        if (recent.length < combo.sequence.length) continue;

        // Check if the last N punches match the combo sequence
        const lastN = recent.slice(-combo.sequence.length);

        // Verify all punches are within timing window of each other
        const timingValid = lastN.every((punch, i) => {
            if (i === 0) return true;
            return punch.time - lastN[i - 1].time <= COMBO_WINDOW_MS;
        });

        if (!timingValid) continue;

        const sequenceMatch = lastN.every((punch, i) => punch.type === combo.sequence[i]);
        if (sequenceMatch) return combo;
    }

    return null;
}

/** Per-hit damage scaling within a combo sequence */
const HIT_SCALE_PER_HIT = 0.12;

/**
 * Per-hit damage scale for mid-combo hits (index 0 = first hit, etc.)
 * The finisher already gets the combo multiplier; this rewards earlier hits too.
 */
export function getComboHitScale(hitIndex: number): number {
    return 1 + hitIndex * HIT_SCALE_PER_HIT;
}

/**
 * Count how many consecutive within-window punches exist in recent history.
 * Returns a 0-indexed hit position (0 = first hit, 1 = second, etc.)
 */
export function getHitIndexInCombo(
    history: { type: PunchType; time: number }[],
    currentTime: number,
): number {
    let count = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        if (currentTime - history[i].time <= COMBO_WINDOW_MS) {
            count++;
        } else {
            break;
        }
    }
    return Math.max(0, count - 1); // 0-indexed: first hit = 0
}
