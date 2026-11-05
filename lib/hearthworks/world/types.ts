import type { BuildingId, CropId, ItemId } from '../content';
import type { Mover } from '../nav/mover';
import type { SkinId } from '../skins';
import type { Arms, CrimeCommand, CrimeEvent, CrimeReject, Officer } from './crime-types';
import type { CityCommand, CityEvent, CityReject, CityState } from './city-types';

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

/** Where a customer is in their visit: walking to the stall, standing at it, or walking back to where they came from. */
export type CustomerMode = 'arriving' | 'waiting' | 'leaving';

/** A customer: a `Mover` (position, route, facing) plus what they came for. */
export interface Npc extends Mover {
  id: number;
  kind: 'customer';
  /** What they came to buy, how many, and how long they will wait (in ticks) before leaving. Counts down only while waiting. */
  want: ItemId;
  qty: number;
  patience: number;
  /** A look for the renderer (a skin id's stand-in). */
  look: SkinId;
  mode: CustomerMode;
  /** The stall they came to, and the tile beside it they are (or were) heading for. */
  stallId: number;
  serviceX: number;
  serviceZ: number;
  /** The shore tile they walked in from, and walk back to. */
  gateX: number;
  gateZ: number;
  /** Ticks spent waiting for someone else to get out of the way. */
  stuck: number;
}

/** A farmhand's day: resting at the cottage, walking to a job, doing it, walking back. */
export type WorkerState = 'home' | 'toWork' | 'working' | 'toHome';

export interface WorkerTask {
  kind: 'harvest' | 'plant';
  x: number;
  z: number;
}

export interface Worker extends Mover {
  id: number;
  ownerId: string;
  role: 'farmer';
  /** The cottage they live in; they work within a few tiles of it. */
  homeX: number;
  homeZ: number;
  /** What they last planted, so they can replant it. */
  lastCrop: CropId | null;
  /** The earliest tick they will look for work again. */
  nextActTick: number;
  nextWageTick: number;
  state: WorkerState;
  task: WorkerTask | null;
  /** Ticks of work left on the current task. */
  workLeft: number;
  stuck: number;
  /** Jobs that could not be reached, and until when to leave them alone. */
  avoid: { x: number; z: number; until: number }[];
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
  /** Health, 0..MAX_HP (world/crime.ts). */
  hp: number;
  /** How wanted they are, 0..100 (world/crime.ts). */
  heat: number;
  /** Guns, ammo and combat clocks. */
  arms: Arms;
}

/** Plain, JSON-serialisable data: everything a save or a P2P checkpoint needs. */
export interface World {
  version: 2;
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
  /** The police on the island (world/police.ts). */
  officers: Officer[];
  /** Forest tiles that have been picked clean: tile index → tick they are ready again. */
  foraged: Record<string, number>;
  npcs: Npc[];
  workers: Worker[];
  /** The city layer: roads, zones, utilities, population and milestones (world/city.ts). */
  city: CityState;
}

export type Command =
  | CrimeCommand
  | CityCommand
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
  | CrimeEvent
  | CityEvent
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
  | { type: 'customerLeaving'; npcId: number }
  | { type: 'customerLeft'; npcId: number }
  | { type: 'collected'; playerId: string; items: Partial<Record<ItemId, number>> }
  | { type: 'hired'; worker: Worker }
  | { type: 'workerQuit'; workerId: number; reason: 'unpaid' | 'fired' }
  | { type: 'skinBought'; playerId: string; skin: SkinId; price: number }
  | { type: 'skinChanged'; playerId: string; skin: SkinId }
  | { type: 'rejected'; command: Command['type']; playerId: string; reason: RejectReason };

export type RejectReason =
  | CrimeReject
  | CityReject
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
