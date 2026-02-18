import { create } from 'zustand';
import type { GameClass } from './ClassStore';
import { getStoredUsername } from './UserStore';

export interface Upgrade {
    id: string;
    name: string;
    description: string;
    icon: string;
    maxLevel: number;
    apply: (stats: PlayerStats) => PlayerStats;
}

export interface PlayerStats {
    damage: number;
    fireRate: number;
    bulletSpeed: number;
    piercing: number;
    bulletCount: number;
    moveSpeed: number;
    xpMagnetRadius: number;
    critChance: number;
    critMultiplier: number;
    lifeSteal: number;
    hpRegen: number;
    aoeRadius: number;
    chainCount: number;
    bulletRange: number;
}

export const DEFAULT_STATS: PlayerStats = {
    damage: 20, fireRate: 3, bulletSpeed: 800, piercing: 0, bulletCount: 1,
    moveSpeed: 180, xpMagnetRadius: 60, critChance: 0, critMultiplier: 2,
    lifeSteal: 0, hpRegen: 0, aoeRadius: 0, chainCount: 0, bulletRange: 500,
};

export const UPGRADES: Upgrade[] = [
    { id: 'damage',       name: 'Hollow Points',   icon: '🔴', description: '+30% bullet damage',           maxLevel: 5, apply: s => ({ ...s, damage: s.damage * 1.3 }) },
    { id: 'fire_rate',    name: 'Hair Trigger',     icon: '⚡', description: '+25% fire rate',               maxLevel: 5, apply: s => ({ ...s, fireRate: s.fireRate * 1.25 }) },
    { id: 'pierce',       name: 'Penetrator',       icon: '🔷', description: 'Bullets pierce +1 enemy',      maxLevel: 4, apply: s => ({ ...s, piercing: s.piercing + 1 }) },
    { id: 'spread',       name: 'Buckshot',         icon: '🌀', description: '+2 bullets per shot',          maxLevel: 4, apply: s => ({ ...s, bulletCount: s.bulletCount + 2 }) },
    { id: 'speed',        name: 'Adrenaline',       icon: '💨', description: '+20% movement speed',          maxLevel: 4, apply: s => ({ ...s, moveSpeed: s.moveSpeed * 1.2 }) },
    { id: 'hp',           name: 'Nanobots',         icon: '💚', description: '+40 max HP',                   maxLevel: 5, apply: s => s },
    { id: 'regen',        name: 'Regenerator',      icon: '🌿', description: '+3 HP/sec regeneration',       maxLevel: 3, apply: s => ({ ...s, hpRegen: s.hpRegen + 3 }) },
    { id: 'magnet',       name: 'Attractor',        icon: '🧲', description: 'XP pickup radius ×2',          maxLevel: 3, apply: s => ({ ...s, xpMagnetRadius: s.xpMagnetRadius * 2 }) },
    { id: 'crit',         name: 'Critical Eye',     icon: '👁️', description: '+15% crit chance',            maxLevel: 4, apply: s => ({ ...s, critChance: Math.min(s.critChance + 0.15, 0.75) }) },
    { id: 'multishot',    name: 'Hydra',            icon: '🐉', description: '+1 additional projectile',     maxLevel: 5, apply: s => ({ ...s, bulletCount: s.bulletCount + 1 }) },
    { id: 'vampire',      name: 'Lifesteal',        icon: '🩸', description: 'Heal 8 HP per kill',           maxLevel: 3, apply: s => ({ ...s, lifeSteal: s.lifeSteal + 8 }) },
    { id: 'haste',        name: 'Overclock',        icon: '⏩', description: '+10% bullet speed',            maxLevel: 3, apply: s => ({ ...s, bulletSpeed: s.bulletSpeed * 1.1 }) },
    { id: 'aoe',          name: 'Shockwave',        icon: '💥', description: 'Bullets explode on hit (+40px)',maxLevel: 3, apply: s => ({ ...s, aoeRadius: s.aoeRadius + 40 }) },
    { id: 'chain',        name: 'Chain Lightning',  icon: '⚡', description: 'Bullets chain to +1 enemy',    maxLevel: 3, apply: s => ({ ...s, chainCount: s.chainCount + 1 }) },
    { id: 'bullet_speed', name: 'Railgun',          icon: '🚀', description: '+40% bullet speed',            maxLevel: 3, apply: s => ({ ...s, bulletSpeed: s.bulletSpeed * 1.4 }) },
    { id: 'range',        name: 'Long Barrel',      icon: '🎯', description: '+200px bullet range',          maxLevel: 5, apply: s => ({ ...s, bulletRange: s.bulletRange + 200 }) },
];

