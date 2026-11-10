/** The city layer's command handlers: laying roads, painting zones, placing utilities, claiming milestones. */

import {
  MILESTONES,
  isTaxRate,
  ROAD_COST,
  ROAD_REFUND,
  ROAD_RUN_MAX,
  UTILITIES,
  ZONES,
  ZONE_BRUSH_MAX,
  type UtilityId,
} from '../content';
import { agentOnTile } from './agents';
import { CELL_ROAD, cellLevel, cellRoad, cellUtility, cellZone, packCell } from './city-cells';
import type { CityCommand } from './city-types';
import { touchCity, utilityUnlocked, zoneUnlocked } from './city';
import { buildingAt, inBounds, tileIndex } from './helpers';
import type { PlayerState, RejectReason, World, WorldEvent } from './types';

type Result = RejectReason | null;
type Cmd<T extends CityCommand['type']> = Extract<CityCommand, { type: T }>;

/** Why a tile cannot take something new, or null if it can. Water, trees and rock are not for building on. */
function blockedReason(w: World, x: number, z: number): Result {
  if (!inBounds(w, x, z)) return 'out-of-bounds';
  const t = w.terrain[tileIndex(w, x, z)];
  if (t !== 'grass' && t !== 'sand') return 'bad-terrain';
  if (buildingAt(w, x, z)) return 'occupied';
  return null;
}

const standingOn = (w: World, x: number, z: number): boolean =>
  Object.values(w.players).some((o) => Math.round(o.x) === x && Math.round(o.z) === z) ||
  agentOnTile(w, x, z);

/** The tiles of a straight run, or why it is not one. */
function runTiles(c: {
  x: number;
  z: number;
  x2?: number;
  z2?: number;
}): { x: number; z: number }[] | RejectReason {
  if (c.x2 === undefined && c.z2 === undefined) return [{ x: c.x, z: c.z }];
  if (c.x2 === undefined || c.z2 === undefined) return 'bad-shape';
  if (c.x !== c.x2 && c.z !== c.z2) return 'bad-shape';
  const len = Math.max(Math.abs(c.x2 - c.x), Math.abs(c.z2 - c.z)) + 1;
  if (!Number.isFinite(len) || len > ROAD_RUN_MAX) return 'bad-amount';
  const sx = Math.sign(c.x2 - c.x);
  const sz = Math.sign(c.z2 - c.z);
  return Array.from({ length: len }, (_, k) => ({ x: c.x + sx * k, z: c.z + sz * k }));
}

/** The tiles of a rectangular brush stroke (corners inclusive, any order), or why it is not one. */
function rectTiles(c: {
  x: number;
  z: number;
  x2?: number;
  z2?: number;
}): { x: number; z: number }[] | RejectReason {
  const x2 = c.x2 ?? c.x;
  const z2 = c.z2 ?? c.z;
  if (![c.x, c.z, x2, z2].every(Number.isInteger)) return 'out-of-bounds';
  const x0 = Math.min(c.x, x2);
  const x1 = Math.max(c.x, x2);
  const z0 = Math.min(c.z, z2);
  const z1 = Math.max(c.z, z2);
  if ((x1 - x0 + 1) * (z1 - z0 + 1) > ZONE_BRUSH_MAX) return 'bad-amount';
  const out: { x: number; z: number }[] = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push({ x, z });
  return out;
}

