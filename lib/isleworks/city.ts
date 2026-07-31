/**
 * Isleworks — city lifecycle: new game, save, load.
 *
 * The save format stores **only what cannot be recomputed**: the seed, the
 * placed buildings, the treasury, and the handful of counters that carry
 * history (month, peak population, claimed objectives). Terrain comes back from
 * `generateIsland(seed)` and every derived field comes back from one call to
 * `recomputeDerived`. A finished city is a few kilobytes of JSON, and a save can
 * never disagree with the simulation because it does not contain any of the
 * simulation's output.
 *
 * Loading is defensive on purpose: a save written by an older build, or edited
 * by hand, drops the parts it cannot understand rather than throwing the whole
 * city away. Anything referencing a building id that no longer exists is
 * skipped.
 */

import { CITY_HALL_ID, STARTING_MONEY, tryGetDefinition } from './catalog';
import { PARCEL_SIZE, index, parcelBounds, parcelIndexFor, parcelsAcross } from './grid';
import { evaluateObjectives, initialObjectives } from './objectives';
import { emptyStats, recomputeDerived } from './simulation';
import { DEFAULT_HEIGHT, DEFAULT_WIDTH, generateIsland } from './terrain';
import type { BuildingInstance, CityState } from './types';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'isleworks:city';

let instanceCounter = 0;

