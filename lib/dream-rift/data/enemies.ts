/**
 * Enemy template definitions for Dream Rift.
 *
 * Each template provides default HP, sprite, bullet patterns, and drop tables
 * that stage data references when spawning enemies in waves. The stage manager
 * copies these values into live Enemy instances at spawn time so the templates
 * themselves are never mutated.
 */

import type { BulletPatternDef, ItemDrop } from '../types';

// ---------------------------------------------------------------------------
// EnemyTemplate interface
// ---------------------------------------------------------------------------

export interface EnemyTemplate {
  /** Unique type key referenced by EnemySpawnDef.type */
  type: string;
  /** Default hit points (scaled by difficulty at runtime) */
  hp: number;
  /** Sprite sheet key */
  sprite: string;
  /** Default bullet patterns (overridable per-spawn) */
  patterns: BulletPatternDef[];
  /** Default drop table */
  dropTable: ItemDrop[];
}

// ---------------------------------------------------------------------------
// Shared drop tables
// ---------------------------------------------------------------------------

const DROP_SMALL: ItemDrop[] = [
  { type: 'power', chance: 0.4, count: 1 },
  { type: 'point', chance: 0.6, count: 1 },
];

const DROP_MEDIUM: ItemDrop[] = [
  { type: 'power', chance: 0.5, count: 2 },
  { type: 'point', chance: 0.7, count: 2 },
];

const DROP_LARGE: ItemDrop[] = [
  { type: 'power', chance: 0.6, count: 3 },
  { type: 'point', chance: 0.8, count: 3 },
  { type: 'bomb', chance: 0.05, count: 1 },
];

const DROP_ELITE: ItemDrop[] = [
  { type: 'power', chance: 0.8, count: 4 },
  { type: 'point', chance: 1.0, count: 4 },
  { type: 'bomb', chance: 0.1, count: 1 },
];

// ---------------------------------------------------------------------------
// Stage 1 enemies — Lucid Meadow
// ---------------------------------------------------------------------------

/** Basic fairy — low HP, slow aimed shots at the player. */
export const FAIRY_BASIC: EnemyTemplate = {
  type: 'fairy_basic',
  hp: 30,
  sprite: 'enemy-fairy-basic',
  patterns: [
    {
      type: 'aimed',
      bulletSprite: 'bullet-blue',
      count: 1,
      speed: 2.0,
      angle: 90,
      spread: 0,
      interval: 60,
      duration: 180,
    },
  ],
  dropTable: DROP_SMALL,
};

/** Radial fairy — medium HP, fires rings of bullets. */
export const FAIRY_RADIAL: EnemyTemplate = {
  type: 'fairy_radial',
  hp: 60,
  sprite: 'enemy-fairy-radial',
  patterns: [
    {
      type: 'radial',
      bulletSprite: 'bullet-red',
      count: 8,
      speed: 1.8,
      angle: 0,
      spread: 360,
      interval: 90,
      duration: 270,
    },
  ],
  dropTable: DROP_MEDIUM,
};

/** Spiral fairy — higher HP, fires rotating spiral streams. */
export const FAIRY_SPIRAL: EnemyTemplate = {
  type: 'fairy_spiral',
  hp: 100,
  sprite: 'enemy-fairy-spiral',
  patterns: [
    {
      type: 'spiral',
      bulletSprite: 'bullet-purple',
      count: 3,
      speed: 2.2,
      angle: 0,
      spread: 360,
      interval: 8,
      duration: 300,
      modifiers: [{ type: 'rotate', value: 3 }],
    },
  ],
  dropTable: DROP_MEDIUM,
};

/** Wall fairy — fires horizontal wall patterns (stages 3+). */
export const FAIRY_WALL: EnemyTemplate = {
  type: 'fairy_wall',
  hp: 80,
  sprite: 'enemy-fairy-wall',
  patterns: [
    {
      type: 'wall',
      bulletSprite: 'bullet-yellow',
      count: 12,
      speed: 1.5,
      angle: 90,
      spread: 160,
      interval: 45,
      duration: 180,
    },
  ],
  dropTable: DROP_MEDIUM,
};

// ---------------------------------------------------------------------------
// Stage 2 enemies — Drowning Library
// ---------------------------------------------------------------------------