const XP_PER_LEVEL = (level: number) => Math.floor(50 * Math.pow(1.4, level - 1));

interface GameState {
    hp: number; maxHp: number; xp: number; level: number;
    kills: number; timeSurvived: number;
    stats: PlayerStats;
    upgradeCount: Record<string, number>;
    phase: 'menu' | 'class_select' | 'playing' | 'upgrading' | 'dead' | 'paused';
    upgradeChoices: Upgrade[];
    wave: number;
    selectedClass: GameClass | null;
    userName: string;

    showClassSelect: () => void;
    startGame: (cls: GameClass) => void;
    takeDamage: (amount: number) => void;
    heal: (amount: number) => void;
    addXP: (amount: number) => void;
    addKill: () => void;
    tick: (delta: number) => void;
    pickUpgrade: (upgrade: Upgrade) => void;
    setPhase: (phase: GameState['phase']) => void;
    togglePause: () => void;
    setUserName: (name: string) => void;
    xpToNextLevel: () => number;
}

function getRandomUpgrades(upgradeCount: Record<string, number>, count = 3): Upgrade[] {
    const available = UPGRADES.filter(u => (upgradeCount[u.id] || 0) < u.maxLevel);
    return [...available].sort(() => Math.random() - 0.5).slice(0, count);
}

export const useGameStore = create<GameState>((set, get) => ({
    hp: 100, maxHp: 100, xp: 0, level: 1, kills: 0, timeSurvived: 0,
    stats: { ...DEFAULT_STATS }, upgradeCount: {},
    phase: 'menu', upgradeChoices: [], wave: 1, selectedClass: null,
    userName: getStoredUsername() ?? 'Unknown',

    showClassSelect: () => set({ phase: 'class_select' }),

    startGame: (cls: GameClass) => set({
        hp: cls.maxHp, maxHp: cls.maxHp,
        xp: 0, level: 1, kills: 0, timeSurvived: 0,
        stats: { ...cls.stats }, upgradeCount: {},
        phase: 'playing', wave: 1, selectedClass: cls,
    }),

    takeDamage: (amount) => set(s => {
        const hp = Math.max(0, s.hp - amount);
        return { hp, phase: hp <= 0 ? 'dead' : s.phase };
    }),

    heal: (amount) => set(s => ({ hp: Math.min(s.maxHp, s.hp + amount) })),

    addXP: (amount) => {
        const s = get();
        const newXP = s.xp + amount;
        const needed = XP_PER_LEVEL(s.level);
        if (newXP >= needed) {
            set({ xp: newXP - needed, level: s.level + 1, phase: 'upgrading', upgradeChoices: getRandomUpgrades(s.upgradeCount) });
        } else {
            set({ xp: newXP });
        }
    },

    addKill: () => set(s => ({
        kills: s.kills + 1,
        hp: s.stats.lifeSteal > 0 ? Math.min(s.maxHp, s.hp + s.stats.lifeSteal) : s.hp,
    })),

    tick: (delta) => set(s => {
        if (s.phase !== 'playing') return {};
        return {
            timeSurvived: s.timeSurvived + delta,
            hp: Math.min(s.maxHp, s.hp + s.stats.hpRegen * delta),
            wave: Math.floor(s.timeSurvived / 30) + 1,
        };
    }),

    pickUpgrade: (upgrade) => {
        const s = get();
        const newStats = upgrade.apply(s.stats);
        let newMaxHp = s.maxHp, newHp = s.hp;
        if (upgrade.id === 'hp') { newMaxHp += 40; newHp = Math.min(newMaxHp, s.hp + 40); }
        const newCount = { ...s.upgradeCount, [upgrade.id]: (s.upgradeCount[upgrade.id] || 0) + 1 };
        set({ stats: newStats, upgradeCount: newCount, maxHp: newMaxHp, hp: newHp, phase: 'playing' });
    },

    setPhase: (phase) => set({ phase }),
    togglePause: () => set(s => ({
        phase: s.phase === 'playing' ? 'paused' : s.phase === 'paused' ? 'playing' : s.phase,
    })),
    setUserName: (userName) => set({ userName }),
    xpToNextLevel: () => XP_PER_LEVEL(get().level),
}));
