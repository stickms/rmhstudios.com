// ============================================================
// Combo Detection System
// ============================================================

import { ComboDef, PunchType } from '../fighters/types';

export const COMBO_WINDOW_MS = 800; // max time between punches to count as combo

export const COMBO_DEFS: ComboDef[] = [
    // 2-hit combos
    {
        name: 'one-two',
        sequence: ['jab', 'cross'],
        bonusDamageMultiplier: 1.2,
        bonusStun: 4,
        displayName: 'ONE-TWO!',
    },
    // 3-hit combos
    {
        name: 'classic-triple',
        sequence: ['jab', 'cross', 'hook'],
        bonusDamageMultiplier: 1.35,
        bonusStun: 8,
        displayName: 'CLASSIC TRIPLE!',
    },
    {
        name: 'body-breaker',
        sequence: ['jab', 'jab', 'uppercut'],
        bonusDamageMultiplier: 1.3,
        bonusStun: 10,
        displayName: 'BODY BREAKER!',
    },
    {
        name: 'speedster',
        sequence: ['jab', 'jab', 'cross'],
        bonusDamageMultiplier: 1.25,
        bonusStun: 6,
        displayName: 'SPEEDSTER!',
    },
    {
        name: 'haymaker-setup',
        sequence: ['cross', 'hook', 'uppercut'],
        bonusDamageMultiplier: 1.5,
        bonusStun: 14,
        displayName: 'HAYMAKER!',
    },
    // 4-hit combo — hardest to land
    {
        name: 'fury-combo',
        sequence: ['jab', 'cross', 'hook', 'uppercut'],
        bonusDamageMultiplier: 1.75,
        bonusStun: 20,
        displayName: '★ FURY COMBO! ★',
    },
];

// Sort longest combos first so we match the most specific combo
const SORTED_COMBOS = [...COMBO_DEFS].sort((a, b) => b.sequence.length - a.sequence.length);

/**
 * Check if the recent punch history ends with a known combo.
 * Returns the combo definition if found, null otherwise.
 */
export function detectCombo(
    history: { type: PunchType; time: number }[],
    currentTime: number,
): ComboDef | null {
    // Filter to only recent punches within the combo window
    const recent = history.filter(h => currentTime - h.time <= COMBO_WINDOW_MS * history.length);

    if (recent.length < 2) return null;

    for (const combo of SORTED_COMBOS) {
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
