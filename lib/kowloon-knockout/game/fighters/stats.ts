// ============================================================
// Fighter Class Stats — Power, Speed, Resistance
// ============================================================

import { FighterClass, FighterStats } from './types';

export const CLASS_STATS: Record<FighterClass, FighterStats> = {
    power: {
        maxHealth: 70,
        power: 1.5,
        punchSpeed: 1.0,
        defense: 0.7,
        moveSpeed: 1.8,
        stamina: 100,
        staminaRegen: 0.3,
    },
    speed: {
        maxHealth: 85,
        power: 0.7,
        punchSpeed: 1.6,
        defense: 0.8,
        moveSpeed: 2.5,
        stamina: 120,
        staminaRegen: 0.5,
    },
    resistance: {
        maxHealth: 120,
        power: 0.5,
        punchSpeed: 1.0,
        defense: 1.4,
        moveSpeed: 1.5,
        stamina: 90,
        staminaRegen: 0.25,
    },
};

export const CLASS_DISPLAY: Record<FighterClass, { name: string; description: string; color: string; accent: string }> = {
    power: {
        name: 'DRAGON FIST',
        description: 'Devastating power but glass jaw. One clean combo can end it all.',
        color: '#ff3366',
        accent: '#ff6699',
    },
    speed: {
        name: 'SHADOW STEP',
        description: 'Lightning fast combos. Death by a thousand cuts.',
        color: '#33ccff',
        accent: '#66ddff',
    },
    resistance: {
        name: 'IRON MOUNTAIN',
        description: 'An immovable wall. Wears opponents down with patience.',
        color: '#33ff99',
        accent: '#66ffbb',
    },
};
