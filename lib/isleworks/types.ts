/**
 * Isleworks — the data model.
 *
 * One island, one square grid, one monthly tick. Everything the simulation
 * reads or writes is described here so the renderer, the HUD and the tests all
 * agree on the same vocabulary.
 *
 * Two shapes matter most:
 *
 *  - `Tile` is the *board*. It carries terrain plus the four derived fields the
 *    whole game is really about — power, water, pollution/noise and land value.
 *    Nothing in `Tile` is authored by hand except `terrainType`/`elevation`
 *    (generated once) and `unlocked` (bought); the rest is recomputed from
 *    scratch every tick, which is why the sim can never drift out of sync with
 *    what is on the board.
 *  - `BuildingDefinition` is the *catalogue* entry (static, shared) and
 *    `BuildingInstance` is the *placed thing* (mutable, per-city). Keeping them
 *    apart is what lets a save file be a list of `{definitionId, x, y}` rather
 *    than a copy of the catalogue.
 *
 * Pure types + pure data only — this module is imported by both the client
 * bundle and the tests.
 */

export type TerrainType = 'grass' | 'sand' | 'water' | 'forest' | 'rock' | 'snow';

export type RoadDirection = 'n' | 'e' | 's' | 'w';

export type BuildingCategory =
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'civic'
  | 'utility'
  | 'transport'
  | 'recreation'
  | 'decoration';

/** What a building contributes to citizens' day-to-day needs. */
export type ServiceKind = 'health' | 'education' | 'safety' | 'fire' | 'leisure';

export interface Tile {
  x: number;
  y: number;
  terrainType: TerrainType;
  /** 0 = sea level shelf, 1 = the island plate, 2+ = hills. */
  elevation: number;
  occupied: boolean;
  buildingId?: string;
  /** Which sides this tile's road meets another road on (empty when no road). */
  roadConnections: RoadDirection[];
  hasPower: boolean;
  hasWater: boolean;
  /** 0–100, diffused from emitters. */
  pollution: number;
  /** 0–100, mostly traffic and industry. */
  noise: number;
  /** 0–100, the score residential upgrades and tax yield read. */
  landValue: number;
  /** Traffic load on this tile's road, 0–100. */
  traffic: number;
  unlocked: boolean;
}

export interface Footprint {
  width: number;
  height: number;
}

export interface BuildingDefinition {
  id: string;
  name: string;
  category: BuildingCategory;
  description: string;
  cost: number;
  /** Charged every month the building stands. */
  upkeep: number;
  /** Hidden from the palette until the city reaches this population. */
  unlockPopulation: number;

  footprint: Footprint;

  requiresRoad: boolean;
  requiresPower: boolean;
  requiresWater: boolean;
  /** Pumps and docks: at least one footprint tile must touch water. */
  requiresShore?: boolean;
  /** City hall — exactly one, placed for free at the start. */
  unique?: boolean;

  jobs?: number;
  housing?: number;
  powerGeneration?: number;
  powerConsumption?: number;
  waterGeneration?: number;
  waterConsumption?: number;

  pollution?: number;
  /** Negative values scrub pollution out of the neighbourhood. */
  noise?: number;
  happinessBonus?: number;
  landValueBonus?: number;
  /** Tiles, Chebyshev distance, over which the bonuses/penalties fall off. */
  effectRadius?: number;
  /** Which citizen need this building answers, if any. */
  service?: ServiceKind;
  /** Strength of that service, in "citizens comfortably covered". */
  serviceCapacity?: number;

  modelId: string;
  /** Lucide icon name for the palette card. */
  iconId: string;
  /** Later definitions this one can grow into (visual + capacity levels). */
  upgradeChain?: string[];
}

export type BuildingWarning =
  'no-road' | 'no-power' | 'no-water' | 'congested' | 'no-workers' | 'polluted' | 'abandoned';

export interface BuildingInstance {
  instanceId: string;
  definitionId: string;
  gridX: number;
  gridY: number;
  /** 0–3, quarter turns. Only matters for models with a front. */
  rotation: number;
  /** 1–3. Residential/commercial grow when land value sustains it. */
  level: number;
  /** 0–1. Decays with pollution and no fire cover; repaired by upkeep. */
  condition: number;
  /** 0–1 multiplier applied to jobs, output and revenue. */
  efficiency: number;
  occupiedResidents: number;
  occupiedJobs: number;
  /** 0–1; below 1 the model is still rising out of the ground. */
  constructionProgress: number;
  /** 0–1 toward the next level. Resets on level-up, decays when conditions slip. */
  levelProgress: number;
  warnings: BuildingWarning[];
  /** Month the building went up — drives the placement animation and history. */
  builtAtMonth: number;
}

/** Everything the sim derives each month. Never authored, always recomputed. */
export interface CityStats {
  population: number;
  housingCapacity: number;
  jobs: number;
  jobsFilled: number;
  workforce: number;
  unemployment: number;

  powerSupply: number;
  powerDemand: number;
  waterSupply: number;
  waterDemand: number;

  /** 0–100 composites. */
  happiness: number;
  landValue: number;
  pollution: number;
  traffic: number;

  /** 0–1 coverage per service. */
  coverage: Record<ServiceKind, number>;

  taxIncome: number;
  tradeIncome: number;
  upkeep: number;
  netIncome: number;
}

export interface CityEventEffect {
  /** Multiplier on every building's power draw. */
  powerDemandScale?: number;
  /** Flat happiness shift, points. */
  happiness?: number;
  /** Multiplier on monthly income. */
  incomeScale?: number;
  /** Flat pollution shift on every tile. */
  pollution?: number;
  /** Multiplier on population growth rate. */
  growthScale?: number;
}

export interface ActiveCityEvent {
  id: string;
  definitionId: string;
  /** Months remaining. Removed at 0. */
  remaining: number;
  effect: CityEventEffect;
  title: string;
  body: string;
  tone: 'good' | 'bad' | 'neutral';
}

export interface ObjectiveProgress {
  id: string;
  complete: boolean;
  /** 0–1, for the progress bar. */
  progress: number;
  claimed: boolean;
}

export type ToolMode =
  | { kind: 'none' }
  | { kind: 'place'; definitionId: string; rotation: number }
  | { kind: 'bulldoze' }
  | { kind: 'buy-land' };

export type GameSpeed = 0 | 1 | 2 | 3;

export interface CityState {
  /** Save-format version — bumped when the shape below changes. */
  version: number;
  seed: number;
  width: number;
  height: number;
  tiles: Tile[];
  buildings: BuildingInstance[];
  money: number;
  /** Percent, 4–20. High yield now, unhappy citizens later. */
  taxRate: number;
  month: number;
  /** 0–1 through the current month, drives the day/night cycle. */
  monthProgress: number;
  stats: CityStats;
  events: ActiveCityEvent[];
  objectives: ObjectiveProgress[];
  /** Parcel indices the player has bought. */
  ownedParcels: number[];
  /** Highest population ever reached — what unlocks read, so a dip never re-locks. */
  peakPopulation: number;
  ledger: { month: number; income: number; population: number; happiness: number }[];
}

export const TILE_SIZE = 1;

/** Chebyshev-radius falloff, 1 at the centre, 0 just past `radius`. */
export function falloff(distance: number, radius: number): number {
  if (radius <= 0) return distance === 0 ? 1 : 0;
  return Math.max(0, 1 - distance / (radius + 1));
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
