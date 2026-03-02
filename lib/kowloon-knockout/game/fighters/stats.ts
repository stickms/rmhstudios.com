// ============================================================
// Fighter Class Stats — Orders & Subclasses
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

    // ── Dragon Fist Subclasses ──────────────────────────────────

    power_stone_tiger: {
        maxHealth: 105,
        power: 1.45,
        punchSpeed: 0.85,
        defense: 1.2,
        moveSpeed: 1.2,
        stamina: 85,
        staminaRegen: 0.2,
    },
    power_red_phoenix: {
        maxHealth: 55,
        power: 1.8,
        punchSpeed: 1.3,
        defense: 0.5,
        moveSpeed: 2.2,
        stamina: 90,
        staminaRegen: 0.35,
    },
    power_jade_dragon: {
        maxHealth: 80,
        power: 1.2,
        punchSpeed: 1.1,
        defense: 0.9,
        moveSpeed: 1.8,
        stamina: 105,
        staminaRegen: 0.35,
    },
};

export const CLASS_DISPLAY: Record<FighterClass, { name: string; description: string; color: string; accent: string }> = {
    power: {
        name: 'ORDER OF THE DRAGON FIST',
        description: 'Raw destructive power above all else. Every punch hits like a freight train.',
        color: '#ff3366',
        accent: '#ff6699',
    },
    speed: {
        name: 'ORDER OF THE SHADOW STEP',
        description: 'Blinding speed and relentless pressure. Strike before they even see you move.',
        color: '#33ccff',
        accent: '#66ddff',
    },
    resistance: {
        name: 'ORDER OF THE IRON MOUNTAIN',
        description: 'Unyielding defense and infinite patience. Outlast everything thrown your way.',
        color: '#33ff99',
        accent: '#66ffbb',
    },

    // ── Dragon Fist Subclasses ──────────────────────────────────

    power_stone_tiger: {
        name: 'STONE TIGER',
        description: 'Immovable bruiser. Absorbs punishment and crushes with heavy blows.',
        color: '#991133',
        accent: '#cc2244',
    },
    power_red_phoenix: {
        name: 'RED PHOENIX',
        description: 'Explosive glass cannon. Highest power in the game but shatters on impact.',
        color: '#ff4400',
        accent: '#ffaa00',
    },
    power_jade_dragon: {
        name: 'JADE DRAGON',
        description: 'Balanced warrior. Solid in all areas, master of adaptability.',
        color: '#33cc66',
        accent: '#ddaa33',
    },
};

/** Maps subclass IDs to their parent order */
export const SUBCLASS_PARENT: Partial<Record<FighterClass, FighterClass>> = {
    power_stone_tiger: 'power',
    power_red_phoenix: 'power',
    power_jade_dragon: 'power',
};

/** Maps order IDs to their available subclasses */
export const ORDER_SUBCLASSES: Partial<Record<FighterClass, FighterClass[]>> = {
    power: ['power_stone_tiger', 'power_red_phoenix', 'power_jade_dragon'],
};