export function newInstanceId(): string {
  instanceCounter += 1;
  return `b${instanceCounter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function makeInstance(
  definitionId: string,
  gridX: number,
  gridY: number,
  rotation: number,
  month: number,
): BuildingInstance {
  return {
    instanceId: newInstanceId(),
    definitionId,
    gridX,
    gridY,
    rotation,
    level: 1,
    condition: 1,
    efficiency: 1,
    occupiedResidents: 0,
    occupiedJobs: 0,
    constructionProgress: 0,
    levelProgress: 0,
    warnings: [],
    builtAtMonth: month,
  };
}

/** Unlock a parcel's tiles. Water inside a bought parcel stays water, of course. */
export function unlockParcel(state: CityState, parcel: number): void {
  const { x0, y0, x1, y1 } = parcelBounds(parcel, state.width, state.height);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) state.tiles[index(x, y, state.width)].unlocked = true;
  }
  if (!state.ownedParcels.includes(parcel)) state.ownedParcels.push(parcel);
}

/**
 * A fresh island.
 *
 * The starting grant is four central parcels, a city hall and a short stub of
 * road. The road is placed for the player because "nothing works until you draw
 * a road" is the game's one non-obvious rule, and showing it beats stating it.
 */
export function createCity(seed = Math.floor(Math.random() * 1e9)): CityState {
  const width = DEFAULT_WIDTH;
  const height = DEFAULT_HEIGHT;
  const state: CityState = {
    version: SAVE_VERSION,
    seed,
    width,
    height,
    tiles: generateIsland(seed, width, height),
    buildings: [],
    money: STARTING_MONEY,
    taxRate: 9,
    month: 1,
    monthProgress: 0,
    stats: emptyStats(),
    events: [],
    objectives: initialObjectives(),
    ownedParcels: [],
    peakPopulation: 0,
    ledger: [],
  };

  // The four parcels around the middle of the board.
  const across = parcelsAcross(width);
  const midParcel = Math.floor(across / 2);
  for (const py of [midParcel - 1, midParcel]) {
    for (const px of [midParcel - 1, midParcel]) unlockParcel(state, py * across + px);
  }

  const hallX = Math.floor(width / 2) - 1;
  const hallY = Math.floor(height / 2) - 1;
  state.buildings.push(makeInstance(CITY_HALL_ID, hallX, hallY, 0, 1));

  for (let i = 0; i < 5; i++) {
    const x = hallX + 2;
    const y = hallY - 1 + i;
    const tile = state.tiles[index(x, y, width)];
    if (!tile || tile.terrainType === 'water' || tile.occupied) continue;
    state.buildings.push(makeInstance('road', x, y, 0, 1));
  }

  for (const building of state.buildings) building.constructionProgress = 1;

  recomputeDerived(state);
  state.objectives = evaluateObjectives(state);
  return state;
}

/* ── Persistence ───────────────────────────────────────────────────────────*/

interface SavedBuilding {
  d: string;
  x: number;
  y: number;
  r: number;
  l: number;
  c: number;
  m: number;
}

interface SavedCity {
  v: number;
  seed: number;
  money: number;
  taxRate: number;
  month: number;
  population: number;
  peak: number;
  parcels: number[];
  buildings: SavedBuilding[];
  claimed: string[];
  completed: string[];
}

export function serializeCity(state: CityState): string {
  const payload: SavedCity = {
    v: SAVE_VERSION,
    seed: state.seed,
    money: Math.round(state.money),
    taxRate: state.taxRate,
    month: state.month,
    population: state.stats.population,
    peak: state.peakPopulation,
    parcels: [...state.ownedParcels],
    buildings: state.buildings.map((b) => ({
      d: b.definitionId,
      x: b.gridX,
      y: b.gridY,
      r: b.rotation,
      l: b.level,
      c: Math.round(b.condition * 100) / 100,
      m: b.builtAtMonth,
    })),
    claimed: state.objectives.filter((o) => o.claimed).map((o) => o.id),
    completed: state.objectives.filter((o) => o.complete).map((o) => o.id),
  };
  return JSON.stringify(payload);
}

export function deserializeCity(raw: string): CityState | null {
  let payload: SavedCity;
  try {
    payload = JSON.parse(raw) as SavedCity;
  } catch {
    return null;
  }
  if (!payload || typeof payload.seed !== 'number' || payload.v !== SAVE_VERSION) return null;

  const state = createCity(payload.seed);
  state.buildings = [];
  state.ownedParcels = [];

  for (const parcel of payload.parcels ?? []) {
    if (typeof parcel === 'number') unlockParcel(state, parcel);
  }

  for (const saved of payload.buildings ?? []) {
    if (!tryGetDefinition(saved.d)) continue;
    const instance = makeInstance(saved.d, saved.x, saved.y, saved.r ?? 0, saved.m ?? 1);
    instance.level = Math.min(3, Math.max(1, saved.l ?? 1));
    instance.condition = Math.min(1, Math.max(0, saved.c ?? 1));
    instance.constructionProgress = 1;
    state.buildings.push(instance);
  }

  state.money = Number.isFinite(payload.money) ? payload.money : STARTING_MONEY;
  state.taxRate = Math.min(20, Math.max(4, payload.taxRate ?? 9));
  state.month = Math.max(1, payload.month ?? 1);
  state.peakPopulation = Math.max(0, payload.peak ?? 0);
  state.stats.population = Math.max(0, payload.population ?? 0);

  const claimed = new Set(payload.claimed ?? []);
  const completed = new Set(payload.completed ?? []);
  state.objectives = state.objectives.map((o) => ({
    ...o,
    claimed: claimed.has(o.id),
    complete: completed.has(o.id) || claimed.has(o.id),
  }));

  recomputeDerived(state);
  state.objectives = evaluateObjectives(state);
  return state;
}

export function loadCity(): CityState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? deserializeCity(raw) : null;
  } catch {
    return null;
  }
}

export function saveCity(state: CityState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAVE_KEY, serializeCity(state));
  } catch {
    /* Private mode or a full quota — the city keeps playing, it just won't persist. */
  }
}

export function clearSave(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    /* no-op */
  }
}

/** Which parcels are adjacent to something already owned — the only ones for sale. */
export function purchasableParcels(state: CityState): number[] {
  const across = parcelsAcross(state.width);
  const down = Math.ceil(state.height / PARCEL_SIZE);
  const owned = new Set(state.ownedParcels);
  const out = new Set<number>();
  for (const parcel of state.ownedParcels) {
    const px = parcel % across;
    const py = Math.floor(parcel / across);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = px + dx;
      const ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= across || ny >= down) continue;
      const candidate = ny * across + nx;
      if (!owned.has(candidate)) out.add(candidate);
    }
  }
  return [...out];
}

/** How many tiles in a parcel could actually be built on — drives its price. */
export function buildableTilesIn(state: CityState, parcel: number): number {
  const { x0, y0, x1, y1 } = parcelBounds(parcel, state.width, state.height);
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (state.tiles[index(x, y, state.width)].terrainType !== 'water') count++;
    }
  }
  return count;
}

export { parcelIndexFor };
