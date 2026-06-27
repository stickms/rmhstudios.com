/**
 * Stage definitions for Dream Rift.
 *
 * Three stages, each: an intro beat, timed popcorn waves, a mid-boss, a bridge
 * of waves, then the stage boss with multiple spell cards. The stage director
 * (net/session.ts) walks this data deterministically on every client, so waves
 * spawn identically without networking; only mid-boss/boss HP and spell-card
 * transitions are host-authoritative.
 *
 * Pattern ids reference emitters registered in sim/patterns.ts.
 */

import type { BulletColorName, FairyVariant, ItemDrop, SpellCard } from '../types';
import { PLAYFIELD_W } from '../constants';

export interface EnemySpawn {
    variant: FairyVariant;
    color: BulletColorName;
    hp: number;
    x: number;
    y: number;
    holdFrames: number;
    exitDir: number;
    speed: number;
    patternId: string;
    drops: ItemDrop;
    /** Spawn a line of `count` copies spaced by xStep / delayStep frames. */
    count?: number;
    xStep?: number;
    delayStep?: number;
}

export interface WaveDef {
    atFrame: number;
    enemies: EnemySpawn[];
}

export interface BossDef {
    name: string;
    themeIndex: number;
    /** Base HP per spell card is `cards[i].hp * baseHp`. */
    baseHp: number;
    cards: SpellCard[];
}

export interface StageDef {
    index: number;
    themeId: string;
    name: string;
    subtitle: string;
    introFrames: number;
    waves: WaveDef[];
    wavesDuration: number; // frames in the 'waves' phase before mid-boss
    midboss: BossDef;
    bridge: WaveDef[];
    bridgeDuration: number;
    boss: BossDef;
    music: { stage: string; boss: string };
}

const drop = (power = 0, point = 0, life = 0, bomb = 0): ItemDrop => ({ power, point, life, bomb });
const D = -Math.PI / 2; // up (exit toward top)
const DOWN = Math.PI / 2;

// ── Reusable wave fragments ──

function sweepWave(atFrame: number, color: BulletColorName, pattern: string, fromLeft: boolean): WaveDef {
    return {
        atFrame,
        enemies: [
            {
                variant: 'sprite', color, hp: 14, x: fromLeft ? 40 : PLAYFIELD_W - 40, y: 60,
                holdFrames: 70, exitDir: fromLeft ? -0.5 : Math.PI + 0.5, speed: 1.6, patternId: pattern,
                drops: drop(3, 1), count: 5, xStep: fromLeft ? 50 : -50, delayStep: 26,
            },
        ],
    };
}

function divePair(atFrame: number, color: BulletColorName, pattern: string): WaveDef {
    return {
        atFrame,
        enemies: [
            { variant: 'sprite', color, hp: 18, x: 90, y: 40, holdFrames: 120, exitDir: DOWN + 0.6, speed: 1.4, patternId: pattern, drops: drop(2, 2) },
            { variant: 'sprite', color, hp: 18, x: PLAYFIELD_W - 90, y: 40, holdFrames: 120, exitDir: DOWN - 0.6, speed: 1.4, patternId: pattern, drops: drop(2, 2) },
        ],
    };
}

function sentinelWave(atFrame: number, color: BulletColorName, pattern: string): WaveDef {
    return {
        atFrame,
        enemies: [
            { variant: 'sentinel', color, hp: 60, x: PLAYFIELD_W / 2, y: 70, holdFrames: 200, exitDir: D, speed: 1.0, patternId: pattern, drops: drop(6, 4, 0, 1) },
        ],
    };
}

// ── Spell card helpers ──

const card = (name: string, hp: number, timeLimit: number, pattern: string, isSpell = true, bonus = 0): SpellCard => ({
    name,
    hp,
    timeLimit,
    pattern,
    isSpell,
    bonus,
});

// ─── Stage 1 — Twilight Shrine ───