/** Ink spirit — ghostly enemy that fires slow ink blobs then splits. */
export const INK_SPIRIT: EnemyTemplate = {
  type: 'ink_spirit',
  hp: 70,
  sprite: 'enemy-ink-spirit',
  patterns: [
    {
      type: 'aimed',
      bulletSprite: 'bullet-purple',
      count: 3,
      speed: 1.6,
      angle: 90,
      spread: 30,
      interval: 50,
      duration: 200,
      modifiers: [{ type: 'split', value: 3, delay: 30 }],
    },
  ],
  dropTable: DROP_MEDIUM,
};

/** Page phantom — fires spreads of sharp page-like bullets. */
export const PAGE_PHANTOM: EnemyTemplate = {
  type: 'page_phantom',
  hp: 50,
  sprite: 'enemy-page-phantom',
  patterns: [
    {
      type: 'aimed',
      bulletSprite: 'bullet-white',
      count: 5,
      speed: 2.5,
      angle: 90,
      spread: 40,
      interval: 70,
      duration: 210,
    },
  ],
  dropTable: DROP_SMALL,
};

// ---------------------------------------------------------------------------
// Stage 3 enemies — Clockwork Abyss
// ---------------------------------------------------------------------------

/** Gear drone — mechanical enemy with timed bursts and speed changes. */
export const GEAR_DRONE: EnemyTemplate = {
  type: 'gear_drone',
  hp: 120,
  sprite: 'enemy-gear-drone',
  patterns: [
    {
      type: 'radial',
      bulletSprite: 'bullet-orange',
      count: 12,
      speed: 2.0,
      angle: 0,
      spread: 360,
      interval: 40,
      duration: 240,
      modifiers: [{ type: 'accelerate', value: 0.5, delay: 20 }],
    },
  ],
  dropTable: DROP_MEDIUM,
};

/** Spring sentinel — fires alternating fast/slow streams. */
export const SPRING_SENTINEL: EnemyTemplate = {
  type: 'spring_sentinel',
  hp: 90,
  sprite: 'enemy-spring-sentinel',
  patterns: [
    {
      type: 'stream',
      bulletSprite: 'bullet-yellow',
      count: 2,
      speed: 3.0,
      angle: 90,
      spread: 10,
      interval: 20,
      duration: 300,
      modifiers: [{ type: 'accelerate', value: -1.0, delay: 30 }],
    },
  ],
  dropTable: DROP_MEDIUM,
};

// ---------------------------------------------------------------------------
// Stage 4 enemies — Mirror Palace
// ---------------------------------------------------------------------------

/** Mirror wisp — fires symmetric mirrored patterns. */
export const MIRROR_WISP: EnemyTemplate = {
  type: 'mirror_wisp',
  hp: 100,
  sprite: 'enemy-mirror-wisp',
  patterns: [
    {
      type: 'radial',
      bulletSprite: 'bullet-cyan',
      count: 6,
      speed: 2.0,
      angle: 45,
      spread: 180,
      interval: 50,
      duration: 250,
    },
    {
      type: 'radial',
      bulletSprite: 'bullet-cyan',
      count: 6,
      speed: 2.0,
      angle: 225,
      spread: 180,
      interval: 50,
      duration: 250,
    },
  ],
  dropTable: DROP_MEDIUM,
};

/** Reflection shard — fast, glass-like projectiles that curve. */
export const REFLECTION_SHARD: EnemyTemplate = {
  type: 'reflection_shard',
  hp: 70,
  sprite: 'enemy-reflection-shard',
  patterns: [
    {
      type: 'aimed',
      bulletSprite: 'bullet-white',
      count: 4,
      speed: 3.0,
      angle: 90,
      spread: 20,
      interval: 40,
      duration: 200,
      modifiers: [{ type: 'curve', value: 2.0 }],
    },
  ],
  dropTable: DROP_SMALL,
};

// ---------------------------------------------------------------------------
// Stage 5 enemies — Burning Carnival
// ---------------------------------------------------------------------------

