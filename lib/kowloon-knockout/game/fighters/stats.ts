// ============================================================
// Fighter Class Stats — 9 Flat Roster
// ============================================================

import { FighterClass, FighterStats } from './types';

export const CLASS_STATS: Record<FighterClass, FighterStats> = {
    // ── Existing Fighters ─────────────────────────────────────

    stone_tiger: {
        maxHealth: 105,
        power: 1.45,
        punchSpeed: 0.85,
        defense: 1.2,
        moveSpeed: 1.2,
        stamina: 85,
        staminaRegen: 0.2,
    },
    red_phoenix: {
        maxHealth: 50,
        power: 1.8,
        punchSpeed: 1.3,
        defense: 0.45,
        moveSpeed: 2.2,
        stamina: 90,
        staminaRegen: 0.35,
    },
    jade_dragon: {
        maxHealth: 80,
        power: 1.2,
        punchSpeed: 1.1,
        defense: 0.9,
        moveSpeed: 1.8,
        stamina: 105,
        staminaRegen: 0.35,
    },

    // ── New Fighters ──────────────────────────────────────────

    silver_viper: {
        maxHealth: 60,
        power: 0.9,
        punchSpeed: 1.5,
        defense: 0.55,
        moveSpeed: 2.5,
        stamina: 110,
        staminaRegen: 0.45,
    },
    night_crane: {
        maxHealth: 85,
        power: 1.35,
        punchSpeed: 1.1,
        defense: 1.0,
        moveSpeed: 1.6,
        stamina: 95,
        staminaRegen: 0.3,
    },
    ghost_monkey: {
        maxHealth: 70,
        power: 1.15,
        punchSpeed: 1.25,
        defense: 0.7,
        moveSpeed: 2.3,
        stamina: 100,
        staminaRegen: 0.4,
    },
    black_tortoise: {
        maxHealth: 100,
        power: 0.75,
        punchSpeed: 0.95,
        defense: 1.3,
        moveSpeed: 1.3,
        stamina: 120,
        staminaRegen: 0.5,
    },
    iron_bull: {
        maxHealth: 110,
        power: 1.55,
        punchSpeed: 0.8,
        defense: 1.1,
        moveSpeed: 1.4,
        stamina: 90,
        staminaRegen: 0.25,
    },
    smoke_leopard: {
        maxHealth: 75,
        power: 1.05,
        punchSpeed: 1.2,
        defense: 0.8,
        moveSpeed: 2.0,
        stamina: 105,
        staminaRegen: 0.35,
    },
};

export const CLASS_DISPLAY: Record<FighterClass, { name: string; description: string; color: string; accent: string }> = {
    stone_tiger: {
        name: 'STONE TIGER',
        description: 'Immovable bruiser. Absorbs punishment and crushes with heavy blows.',
        color: '#991133',
        accent: '#cc2244',
    },
    red_phoenix: {
        name: 'RED PHOENIX',
        description: 'Explosive glass cannon. Highest power in the game but shatters on impact.',
        color: '#ff4400',
        accent: '#ffaa00',
    },
    jade_dragon: {
        name: 'JADE DRAGON',
        description: 'Balanced warrior. Solid in all areas, master of adaptability.',
        color: '#33cc66',
        accent: '#ddaa33',
    },
    silver_viper: {
        name: 'SILVER VIPER',
        description: 'Blinding speed and evasion. Strikes before you see it move.',
        color: '#7788aa',
        accent: '#aaccee',
    },
    night_crane: {
        name: 'NIGHT CRANE',
        description: 'Patient counter-puncher. Waits, reads, then devastates.',
        color: '#2244aa',
        accent: '#ffcc44',
    },
    ghost_monkey: {
        name: 'GHOST MONKEY',
        description: 'Unpredictable wildcard. Erratic movement, impossible to read.',
        color: '#cc6622',
        accent: '#ffdd55',
    },
    black_tortoise: {
        name: 'BLACK TORTOISE',
        description: 'Endless stamina and iron defense. Outlasts everything thrown at it.',
        color: '#334455',
        accent: '#55cc88',
    },
    iron_bull: {
        name: 'IRON BULL',
        description: 'Close-range devastator. Get in your face and end the fight.',
        color: '#883322',
        accent: '#ddbb44',
    },
    smoke_leopard: {
        name: 'SMOKE LEOPARD',
        description: 'Ranged poker. Controls space with jabs and never lets you close in.',
        color: '#665577',
        accent: '#bb88cc',
    },
};

/** All fighter class IDs */
export const ALL_FIGHTERS: FighterClass[] = [
    'stone_tiger', 'red_phoenix', 'jade_dragon',
    'silver_viper', 'night_crane', 'ghost_monkey',
    'black_tortoise', 'iron_bull', 'smoke_leopard',
];
