import { PlayerStats } from './GameStore';

// ─── Ability Types ────────────────────────────────────────────────────────────

export type AbilityEffect =
    | { type: 'shield'; duration: number }                    // damage immunity
    | { type: 'aoe_slam'; radius: number; damage: number }    // AoE around player
    | { type: 'hp_boost'; amount: number }                    // instant heal
    | { type: 'death_mark'; multiplier: number; duration: number } // next shot multiplied
    | { type: 'scythe'; radius: number; damage: number }      // AoE around player (Reaper)
    | { type: 'soul_drain'; radius: number; healPerKill: number; duration: number }
    | { type: 'heal_pulse'; amount: number }
    | { type: 'regen_burst'; rate: number; duration: number }
    | { type: 'overdrive'; fireRateMultiplier: number; duration: number }
    | { type: 'fan_hammer'; duration: number; fireRateMultiplier: number }
    | { type: 'ricochet'; duration: number }                  // bullets pierce all
    | { type: 'dead_eye'; duration: number }                  // 100% crit
    | { type: 'blink'; distance: number }                     // teleport forward
    | { type: 'shadow_burst'; radius: number; damage: number; invincible: number }
    | { type: 'chain_nova'; radius: number; chains: number; damage: number };

export interface Ability {
    id: string;
    name: string;
    icon: string;
    description: string;
    cooldown: number;   // seconds
    key: 'Q' | 'E' | 'R';
    effect: AbilityEffect;
}

export interface GameClass {
    id: string;
    name: string;
    icon: string;
    color: string;         // accent color
    tagline: string;
    description: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    stats: PlayerStats;
    maxHp: number;
    abilities: [Ability, Ability, Ability];
}

// ─── Class Definitions ────────────────────────────────────────────────────────