/** Flame dancer — fires chaotic overlapping radial + aimed patterns. */
export const FLAME_DANCER: EnemyTemplate = {
  type: 'flame_dancer',
  hp: 150,
  sprite: 'enemy-flame-dancer',
  patterns: [
    {
      type: 'radial',
      bulletSprite: 'bullet-orange',
      count: 16,
      speed: 1.8,
      angle: 0,
      spread: 360,
      interval: 35,
      duration: 300,
      modifiers: [{ type: 'rotate', value: 5 }],
    },
    {
      type: 'aimed',
      bulletSprite: 'bullet-red',
      count: 3,
      speed: 3.0,
      angle: 90,
      spread: 20,
      interval: 25,
      duration: 300,
    },
  ],
  dropTable: DROP_LARGE,
};

/** Carnival puppet — erratic movement, fires in bursts with delays. */
export const CARNIVAL_PUPPET: EnemyTemplate = {
  type: 'carnival_puppet',
  hp: 110,
  sprite: 'enemy-carnival-puppet',
  patterns: [
    {
      type: 'stream',
      bulletSprite: 'bullet-yellow',
      count: 5,
      speed: 2.5,
      angle: 90,
      spread: 60,
      interval: 15,
      duration: 180,
      modifiers: [{ type: 'delay', value: 0, delay: 60 }],
    },
  ],
  dropTable: DROP_MEDIUM,
};

// ---------------------------------------------------------------------------
// Stage 6 enemies — The Rift Core
// ---------------------------------------------------------------------------

/** Void weaver — elite enemy with dense rotating spirals. */
export const VOID_WEAVER: EnemyTemplate = {
  type: 'void_weaver',
  hp: 200,
  sprite: 'enemy-void-weaver',
  patterns: [
    {
      type: 'spiral',
      bulletSprite: 'bullet-purple',
      count: 5,
      speed: 2.0,
      angle: 0,
      spread: 360,
      interval: 6,
      duration: 360,
      modifiers: [
        { type: 'rotate', value: 4 },
        { type: 'accelerate', value: 0.3, delay: 40 },
      ],
    },
  ],
  dropTable: DROP_ELITE,
};

/** Rift fragment — crystalline entity, fires geometric walls + aimed bursts. */
export const RIFT_FRAGMENT: EnemyTemplate = {
  type: 'rift_fragment',
  hp: 180,
  sprite: 'enemy-rift-fragment',
  patterns: [
    {
      type: 'wall',
      bulletSprite: 'bullet-cyan',
      count: 16,
      speed: 1.8,
      angle: 90,
      spread: 180,
      interval: 30,
      duration: 240,
    },
    {
      type: 'aimed',
      bulletSprite: 'bullet-white',
      count: 6,
      speed: 3.0,
      angle: 90,
      spread: 50,
      interval: 45,
      duration: 240,
    },
  ],
  dropTable: DROP_ELITE,
};

/** Aurora spark — fast, beautiful, fires arcing streams of colour. */
export const AURORA_SPARK: EnemyTemplate = {
  type: 'aurora_spark',
  hp: 140,
  sprite: 'enemy-aurora-spark',
  patterns: [
    {
      type: 'stream',
      bulletSprite: 'bullet-cyan',
      count: 3,
      speed: 2.8,
      angle: 90,
      spread: 30,
      interval: 10,
      duration: 300,
      modifiers: [
        { type: 'curve', value: 3.0 },
        { type: 'rotate', value: 2 },
      ],
    },
  ],
  dropTable: DROP_LARGE,
};

// ---------------------------------------------------------------------------
// Registry — all templates by type key
// ---------------------------------------------------------------------------

export const ENEMY_TEMPLATES: Record<string, EnemyTemplate> = {
  fairy_basic: FAIRY_BASIC,
  fairy_radial: FAIRY_RADIAL,
  fairy_spiral: FAIRY_SPIRAL,
  fairy_wall: FAIRY_WALL,
  ink_spirit: INK_SPIRIT,
  page_phantom: PAGE_PHANTOM,
  gear_drone: GEAR_DRONE,
  spring_sentinel: SPRING_SENTINEL,
  mirror_wisp: MIRROR_WISP,
  reflection_shard: REFLECTION_SHARD,
  flame_dancer: FLAME_DANCER,
  carnival_puppet: CARNIVAL_PUPPET,
  void_weaver: VOID_WEAVER,
  rift_fragment: RIFT_FRAGMENT,
  aurora_spark: AURORA_SPARK,
};
