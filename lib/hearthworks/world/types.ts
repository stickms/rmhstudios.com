import type { BuildingId, CropId, ItemId } from '../content';
import type { SkinId } from '../skins';

/** One simulation tick is 50 ms of game time (20 Hz — the rate the P2P layer will stream at). */
export const TICK_MS = 50;
export const MIN_WORLD_SIZE = 8;
export const MAX_WORLD_SIZE = 96;
export const START_MONEY = 300;

/** Terrain is stepped like blocks: integer height levels, `LEVEL_HEIGHT` world units each. */
export const MAX_LEVEL = 7;
export const LEVEL_HEIGHT = 0.38;
/** Tiles at or below this level are water, drawn at exactly this level. */
export const WATER_LEVEL = 1;
/** Level of the flat starting meadow. */
export const MEADOW_LEVEL = 3;

export type TerrainKind = 'water' | 'sand' | 'grass' | 'forest' | 'rock';
export type Rot = 0 | 1 | 2 | 3;

export interface Building {
  id: number;
  kind: BuildingId;
  x: number;
  z: number;
  rot: Rot;
  /** Machines (the harvester) keep what they gather here until a player collects it. */
  storage?: Partial<Record<ItemId, number>>;
}

export interface Npc {
  id: number;
  kind: 'customer';
  x: number;
  z: number;
  /** What they came to buy, how many, and how long they will wait (in ticks) before leaving. */
  want: ItemId;
  qty: number;
  patience: number;
  /** A look for the renderer (a skin id's stand-in). */
  look: SkinId;
}

export interface Worker {
  id: number;
  ownerId: string;
  role: 'farmer';
  /** The cottage they live in; they work within a few tiles of it. */
  homeX: number;
  homeZ: number;
  x: number;
  z: number;
  /** What they last planted, so they can replant it. */
  lastCrop: CropId | null;
  nextActTick: number;
  nextWageTick: number;
}

export interface Crop {
  id: number;
  kind: CropId;
  x: number;
  z: number;
  plantedTick: number;
}

export interface PlayerState {
  id: string;
  x: number;
  z: number;
  /** In-game money, whole units only. */
  money: number;
  inventory: Partial<Record<ItemId, number>>;
  /** The skin currently worn. Always one of `ownedSkins`. */
  skin: SkinId;
  ownedSkins: SkinId[];
}

/** Plain, JSON-serialisable data: everything a save or a P2P checkpoint needs. */
export interface World {
  version: 1;
  seed: number;
  size: number;
  tick: number;
  /** Game time not yet consumed by a whole tick. */
  accMs: number;
  /** State of the world's seeded random generator (mulberry32). */
  rng: number;
  nextId: number;
  /** size × size, row-major by z then x. */
  terrain: TerrainKind[];
  /** Block height level of every tile (0..MAX_LEVEL), same layout as `terrain`. */
  height: number[];
  buildings: Building[];
  crops: Crop[];
  players: Record<string, PlayerState>;
  /** Forest tiles that have been picked clean: tile index → tick they are ready again. */
  foraged: Record<string, number>;
  npcs: Npc[];
  workers: Worker[];
}

export type Command =
  | { type: 'join'; playerId: string }
  | { type: 'move'; playerId: string; x: number; z: number }
  | { type: 'place'; playerId: string; kind: BuildingId; x: number; z: number; rot?: Rot }
  | { type: 'remove'; playerId: string; x: number; z: number }
  | { type: 'plant'; playerId: string; crop: CropId; x: number; z: number }
  | { type: 'harvest'; playerId: string; x: number; z: number }
  | { type: 'cook'; playerId: string; recipe: string }
  | { type: 'sell'; playerId: string; item: ItemId; qty: number }
  | { type: 'forage'; playerId: string; x: number; z: number }
  | { type: 'serve'; playerId: string; npcId: number }
  | { type: 'collect'; playerId: string; x: number; z: number }
  | { type: 'hire'; playerId: string; x: number; z: number }
  | { type: 'fire'; playerId: string; workerId: number }
  | { type: 'buySkin'; playerId: string; skin: SkinId }
  | { type: 'setSkin'; playerId: string; skin: SkinId };

export type WorldEvent =
  | { type: 'joined'; playerId: string }
  | { type: 'placed'; building: Building }
  | { type: 'removed'; buildingId: number; refund: number }
  | { type: 'planted'; crop: Crop }
  | { type: 'cropGrew'; cropId: number; stage: number }
  | { type: 'harvested'; playerId: string; item: ItemId; qty: number }
  | { type: 'cooked'; playerId: string; item: ItemId; qty: number }
  | { type: 'sold'; playerId: string; item: ItemId; qty: number; earned: number }
  | { type: 'foraged'; playerId: string; item: ItemId; qty: number }
  | { type: 'customerArrived'; npc: Npc }
  | { type: 'served'; playerId: string; npcId: number; item: ItemId; qty: number; earned: number }
  | { type: 'customerLeft'; npcId: number }
  | { type: 'collected'; playerId: string; items: Partial<Record<ItemId, number>> }
  | { type: 'hired'; worker: Worker }
  | { type: 'workerQuit'; workerId: number; reason: 'unpaid' | 'fired' }
  | { type: 'skinBought'; playerId: string; skin: SkinId; price: number }
  | { type: 'skinChanged'; playerId: string; skin: SkinId }
  | { type: 'rejected'; command: Command['type']; playerId: string; reason: RejectReason };

export type RejectReason =
  | 'unknown-player'
  | 'out-of-bounds'
  | 'bad-terrain'
  | 'occupied'
  | 'nothing-there'
  | 'no-plot'
  | 'not-ripe'
  | 'cannot-afford'
  | 'missing-ingredients'
  | 'no-kitchen'
  | 'no-stall'
  | 'unknown-recipe'
  | 'bad-amount'
  | 'too-far'
  | 'depleted'
  | 'no-such-npc'
  | 'no-cottage'
  | 'too-many-workers'
  | 'unknown-skin'
  | 'already-owned'
  | 'not-owned';