export const CLASSES: GameClass[] = [
    // ── SENTINEL ─────────────────────────────────────────────────────────────
    {
        id: 'sentinel',
        name: 'Sentinel',
        icon: '🛡️',
        color: '#4488ff',
        tagline: 'Immovable. Unbreakable.',
        description: 'A heavily armored tank with massive HP and defensive abilities. Slow but nearly unkillable.',
        difficulty: 'Easy',
        maxHp: 220,
        stats: {
            damage: 15,
            fireRate: 2,
            bulletSpeed: 700,
            piercing: 0,
            bulletCount: 1,
            moveSpeed: 140,
            xpMagnetRadius: 60,
            critChance: 0.05,
            critMultiplier: 2,
            lifeSteal: 0,
            hpRegen: 2,
            aoeRadius: 0,
            chainCount: 0,
            bulletRange: 500,
        },
        abilities: [
            {
                id: 'barrier', name: 'Barrier', icon: '🛡️', key: 'Q',
                description: 'Become invincible for 3 seconds',
                cooldown: 12,
                effect: { type: 'shield', duration: 3 },
            },
            {
                id: 'slam', name: 'Ground Slam', icon: '💥', key: 'E',
                description: 'Massive AoE explosion around you (300px, 80 dmg)',
                cooldown: 8,
                effect: { type: 'aoe_slam', radius: 300, damage: 80 },
            },
            {
                id: 'rally', name: 'Rally', icon: '💪', key: 'R',
                description: 'Instantly restore 80 HP',
                cooldown: 20,
                effect: { type: 'hp_boost', amount: 80 },
            },
        ],
    },

    // ── REAPER ───────────────────────────────────────────────────────────────
    {
        id: 'reaper',
        name: 'Reaper',
        icon: '💀',
        color: '#ff3344',
        tagline: 'One shot. One kill.',
        description: 'Extreme damage output but paper-thin HP. High risk, devastating reward.',
        difficulty: 'Hard',
        maxHp: 60,
        stats: {
            damage: 50,
            fireRate: 1.5,
            bulletSpeed: 1000,
            piercing: 1,
            bulletCount: 1,
            moveSpeed: 190,
            xpMagnetRadius: 80,
            critChance: 0.2,
            critMultiplier: 3,
            lifeSteal: 0,
            hpRegen: 0,
            aoeRadius: 0,
            chainCount: 0,
            bulletRange: 700,
        },
        abilities: [
            {
                id: 'death_mark', name: 'Death Mark', icon: '☠️', key: 'Q',
                description: 'Next 3 shots deal 5× damage',
                cooldown: 10,
                effect: { type: 'death_mark', multiplier: 5, duration: 4 },
            },
            {
                id: 'scythe', name: 'Scythe Sweep', icon: '⚔️', key: 'E',
                description: 'Slash all enemies within 200px for 120 damage',
                cooldown: 7,
                effect: { type: 'scythe', radius: 200, damage: 120 },
            },
            {
                id: 'soul_drain', name: 'Soul Drain', icon: '🩸', key: 'R',
                description: 'For 5s, each kill heals 30 HP',
                cooldown: 18,
                effect: { type: 'soul_drain', radius: 999, healPerKill: 30, duration: 5 },
            },
        ],
    },

    // ── MEDIC ────────────────────────────────────────────────────────────────
    {
        id: 'medic',
        name: 'Medic',
        icon: '💉',
        color: '#22cc66',
        tagline: 'Outlast everything.',
        description: 'Moderate stats with powerful healing abilities. Sustains through waves others cannot.',
        difficulty: 'Easy',
        maxHp: 140,
        stats: {
            damage: 18,
            fireRate: 2.5,
            bulletSpeed: 760,
            piercing: 0,
            bulletCount: 1,
            moveSpeed: 165,
            xpMagnetRadius: 80,
            critChance: 0.05,
            critMultiplier: 2,
            lifeSteal: 3,
            hpRegen: 4,
            aoeRadius: 0,
            chainCount: 0,
            bulletRange: 500,
        },
        abilities: [
            {
                id: 'heal_pulse', name: 'Heal Pulse', icon: '💚', key: 'Q',
                description: 'Instantly restore 60 HP',
                cooldown: 8,
                effect: { type: 'heal_pulse', amount: 60 },
            },
            {
                id: 'regen_burst', name: 'Regen Burst', icon: '🌿', key: 'E',
                description: 'Regenerate 20 HP/sec for 5 seconds',
                cooldown: 14,
                effect: { type: 'regen_burst', rate: 20, duration: 5 },
            },
            {
                id: 'overdrive', name: 'Overdrive', icon: '⚡', key: 'R',
                description: 'Triple fire rate for 4 seconds',
                cooldown: 20,
                effect: { type: 'overdrive', fireRateMultiplier: 3, duration: 4 },
            },
        ],
    },

    // ── GUNSLINGER ───────────────────────────────────────────────────────────
    {
        id: 'gunslinger',
        name: 'Gunslinger',
        icon: '🔫',
        color: '#ffcc00',
        tagline: 'More bullets. More problems.',
        description: 'Rapid-fire specialist with multishot and crit synergies. Shreds crowds.',
        difficulty: 'Medium',
        maxHp: 100,
        stats: {
            damage: 18,
            fireRate: 5,
            bulletSpeed: 900,
            piercing: 0,
            bulletCount: 2,
            moveSpeed: 175,
            xpMagnetRadius: 60,
            critChance: 0.25,
            critMultiplier: 2.5,
            lifeSteal: 0,
            hpRegen: 0,
            aoeRadius: 0,
            chainCount: 0,
            bulletRange: 550,
        },
        abilities: [
            {
                id: 'fan_hammer', name: 'Fan the Hammer', icon: '🔥', key: 'Q',
                description: 'Fire at 10× speed for 2 seconds',
                cooldown: 10,
                effect: { type: 'fan_hammer', duration: 2, fireRateMultiplier: 10 },
            },
            {
                id: 'ricochet', name: 'Ricochet', icon: '🔷', key: 'E',
                description: 'Bullets pierce ALL enemies for 4 seconds',
                cooldown: 12,
                effect: { type: 'ricochet', duration: 4 },
            },
            {
                id: 'dead_eye', name: 'Dead Eye', icon: '👁️', key: 'R',
                description: '100% crit chance for 5 seconds',
                cooldown: 18,
                effect: { type: 'dead_eye', duration: 5 },
            },
        ],
    },

    // ── PHANTOM ──────────────────────────────────────────────────────────────
    {
        id: 'phantom',
        name: 'Phantom',
        icon: '👻',
        color: '#cc44ff',
        tagline: 'Strike from the shadows.',
        description: 'Extreme mobility with blink and AoE chain abilities. Rewards aggressive play.',
        difficulty: 'Hard',
        maxHp: 80,
        stats: {
            damage: 28,
            fireRate: 3,
            bulletSpeed: 840,
            piercing: 0,
            bulletCount: 1,
            moveSpeed: 240,
            xpMagnetRadius: 100,
            critChance: 0.15,
            critMultiplier: 2.5,
            lifeSteal: 0,
            hpRegen: 0,
            aoeRadius: 0,
            chainCount: 1,
            bulletRange: 600,
        },
        abilities: [
            {
                id: 'blink', name: 'Blink', icon: '⚡', key: 'Q',
                description: 'Teleport 300px in your movement direction',
                cooldown: 5,
                effect: { type: 'blink', distance: 300 },
            },
            {
                id: 'shadow_burst', name: 'Shadow Burst', icon: '🌑', key: 'E',
                description: 'AoE explosion (250px, 100 dmg) + 1s invincibility',
                cooldown: 10,
                effect: { type: 'shadow_burst', radius: 250, damage: 100, invincible: 1 },
            },
            {
                id: 'chain_nova', name: 'Chain Nova', icon: '⚡', key: 'R',
                description: 'Chain lightning hits all nearby enemies (400px, 60 dmg, 8 chains)',
                cooldown: 15,
                effect: { type: 'chain_nova', radius: 400, chains: 8, damage: 60 },
            },
        ],
    },
];

export function getClassById(id: string): GameClass | undefined {
    return CLASSES.find(c => c.id === id);
}

// ─── Active Ability State (used in game loop) ─────────────────────────────────

export interface AbilityState {
    cooldownRemaining: number;
    active: boolean;
    activeTimer: number;
}

export function makeAbilityStates(): AbilityState[] {
    return [
        { cooldownRemaining: 0, active: false, activeTimer: 0 },
        { cooldownRemaining: 0, active: false, activeTimer: 0 },
        { cooldownRemaining: 0, active: false, activeTimer: 0 },
    ];
}