/** Lay road tiles along a run. Roads already there are skipped; the run stops at the first tile that cannot take one. */
export function placeRoad(
  w: World,
  p: PlayerState,
  cmd: Cmd<'placeRoad'>,
  ev: WorldEvent[],
): Result {
  const tiles = runTiles(cmd);
  if (typeof tiles === 'string') return tiles;
  const c = w.city;
  let placed = 0;
  let fail: Result = null;
  for (const t of tiles) {
    const bad = blockedReason(w, t.x, t.z);
    if (bad) {
      fail = bad;
      break;
    }
    const i = tileIndex(w, t.x, t.z);
    const cell = c.cells[i];
    if (cellRoad(cell)) continue;
    if (cellLevel(cell) > 0 || cellUtility(cell)) {
      fail = 'occupied';
      break;
    }
    if (p.money < ROAD_COST) {
      fail = 'cannot-afford';
      break;
    }
    p.money -= ROAD_COST;
    c.cells[i] = CELL_ROAD; // an empty zone under a new road is simply paved over
    c.roadCount++;
    placed++;
  }
  if (placed === 0) return fail;
  touchCity(w);
  ev.push({ type: 'roadsLaid', playerId: p.id, count: placed, cost: placed * ROAD_COST });
  return null;
}

export function removeRoad(
  w: World,
  p: PlayerState,
  cmd: Cmd<'removeRoad'>,
  ev: WorldEvent[],
): Result {
  const tiles = runTiles(cmd);
  if (typeof tiles === 'string') return tiles;
  const c = w.city;
  let removed = 0;
  for (const t of tiles) {
    if (!inBounds(w, t.x, t.z))
      return removed === 0 ? 'out-of-bounds' : finishRemove(w, p, ev, removed);
    const i = tileIndex(w, t.x, t.z);
    if (!cellRoad(c.cells[i])) continue;
    c.cells[i] = 0;
    c.roadCount--;
    p.money += ROAD_REFUND;
    removed++;
  }
  return removed === 0 ? 'nothing-there' : finishRemove(w, p, ev, removed);
}

function finishRemove(w: World, p: PlayerState, ev: WorldEvent[], removed: number): Result {
  touchCity(w);
  ev.push({ type: 'roadsRemoved', playerId: p.id, count: removed, refund: removed * ROAD_REFUND });
  return null;
}

/** Paint a zone over a rectangle of open grass. Tiles that cannot take it are skipped; painting stops when the money does. */
export function zone(w: World, p: PlayerState, cmd: Cmd<'zone'>, ev: WorldEvent[]): Result {
  if (!zoneUnlocked(w, cmd.zone)) return 'locked';
  const tiles = rectTiles(cmd);
  if (typeof tiles === 'string') return tiles;
  const c = w.city;
  const cost = ZONES[cmd.zone].cost;
  let painted = 0;
  let fail: Result = null;
  for (const t of tiles) {
    if (!inBounds(w, t.x, t.z)) {
      fail ??= 'out-of-bounds';
      continue;
    }
    const i = tileIndex(w, t.x, t.z);
    if (w.terrain[i] !== 'grass') {
      fail ??= 'bad-terrain';
      continue;
    }
    const cell = c.cells[i];
    if (
      buildingAt(w, t.x, t.z) ||
      cellRoad(cell) ||
      cellUtility(cell) ||
      cellLevel(cell) > 0 ||
      cellZone(cell) === cmd.zone
    ) {
      fail ??= 'occupied';
      continue;
    }
    if (p.money < cost) {
      fail ??= 'cannot-afford';
      break;
    }
    p.money -= cost;
    c.cells[i] = packCell({ zone: cmd.zone });
    painted++;
  }
  if (painted === 0) return fail ?? 'nothing-there';
  touchCity(w);
  ev.push({ type: 'zoned', playerId: p.id, zone: cmd.zone, count: painted, cost: painted * cost });
  return null;
}

/** Clear zoning over a rectangle. An empty zone is refunded half; a developed lot is torn down for nothing. */
export function unzone(w: World, p: PlayerState, cmd: Cmd<'unzone'>, ev: WorldEvent[]): Result {
  const tiles = rectTiles(cmd);
  if (typeof tiles === 'string') return tiles;
  const c = w.city;
  let cleared = 0;
  for (const t of tiles) {
    if (!inBounds(w, t.x, t.z)) continue;
    const i = tileIndex(w, t.x, t.z);
    const zn = cellZone(c.cells[i]);
    if (!zn) continue;
    if (cellLevel(c.cells[i]) === 0) p.money += Math.floor(ZONES[zn].cost / 2);
    c.cells[i] = 0;
    cleared++;
  }
  if (cleared === 0) return 'nothing-there';
  touchCity(w);
  ev.push({ type: 'unzoned', playerId: p.id, count: cleared });
  return null;
}

