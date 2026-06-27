/**
 * Gameplay constants for Dream Rift.
 *
 * The playfield is a fixed 384×448 (classic vertical-STG proportions). The
 * renderer letterboxes this to any screen so every player sees an identical
 * field — there is no resize advantage, which keeps competitive runs fair.
 */

import type { Difficulty, DifficultyMul, PlayerId } from './types';

// ── Playfield / canvas ──
export const PLAYFIELD_W = 384;
export const PLAYFIELD_H = 448;
export const SIDEBAR_W = 184;
export const CANVAS_W = PLAYFIELD_W + SIDEBAR_W;
export const CANVAS_H = PLAYFIELD_H;

// ── Loop ──
export const FPS = 60;
export const DT = 1000 / FPS;
export const MAX_CATCHUP_FRAMES = 5; // never simulate more than this per rAF

// ── Player ──
export const PLAYER_START_X = PLAYFIELD_W / 2;
export const PLAYER_START_Y = PLAYFIELD_H - 56;
export const PLAYER_MARGIN = 8;
export const PLAYER_BASE_SPEED = 4.4;
export const PLAYER_FOCUS_SPEED = 1.9;
export const LIVES_START = 3;
export const BOMBS_START = 2;
export const LIVES_MAX = 8;
export const BOMBS_MAX = 8;
export const POWER_MAX = 128;
export const POWER_START = 0;
export const INVULN_RESPAWN = 180; // frames of i-frames after respawn
export const INVULN_BOMB = 0; // set per bomb below
export const DEATHBOMB_FRAMES = 8; // window to bomb after being hit
export const RESPAWN_FRAMES = 30;
export const BOMB_DURATION = 150; // frames a bomb stays active (invuln + clear)
export const BOMB_CLEAR_RADIUS = 999; // bombs clear the whole screen
export const SHOT_COOLDOWN = 5;
export const GRAZE_SCORE = 300;
export const POINT_ITEM_BASE = 12000;
export const POWER_ITEM_VALUE = 1; // power units per small item
export const POC_LINE_Y = 120; // auto-collect items above this y
export const ITEM_ATTRACT_RADIUS = 64;
export const ITEM_COLLECT_RADIUS = 14;

// Extends (1-up) at score thresholds
export const EXTEND_THRESHOLDS = [5_000_000, 15_000_000, 35_000_000, 70_000_000];

// ── Bomb i-frames ──
export const BOMB_INVULN = 120;

// ── Pools ──
export const MAX_BULLETS = 4096;
export const MAX_SHOTS = 512;
export const MAX_ENEMIES = 128;
export const MAX_ITEMS = 512;
export const MAX_EFFECTS = 512;

// ── Difficulty ──
export const DIFFICULTY: Record<Difficulty, DifficultyMul> = {
    easy: { bulletCount: 0.55, bulletSpeed: 0.78, bossHp: 0.7, enemyHp: 0.7, enemyDensity: 0.7, grazeRadius: 22, itemPower: 1.3 },
    normal: { bulletCount: 1.0, bulletSpeed: 1.0, bossHp: 1.0, enemyHp: 1.0, enemyDensity: 1.0, grazeRadius: 16, itemPower: 1.0 },
    hard: { bulletCount: 1.4, bulletSpeed: 1.18, bossHp: 1.35, enemyHp: 1.3, enemyDensity: 1.35, grazeRadius: 12, itemPower: 0.85 },
    lunatic: { bulletCount: 1.9, bulletSpeed: 1.4, bossHp: 1.8, enemyHp: 1.7, enemyDensity: 1.9, grazeRadius: 9, itemPower: 0.7 },
};

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard', 'lunatic'];

// ── Character stats ──
export interface CharStat {
    speed: number;
    focusSpeed: number;
    hitboxR: number;
    /** Base damage per shot at power 0 → POWER_MAX (interpolated). */
    damageLow: number;
    damageHigh: number;
    shotCooldown: number;
}

export const CHAR_STATS: Record<PlayerId, CharStat> = {
    bllm: { speed: 4.2, focusSpeed: 1.8, hitboxR: 2.4, damageLow: 6, damageHigh: 13, shotCooldown: 6 },
    mls: { speed: 4.0, focusSpeed: 1.6, hitboxR: 2.6, damageLow: 8, damageHigh: 20, shotCooldown: 7 },
    qln: { speed: 4.6, focusSpeed: 2.0, hitboxR: 2.8, damageLow: 5, damageHigh: 11, shotCooldown: 5 },
    dyj: { speed: 4.3, focusSpeed: 1.9, hitboxR: 2.5, damageLow: 7, damageHigh: 15, shotCooldown: 6 },
    lmy: { speed: 4.2, focusSpeed: 1.85, hitboxR: 2.5, damageLow: 6, damageHigh: 13, shotCooldown: 6 },
};

// ── Misc ──
export const MAX_PLAYERS = 4;
export const PLAYER_SLOT_OFFSETS = [-48, -16, 16, 48]; // x spawn spread for co-op
