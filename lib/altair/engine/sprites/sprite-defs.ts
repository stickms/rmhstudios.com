// =============================================================================
// ALTAIR ENGINE -- Sprite Definitions
// =============================================================================
// Central registry mapping every entity type to its sprite sheet and animation
// frames. All sprite sheets use 16x16 pixel frames.
//
// Asset packs used:
// - Ninja Adventure (CC0) — characters, monsters, bosses, items, tiles, VFX
// - 16x16 DungeonTileset II (CC0) — heroes, undead, dungeon tiles
//
// Frame layout conventions:
// - 4x4 grid: cols = directions (DOWN, UP, LEFT, RIGHT), rows = anim frames
// - Frame index = row * 4 + col
// - Idle = first frame of walk-down [0]
// - Character/enemy sheets are 4 cols x 4 rows = 16 frames (64x64 at 16x16)
// - Boss sheets are 4 cols x 3 rows = 12 frames (128x96 at 32x32)
// =============================================================================

import { loadSpriteSheet, type SpriteSheet } from './sprite-loader';
import type { SpriteAnimation, EntitySpriteSet } from './sprite-animator';

const BASE = '/sprites/altair';
const FRAME_SIZE = 16; // base pixel size of all sprites
const ANIM_SPEED = 0.15; // seconds per frame

// ---- Helper: build a 4-directional entity sprite set from a single sheet ----

const entitySpriteCache = new WeakMap<SpriteSheet, EntitySpriteSet>();

function makeEntitySprites(sheet: SpriteSheet): EntitySpriteSet {
  const cached = entitySpriteCache.get(sheet);
  if (cached) return cached;
  // 4x4 grid: cols = directions (DOWN, UP, LEFT, RIGHT), rows = anim frames
  // Frame index = row * 4 + col
  const spriteSet: EntitySpriteSet = {
    idle: {
      sheet,
      frames: [0],
      frameDuration: ANIM_SPEED,
      loop: true,
    },
    walkDown: {
      sheet,
      frames: [0, 4, 8, 12],      // col 0 across rows
      frameDuration: ANIM_SPEED,
      loop: true,
    },
    walkUp: {
      sheet,
      frames: [1, 5, 9, 13],      // col 1 across rows
      frameDuration: ANIM_SPEED,
      loop: true,
    },
    walkSide: {
      sheet,
      frames: [3, 7, 11, 15],     // col 3 (right-facing; flip for left)
      frameDuration: ANIM_SPEED,
      loop: true,
    },
  };
  entitySpriteCache.set(sheet, spriteSet);
  return spriteSet;
}

/** Simple 2-frame idle animation for pickups/props. */
function makeSimpleAnim(sheet: SpriteSheet, frames: number[], speed = 0.3): SpriteAnimation {
  return { sheet, frames, frameDuration: speed, loop: true };
}

// =============================================================================
// SPRITE SHEET LOADING
// =============================================================================
// Sheets are loaded lazily on first access and cached. Call initAllSprites()
// at game startup to preload everything.

// ---- Player class sheets ----
const playerSheets: Record<string, SpriteSheet> = {};
const PLAYER_SHEET_FILES: Record<string, string> = {
  knight: `${BASE}/characters/knight.png`,
  arcanist: `${BASE}/characters/arcanist.png`,
  ranger: `${BASE}/characters/ranger.png`,
  plague_doctor: `${BASE}/characters/plague-doctor.png`,
  berserker: `${BASE}/characters/berserker.png`,
  necromancer: `${BASE}/characters/necromancer.png`,
  chronomancer: `${BASE}/characters/chronomancer.png`,
  hemomancer: `${BASE}/characters/hemomancer.png`,
};

// ---- Enemy sheets ----
const enemySheets: Record<string, SpriteSheet> = {};
const ENEMY_SHEET_FILES: Record<string, string> = {
  shambler: `${BASE}/enemies/shambler.png`,
  bat: `${BASE}/enemies/bat.png`,
  skeleton_warrior: `${BASE}/enemies/skeleton-warrior.png`,
  ghost: `${BASE}/enemies/ghost.png`,
  werewolf: `${BASE}/enemies/werewolf.png`,
  cultist: `${BASE}/enemies/cultist.png`,
  swarm_rat: `${BASE}/enemies/swarm-rat.png`,
  witch: `${BASE}/enemies/witch.png`,
  bone_golem: `${BASE}/enemies/bone-golem.png`,
  shadow: `${BASE}/enemies/shadow.png`,
  vampire_noble: `${BASE}/enemies/vampire-noble.png`,
  arcane_construct: `${BASE}/enemies/arcane-construct.png`,
  plague_bearer: `${BASE}/enemies/plague-bearer.png`,
  death_knight: `${BASE}/enemies/death-knight.png`,
  banshee: `${BASE}/enemies/banshee.png`,
  lich: `${BASE}/enemies/lich.png`,
};

