import type { BuildingId, CropId, ItemId } from '../content';

/** One simulation tick is 50 ms of game time (20 Hz — the rate the P2P layer will stream at). */
export const TICK_MS = 50;
export const MIN_WORLD_SIZE = 8;
export const MAX_WORLD_SIZE = 96;
export const START_MONEY = 300;

export type TerrainKind = 'grass' | 'forest' | 'water';
export type Rot = 0 | 1 | 2 | 3;

export interface Building {
  id: number;
  kind: BuildingId;
  x: number;
  z: number;
  rot: Rot;
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
  buildings: Building[];
  crops: Crop[];
  players: Record<string, PlayerState>;
}

export type Command =
  | { type: 'join'; playerId: string }
  | { type: 'move'; playerId: string; x: number; z: number }
  | { type: 'place'; playerId: string; kind: BuildingId; x: number; z: number; rot?: Rot }
  | { type: 'remove'; playerId: string; x: number; z: number }
  | { type: 'plant'; playerId: string; crop: CropId; x: number; z: number }
  | { type: 'harvest'; playerId: string; x: number; z: number }
  | { type: 'cook'; playerId: string; recipe: string }
  | { type: 'sell'; playerId: string; item: ItemId; qty: number };

export type WorldEvent =
  | { type: 'joined'; playerId: string }
  | { type: 'placed'; building: Building }
  | { type: 'removed'; buildingId: number; refund: number }
  | { type: 'planted'; crop: Crop }
  | { type: 'cropGrew'; cropId: number; stage: number }
  | { type: 'harvested'; playerId: string; item: ItemId; qty: number }
  | { type: 'cooked'; playerId: string; item: ItemId; qty: number }
  | { type: 'sold'; playerId: string; item: ItemId; qty: number; earned: number }
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
  | 'bad-amount';
