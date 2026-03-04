import type { DifficultyMultipliers, Difficulty, Character } from './types';

// --- Playfield ---
export const PLAYFIELD_WIDTH = 384;
export const PLAYFIELD_HEIGHT = 448;
export const SIDEBAR_WIDTH = 192;
export const CANVAS_WIDTH = PLAYFIELD_WIDTH + SIDEBAR_WIDTH;
export const CANVAS_HEIGHT = PLAYFIELD_HEIGHT;

/** CSS scale factor applied to the game container for display size. */
export const DISPLAY_SCALE = 1.5;

// --- Game Loop ---
export const TARGET_FPS = 60;
export const FRAME_TIME = 1000 / TARGET_FPS;

// --- Player ---
export const PLAYER_SPEED = 4.5;
export const PLAYER_FOCUS_SPEED = 2.0;
export const PLAYER_START_X = PLAYFIELD_WIDTH / 2;
export const PLAYER_START_Y = PLAYFIELD_HEIGHT - 48;
export const PLAYER_INVULN_FRAMES = 120;
export const DEATHBOMB_WINDOW = 10;
export const POWER_MAX = 128;
export const LIVES_MAX = 8;
export const BOMBS_MAX = 8;
export const LIVES_START = 3;
export const BOMBS_START = 3;

// --- Melee ---
export const MELEE_COOLDOWN = 20;
export const MELEE_INVULN_FRAMES = 8;
export const MELEE_RANGE = 48;
export const MELEE_ARC_REI = Math.PI;
export const MELEE_ARC_YUME = Math.PI / 3;

// --- Special ---
export const SPECIAL_COOLDOWN_REI = 300;
export const SPECIAL_COOLDOWN_YUME = 180;
export const SPECIAL_DURATION_REI = 120;
export const SPECIAL_DURATION_YUME = 15;

// --- Dash ---
export const DASH_COOLDOWN = 45;
export const DASH_DISTANCE = 64;
export const DASH_INVULN_FRAMES = 12;

// --- Bullet Pool ---
export const BULLET_POOL_SIZE = 10000;
export const ENEMY_POOL_SIZE = 200;
export const ITEM_POOL_SIZE = 500;

// --- Item Collection ---
export const ITEM_AUTOCOLLECT_Y = 96;
export const ITEM_ATTRACT_RADIUS = 48;
export const ITEM_COLLECT_RADIUS = 16;

// --- Graze ---
export const GRAZE_RADIUS_EASY = 24;
export const GRAZE_RADIUS_NORMAL = 16;
export const GRAZE_RADIUS_HARD = 12;
export const GRAZE_RADIUS_LUNATIC = 8;

// --- Scoring ---
export const POINT_ITEM_BASE = 10000;
export const GRAZE_SCORE = 500;
export const LIFE_SCORE_THRESHOLDS = [10_000_000, 25_000_000, 50_000_000, 100_000_000];

// --- Difficulty ---
export const DIFFICULTY_MULTIPLIERS: Record<Difficulty, DifficultyMultipliers> = {
  easy:    { bulletCount: 0.5, bulletSpeed: 0.7, bossHp: 0.6, spellCardCount: 2, enemyDensity: 0.6, grazeWindow: GRAZE_RADIUS_EASY },
  normal:  { bulletCount: 1.0, bulletSpeed: 1.0, bossHp: 1.0, spellCardCount: 3, enemyDensity: 1.0, grazeWindow: GRAZE_RADIUS_NORMAL },
  hard:    { bulletCount: 1.5, bulletSpeed: 1.2, bossHp: 1.4, spellCardCount: 4, enemyDensity: 1.4, grazeWindow: GRAZE_RADIUS_HARD },
  lunatic: { bulletCount: 2.0, bulletSpeed: 1.5, bossHp: 2.0, spellCardCount: 5, enemyDensity: 2.0, grazeWindow: GRAZE_RADIUS_LUNATIC },
};

// --- Character Stats ---
export const CHARACTER_STATS: Record<Character, {
  speed: number;
  focusSpeed: number;
  hitboxRadius: number;
}> = {
  rei:  { speed: 4.0, focusSpeed: 1.8, hitboxRadius: 2.0 },
  yume: { speed: 5.0, focusSpeed: 2.2, hitboxRadius: 2.5 },
};