// ---- Boss sheets ----
const bossSheets: Record<string, SpriteSheet> = {};
const BOSS_SHEET_FILES: Record<string, string> = {
  hollow_king: `${BASE}/bosses/hollow-king.png`,
  crimson_countess: `${BASE}/bosses/crimson-countess.png`,
  elder_lich_malachar: `${BASE}/bosses/elder-lich.png`,
  terminus: `${BASE}/bosses/terminus.png`,
};

// ---- Tile sheets ----
let tileSheet: SpriteSheet | null = null;
const TILE_SHEET_FILE = `${BASE}/tiles/tileset.png`;

// ---- Prop sheets ----
let propSheet: SpriteSheet | null = null;
const PROP_SHEET_FILE = `${BASE}/props/props.png`;

// ---- Pickup sheets ----
let pickupSheet: SpriteSheet | null = null;
const PICKUP_SHEET_FILE = `${BASE}/pickups/pickups.png`;

// ---- Projectile sheets ----
let projectileSheet: SpriteSheet | null = null;
const PROJECTILE_SHEET_FILE = `${BASE}/projectiles/projectiles.png`;

// ---- Summon sheet ----
let summonSheet: SpriteSheet | null = null;
const SUMMON_SHEET_FILE = `${BASE}/enemies/skeleton-warrior.png`; // reuse skeleton

// ---- Item icon sheets (for HUD / level-up UI) ----
let weaponIconSheet: SpriteSheet | null = null;
const WEAPON_ICON_SHEET_FILE = `${BASE}/icons/weapon-icons.png`;
export const WEAPON_ICON_SRC = WEAPON_ICON_SHEET_FILE;

let passiveIconSheet: SpriteSheet | null = null;
const PASSIVE_ICON_SHEET_FILE = `${BASE}/icons/passive-icons.png`;
export const PASSIVE_ICON_SRC = PASSIVE_ICON_SHEET_FILE;

// =============================================================================
// INIT + PRELOAD
// =============================================================================

/** Load all sprite sheets. Call once at game startup. */
export function initAllSpriteSheets(): void {
  // Player
  for (const [id, path] of Object.entries(PLAYER_SHEET_FILES)) {
    playerSheets[id] = loadSpriteSheet(path, FRAME_SIZE, FRAME_SIZE);
  }
  // Enemy
  for (const [id, path] of Object.entries(ENEMY_SHEET_FILES)) {
    enemySheets[id] = loadSpriteSheet(path, FRAME_SIZE, FRAME_SIZE);
  }
  // Boss (32x32 sheets for larger sprites)
  for (const [id, path] of Object.entries(BOSS_SHEET_FILES)) {
    bossSheets[id] = loadSpriteSheet(path, 32, 32);
  }
  // Tiles (16x16 tileset)
  tileSheet = loadSpriteSheet(TILE_SHEET_FILE, FRAME_SIZE, FRAME_SIZE);
  // Props (16x16)
  propSheet = loadSpriteSheet(PROP_SHEET_FILE, FRAME_SIZE, FRAME_SIZE);
  // Pickups (16x16)
  pickupSheet = loadSpriteSheet(PICKUP_SHEET_FILE, FRAME_SIZE, FRAME_SIZE);
  // Projectiles (8x8 for small projectiles)
  projectileSheet = loadSpriteSheet(PROJECTILE_SHEET_FILE, 8, 8);
  // Summons
  summonSheet = loadSpriteSheet(SUMMON_SHEET_FILE, FRAME_SIZE, FRAME_SIZE);
  // Item icons (16x16)
  weaponIconSheet = loadSpriteSheet(WEAPON_ICON_SHEET_FILE, FRAME_SIZE, FRAME_SIZE);
  passiveIconSheet = loadSpriteSheet(PASSIVE_ICON_SHEET_FILE, FRAME_SIZE, FRAME_SIZE);
}