const STAGE_1: StageDef = {
    index: 0,
    themeId: 'twilight-shrine',
    name: 'Twilight Shrine',
    subtitle: '黄昏の社',
    introFrames: 180,
    wavesDuration: 60 * 28,
    waves: [
        sweepWave(60, 'red', 'aimed3', true),
        sweepWave(60 * 4, 'orange', 'aimed3', false),
        divePair(60 * 8, 'magenta', 'ring8'),
        sweepWave(60 * 12, 'red', 'spreadDown', true),
        divePair(60 * 16, 'orange', 'aimed5'),
        sentinelWave(60 * 21, 'magenta', 'ring8'),
    ],
    midboss: {
        name: 'Suzuran',
        themeIndex: 0,
        baseHp: 1400,
        cards: [card('Twilight Fan', 1.0, 26, 'nonspell-petals', false)],
    },
    bridge: [
        sweepWave(60, 'red', 'aimed5', false),
        divePair(60 * 5, 'orange', 'ring8'),
        sweepWave(60 * 9, 'magenta', 'spreadDown', true),
    ],
    bridgeDuration: 60 * 14,
    boss: {
        name: 'Reimei, the Dawnkeeper',
        themeIndex: 0,
        baseHp: 2200,
        cards: [
            card('Opening Rite', 1.0, 30, 'nonspell-petals', false),
            card('Sign “Spiral Rose”', 1.1, 36, 'spell-spiralRose'),
            card('Shrine “Fan Barrage”', 1.1, 34, 'spell-fanBarrage'),
            card('Dream “Amulet Rain”', 1.2, 40, 'spell-amuletRain'),
        ],
    },
    music: { stage: 'stage1', boss: 'boss1' },
};

// ─── Stage 2 — Lucid Sea ───

const STAGE_2: StageDef = {
    index: 1,
    themeId: 'lucid-sea',
    name: 'Lucid Sea',
    subtitle: '明晰の海',
    introFrames: 180,
    wavesDuration: 60 * 30,
    waves: [
        sweepWave(60, 'cyan', 'aimed3', true),
        divePair(60 * 4, 'blue', 'aimed5'),
        sweepWave(60 * 8, 'mint', 'spreadDown', false),
        divePair(60 * 12, 'cyan', 'ring8'),
        sweepWave(60 * 16, 'blue', 'aimed5', true),
        sentinelWave(60 * 22, 'cyan', 'spiralSmall'),
    ],
    midboss: {
        name: 'Nagisa',
        themeIndex: 1,
        baseHp: 1700,
        cards: [card('Tideturn', 1.0, 28, 'nonspell-tide', false)],
    },
    bridge: [
        divePair(60, 'mint', 'ring8'),
        sweepWave(60 * 5, 'blue', 'aimed5', false),
        divePair(60 * 10, 'cyan', 'spreadDown' as string),
    ],
    bridgeDuration: 60 * 15,
    boss: {
        name: 'Mizuki of the Glasstide',
        themeIndex: 1,
        baseHp: 2800,
        cards: [
            card('Tideturn', 1.0, 30, 'nonspell-tide', false),
            card('Foam “Bubble Stream”', 1.1, 36, 'spell-bubbleStream'),
            card('Drift “Whirlpool”', 1.2, 38, 'spell-whirlpool'),
            card('Tide “Cross Waves”', 1.2, 40, 'spell-crossWaves'),
        ],
    },
    music: { stage: 'stage2', boss: 'boss2' },
};

// ─── Stage 3 — Astral Rift ───

const STAGE_3: StageDef = {
    index: 2,
    themeId: 'astral-rift',
    name: 'Astral Rift',
    subtitle: '星界の裂け目',
    introFrames: 180,
    wavesDuration: 60 * 32,
    waves: [
        divePair(60, 'purple', 'aimed5'),
        sweepWave(60 * 4, 'indigo', 'spiralSmall', true),
        divePair(60 * 8, 'magenta', 'ring8'),
        sweepWave(60 * 12, 'purple', 'aimed5', false),
        sentinelWave(60 * 16, 'indigo', 'ring8'),
        divePair(60 * 22, 'magenta', 'spiralSmall'),
    ],
    midboss: {
        name: 'Yoi',
        themeIndex: 2,
        baseHp: 2000,
        cards: [card('Starfall', 1.0, 30, 'nonspell-starfall', false)],
    },
    bridge: [
        sweepWave(60, 'purple', 'aimed5', true),
        divePair(60 * 5, 'indigo', 'ring8'),
        sentinelWave(60 * 10, 'magenta', 'spiralSmall'),
    ],
    bridgeDuration: 60 * 15,
    boss: {
        name: 'Yumesaki, the Rift Sovereign',
        themeIndex: 2,
        baseHp: 3600,
        cards: [
            card('Starfall', 1.0, 30, 'nonspell-starfall', false),
            card('Star “Galaxy Spiral”', 1.1, 38, 'spell-galaxySpiral'),
            card('Nova “Pulsar Rings”', 1.2, 40, 'spell-novaRings'),
            card('Void “Piercing Lances”', 1.2, 42, 'spell-voidLances'),
            card('Last Dream “Rift Finale”', 1.4, 50, 'spell-finale'),
        ],
    },
    music: { stage: 'stage3', boss: 'boss3' },
};

export const STAGES: StageDef[] = [STAGE_1, STAGE_2, STAGE_3];
export const STAGE_COUNT = STAGES.length;
