export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

/** Maximum wave — game ends on clearing wave 40 */
export const MAX_WAVE = 40;

// Rectangular arena (replaces circular)
export const ARENA_W = 1600;
export const ARENA_H = 1000;
export const ARENA_HW = ARENA_W / 2;
export const ARENA_HH = ARENA_H / 2;

export const PLAYER_RADIUS = 12;
export const PLAYER_SPEED = 220;
export const PLAYER_HP = 3;
export const PLAYER_FIRE_RATE = 0.20;
export const PROJ_SPEED = 550;
export const PROJ_RADIUS = 4;
export const PROJ_DAMAGE = 1;
export const INVINCIBILITY_MS = 1500;

// Dash
export const DASH_SPEED = 650;
export const DASH_DURATION = 0.2;
export const DASH_COOLDOWN = 2.0;

// Focus (bullet-time)
export const FOCUS_DURATION = 2.5;
export const FOCUS_COOLDOWN = 12;
export const FOCUS_WORLD_SLOW = 0.3;
export const FOCUS_PLAYER_SLOW = 0.6;
export const FOCUS_COMBO_REDUCE = 0.5;

// Shards
export const SHARD_MAGNET_RANGE = 90;
export const SHARD_PULL_SPEED = 320;
export const SHARD_ORBIT_BASE = 25;
export const SHARD_ORBIT_PER = 0.8;
export const MAX_SHARDS = 40;
export const SHARD_MULT_PER = 0.1;
export const SHARD_POINTS = 5;

// Detonation
export const DET_MIN_SHARDS = 5;
export const DET_BASE_RADIUS = 120;
export const DET_RADIUS_PER_SHARD = 6;
export const DET_COOLDOWN = 0.5;
export const DET_DAMAGE = 3;
/** Bonus detonate damage per shard spent (a 40-shard burst hits much harder). */
export const DET_DMG_PER_SHARD = 0.2;
/**
 * Surge: detonating banks the score multiplier you spent into a temporary
 * decaying bonus, so blowing your shard ring is a power spike — not a reset.
 */
export const SURGE_DURATION = 6;

// Combo
export const COMBO_WINDOW = 2.0;
export const COMBO_MULT_PER = 0.15;
export const COMBO_MAX_MULT = 3.0;

// Scoring
export const WAVE_BONUS_PER = 100;
export const WAVE_BREAK_S = 2.0;
export const COUNTDOWN_S = 3;

// Pools (bigger for larger map)
export const MAX_ENEMIES = 80;
// Large enough that dense boss bullet-hell patterns never starve player fire.
export const MAX_PROJECTILES = 200;
export const MAX_SHARDS_POOL = 80;
export const MAX_PARTICLES = 300;

// Boss
export const BOSS_WAVE_INTERVAL = 5;
export const BOSS_BASE_HP = 25;
export const BOSS_HP_PER_TIER = 15;
export const BOSS_RADIUS = 30;
export const BOSS_SPEED = 50;
export const BOSS_VALUE = 500;
export const BOSS_SHARD_DROP = 10;
export const BOSS_ATTACK_INTERVAL = 2.0;
export const BOSS_SUMMON_INTERVAL = 5.0;
export const BOSS_PROJ_SPEED = 180;

// Wing levels (visual thresholds)
export const WING_LEVELS = [0, 8, 18, 30, 40];

// ── New abilities ─────────────────────────────────────────────────────────────
export const VOID_PULSE_RADIUS = 180;     // pixels
export const VOID_PULSE_DAMAGE = 2;
export const PHASE_SHIFT_DURATION = 1.8; // seconds full invincibility
export const REFLECT_SHIELD_DURATION = 1.5;
export const ALLY_PROJ_SPEED = 420;
export const ALLY_PROJ_DAMAGE = 1;

// ── Map transition ───────────────────────────────────────────────────────────
/** Player must reach this X coordinate (fraction of ARENA_W) to trigger map advance */
export const MAP_DOOR_X_FRAC = 0.92;     // 92% of arena width
export const MAP_TRANSITION_DURATION = 1.8; // seconds for fade

// ── Heart Drops ──────────────────────────────────────────────────────────────
/** Chance an enemy drops a heart on death (8%) */
export const DROP_HEART_CHANCE = 0.08;
/** How long a heart pickup persists before despawning (seconds) */
export const HEART_PICKUP_LIFETIME = 12;
/** HP restored when picking up a heart */
export const HEART_HEAL_AMOUNT = 1;
/** Max number of heart pickups in pool */
export const MAX_HEART_PICKUPS = 10;
/** Magnet radius — heart starts pulling toward player */
export const HEART_MAGNET_RANGE = 60;
/** Speed at which heart is pulled toward player */
export const HEART_PULL_SPEED = 200;

export interface EnemyConfig {
  hp: number;
  radius: number;
  speed: number;
  value: number;
  color: string;
  shardCount: number;
  waveCost: number;
  minWave: number;
}

export const ENEMY_CONFIGS: Record<string, EnemyConfig> = {
  drifter: { hp: 1, radius: 10, speed: 80, value: 10, color: '#8866cc', shardCount: 1, waveCost: 1, minWave: 1 },
  dasher: { hp: 1, radius: 8, speed: 60, value: 20, color: '#cc4422', shardCount: 1, waveCost: 2, minWave: 3 },
  orbiter: { hp: 2, radius: 12, speed: 60, value: 30, color: '#aa44ff', shardCount: 2, waveCost: 3, minWave: 5 },
  tank: { hp: 5, radius: 20, speed: 40, value: 50, color: '#aa2233', shardCount: 3, waveCost: 5, minWave: 8 },
  splitter: { hp: 2, radius: 14, speed: 70, value: 25, color: '#66aa44', shardCount: 2, waveCost: 3, minWave: 10 },
  mini_drifter: { hp: 1, radius: 7, speed: 100, value: 5, color: '#88cc88', shardCount: 1, waveCost: 0, minWave: 999 },
  // Ranged marksman — keeps its distance, telegraphs a line, fires a fast precise shot.
  sniper: { hp: 2, radius: 11, speed: 50, value: 35, color: '#ff5544', shardCount: 2, waveCost: 3, minWave: 6 },
  // Support — drifts at the back and heals nearby wounded enemies. Priority target.
  healer: { hp: 4, radius: 13, speed: 55, value: 45, color: '#33ff99', shardCount: 3, waveCost: 4, minWave: 14 },
  // Armored — a directional shield blocks frontal shots; must be flanked.
  shielded: { hp: 4, radius: 16, speed: 48, value: 50, color: '#5577ff', shardCount: 3, waveCost: 4, minWave: 12 },
  // Hive — hangs back and spews mini-drifters; a priority target or you drown.
  hive: { hp: 6, radius: 17, speed: 34, value: 60, color: '#66dd55', shardCount: 3, waveCost: 5, minWave: 14 },
  // Bomber — lobs telegraphed AoE bombs; forces you to keep repositioning.
  bomber: { hp: 3, radius: 14, speed: 42, value: 45, color: '#ff8844', shardCount: 2, waveCost: 4, minWave: 12 },
};

// Shielded enemy: half-arc (radians) of its frontal shield that blocks shots.
export const SHIELD_HALF_ARC = 1.25;
// Max angular speed (rad/s) the shield can track the player — flank it by out-circling.
export const SHIELD_TURN_RATE = 2.2;