/** Get the list of all sprite file entries for preloading with progress. */
export function getAllSpriteEntries(): { src: string; frameWidth: number; frameHeight: number }[] {
  const entries: { src: string; frameWidth: number; frameHeight: number }[] = [];

  for (const path of Object.values(PLAYER_SHEET_FILES)) {
    entries.push({ src: path, frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
  }
  for (const path of Object.values(ENEMY_SHEET_FILES)) {
    entries.push({ src: path, frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
  }
  for (const path of Object.values(BOSS_SHEET_FILES)) {
    entries.push({ src: path, frameWidth: 32, frameHeight: 32 });
  }
  entries.push({ src: TILE_SHEET_FILE, frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
  entries.push({ src: PROP_SHEET_FILE, frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
  entries.push({ src: PICKUP_SHEET_FILE, frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
  entries.push({ src: PROJECTILE_SHEET_FILE, frameWidth: 8, frameHeight: 8 });
  entries.push({ src: WEAPON_ICON_SHEET_FILE, frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
  entries.push({ src: PASSIVE_ICON_SHEET_FILE, frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });

  return entries;
}

// =============================================================================
// ACCESSORS
// =============================================================================

/** Get directional sprite set for a player class. Returns null if not loaded. */
export function getPlayerSprites(classId: string): EntitySpriteSet | null {
  const sheet = playerSheets[classId];
  if (!sheet?.loaded) return null;
  return makeEntitySprites(sheet);
}

/** Get directional sprite set for an enemy. Returns null if not loaded. */
export function getEnemySprites(defId: string): EntitySpriteSet | null {
  const sheet = enemySheets[defId];
  if (!sheet?.loaded) return null;
  return makeEntitySprites(sheet);
}

/** Get directional sprite set for a boss. Returns null if not loaded. */
export function getBossSprites(bossId: string): EntitySpriteSet | null {
  const sheet = bossSheets[bossId];
  if (!sheet?.loaded) return null;
  // Bosses use 32x32 sheets but same frame layout
  return makeEntitySprites(sheet);
}

/** Get the tile sprite sheet. */
export function getTileSheet(): SpriteSheet | null {
  return tileSheet?.loaded ? tileSheet : null;
}

/** Get the prop sprite sheet. */
export function getPropSheet(): SpriteSheet | null {
  return propSheet?.loaded ? propSheet : null;
}

/** Get the pickup sprite sheet. */
export function getPickupSheet(): SpriteSheet | null {
  return pickupSheet?.loaded ? pickupSheet : null;
}

/** Get the projectile sprite sheet. */
export function getProjectileSheet(): SpriteSheet | null {
  return projectileSheet?.loaded ? projectileSheet : null;
}

/** Get the summon (skeleton) sprite set. */
export function getSummonSprites(): EntitySpriteSet | null {
  if (!summonSheet?.loaded) return null;
  return makeEntitySprites(summonSheet);
}

// =============================================================================
// PICKUP FRAME MAPPING
// =============================================================================
// The pickups.png sheet layout (row-major, 16x16 each):
//   0 = xp_small (blue gem)     1 = xp_medium (green gem)
//   2 = xp_large (red gem)      3 = coin
//   4 = food (drumstick)        5 = magnet
//   6 = vacuum                  7 = rosary
//   8 = chest                   9 = chest (open, unused)

export const PICKUP_FRAMES: Record<string, number> = {
  xp_small: 0,
  xp_medium: 1,
  xp_large: 2,
  coin: 3,
  food: 4,
  magnet: 5,
  vacuum: 6,
  rosary: 7,
  chest: 8,
};

// =============================================================================
// TILE FRAME MAPPING
// =============================================================================
// The tileset.png layout (row-major, 16x16 each):
//   Row 0: dark_grass variants (0-3)
//   Row 1: cracked_stone variants (4-7)
//   Row 2: graveyard_path variants (8-11)

export const TILE_FRAMES: Record<string, number[]> = {
  dark_grass: [0, 1, 2, 3],
  cracked_stone: [4, 5, 6, 7],
  graveyard_path: [8, 9],  // frames 10,11 removed (looked like obstacles)
};

// =============================================================================
// PROP FRAME MAPPING
// =============================================================================
// The props.png layout:
//   0 = tombstone   1 = barrel   2 = urn
//   3 = tombstone damaged  4 = barrel damaged  5 = urn damaged

export const PROP_FRAMES: Record<string, number> = {
  tombstone: 0,
  barrel: 1,
  urn: 2,
};

export const PROP_DAMAGED_FRAMES: Record<string, number> = {
  tombstone: 3,
  barrel: 4,
  urn: 5,
};

// =============================================================================
// SCALE FACTORS
// =============================================================================
// Sprites are 16x16 base. We scale them to match the existing entity radii.

/** Scale for a player sprite. Player radius is 12, so 24px diameter. 16→24 = 1.5x */
export const PLAYER_SCALE = 2;

/** Calculate enemy scale from radius. Radius 10→20px diameter. 16→20 ~= 1.25x */
export function getEnemyScale(radius: number): number {
  return Math.max(1, (radius * 2) / FRAME_SIZE);
}

/** Boss scale from radius. Bosses use 32x32 sheets. */
export function getBossScale(radius: number): number {
  return Math.max(1, (radius * 2) / 32);
}

/** Pickup scale — consistent small size. */
export const PICKUP_SCALE = 1.5;

/** Prop scale — slightly larger than tiles. */
export const PROP_SCALE = 2;

/** Summon scale. */
export const SUMMON_SCALE = 1.5;

/** Projectile scale — small. Projectile sheets are 8x8. */
export function getProjectileScale(radius: number): number {
  return Math.max(1, (radius * 2) / 8);
}