export function placeUtility(
  w: World,
  p: PlayerState,
  cmd: Cmd<'placeUtility'>,
  ev: WorldEvent[],
): Result {
  const kind: UtilityId = cmd.kind;
  const def = UTILITIES[kind];
  if (!def) return 'nothing-there';
  if (!utilityUnlocked(w, kind)) return 'locked';
  const bad = blockedReason(w, cmd.x, cmd.z);
  if (bad) return bad;
  const i = tileIndex(w, cmd.x, cmd.z);
  const cell = w.city.cells[i];
  if (cellRoad(cell) || cellUtility(cell) || cellLevel(cell) > 0) return 'occupied';
  if (standingOn(w, cmd.x, cmd.z)) return 'occupied';
  if (def.needsShore) {
    const shore = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ].some(
      ([dx, dz]) =>
        inBounds(w, cmd.x + dx, cmd.z + dz) &&
        w.terrain[tileIndex(w, cmd.x + dx, cmd.z + dz)] === 'water',
    );
    if (!shore) return 'no-shore';
  }
  if (p.money < def.cost) return 'cannot-afford';
  p.money -= def.cost;
  w.city.cells[i] = packCell({ utility: kind }); // an empty zone under it is cleared
  touchCity(w);
  ev.push({ type: 'utilityPlaced', playerId: p.id, kind, x: cmd.x, z: cmd.z });
  return null;
}

export function removeUtility(
  w: World,
  p: PlayerState,
  cmd: Cmd<'removeUtility'>,
  ev: WorldEvent[],
): Result {
  if (!inBounds(w, cmd.x, cmd.z)) return 'out-of-bounds';
  const i = tileIndex(w, cmd.x, cmd.z);
  const kind = cellUtility(w.city.cells[i]);
  if (!kind) return 'nothing-there';
  p.money += Math.floor(UTILITIES[kind].cost / 2);
  w.city.cells[i] = 0;
  touchCity(w);
  ev.push({ type: 'utilityRemoved', playerId: p.id, x: cmd.x, z: cmd.z });
  return null;
}

/** Collect a reached milestone's reward (money, and a look if it has one). The first player to claim it gets it. */
export function claimMilestone(
  w: World,
  p: PlayerState,
  cmd: Cmd<'claimMilestone'>,
  ev: WorldEvent[],
): Result {
  const def = MILESTONES.find((m) => m.id === cmd.id);
  if (!def) return 'unknown-milestone';
  const c = w.city;
  if (!c.reached.includes(def.id)) return 'not-reached';
  if (c.claimed.includes(def.id)) return 'already-claimed';
  c.claimed.push(def.id);
  p.money += def.reward;
  let skin: string | null = null;
  if (def.rewardSkin && !p.ownedSkins.includes(def.rewardSkin)) {
    p.ownedSkins.push(def.rewardSkin);
    skin = def.rewardSkin;
  }
  ev.push({ type: 'milestoneClaimed', playerId: p.id, id: def.id, reward: def.reward, skin });
  return null;
}

/**
 * Set the town's tax rate (a whole percent inside the content range). The rate belongs to the town, not to a player,
 * so any player may change it; the last command in tick order wins, which every replica agrees on. Setting the rate
 * it already has changes nothing and says nothing.
 */
export function setTaxRate(
  w: World,
  p: PlayerState,
  cmd: Cmd<'setTaxRate'>,
  ev: WorldEvent[],
): Result {
  if (!isTaxRate(cmd.rate)) return 'bad-amount';
  const from = w.city.taxRate;
  if (cmd.rate === from) return null;
  w.city.taxRate = cmd.rate;
  touchCity(w);
  ev.push({ type: 'taxRateSet', playerId: p.id, rate: cmd.rate, from });
  return null;
}
