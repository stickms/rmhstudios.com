/** The command handlers for the economy layer: foraging, serving customers, collecting from machines, hiring. */

import { BUILDINGS, CROPS, ITEMS, type ItemId } from '../content';
import { doorTile, newBudget, staticBlockers } from './agents';
import { sendHome } from './customers';
import { newFarmhand } from './farmhands';
import { lotLevelAt, zoneAt } from './city-cells';
import { buildingAt, inBounds, tileDistance, tileIndex } from './helpers';
import { nextRandom } from './rng';
import type { Command, PlayerState, RejectReason, World, WorldEvent } from './types';

/** How far a player can reach to pick, serve or collect (tiles). */
export const REACH = 2;
export const SERVE_REACH = 3;
export const FORAGE_COOLDOWN_TICKS = 600;
/** Customers pay this much over the stall price: the premium for having a buyer come to you. */
export const CUSTOMER_PREMIUM = 1.5;
/** Every shop lot in town adds a little foot traffic to what customers pay, up to this much extra. */
export const FOOT_TRAFFIC_BONUS = 0.05;
export const FOOT_TRAFFIC_MAX = 0.3;
/** What a customer pays over the stall price right now. */
export const customerPremium = (w: World): number =>
  CUSTOMER_PREMIUM + Math.min(FOOT_TRAFFIC_MAX, w.city.stats.markets * FOOT_TRAFFIC_BONUS);
/** A home lot must have grown to this level before someone can be hired to live there. */
export const HOME_LOT_HIRE_LEVEL = 2;
export const HIRE_COST = 100;
export const WORKERS_PER_COTTAGE = 2;

const give = (p: PlayerState, item: ItemId, qty: number) => {
  p.inventory[item] = (p.inventory[item] ?? 0) + qty;
};

/** Pick a draw from the world's own generator, so every replica gets the same one. */
function draw(w: World): number {
  const r = nextRandom(w.rng);
  w.rng = r.state;
  return r.value;
}

type Result = RejectReason | null;

export function forage(
  w: World,
  p: PlayerState,
  cmd: Extract<Command, { type: 'forage' }>,
  ev: WorldEvent[],
): Result {
  if (!inBounds(w, cmd.x, cmd.z)) return 'out-of-bounds';
  const i = tileIndex(w, cmd.x, cmd.z);
  if (w.terrain[i] !== 'forest') return 'nothing-there';
  if (tileDistance(p.x, p.z, cmd.x, cmd.z) > REACH) return 'too-far';
  if ((w.foraged[i] ?? 0) > w.tick) return 'depleted';
  const roll = draw(w);
  const item: ItemId = roll < 0.5 ? 'berries' : roll < 0.8 ? 'herbs' : 'mushroom';
  const qty = 1 + Math.floor(draw(w) * 2);
  give(p, item, qty);
  w.foraged[i] = w.tick + FORAGE_COOLDOWN_TICKS;
  ev.push({ type: 'foraged', playerId: p.id, item, qty });
  return null;
}

export function serve(
  w: World,
  p: PlayerState,
  cmd: Extract<Command, { type: 'serve' }>,
  ev: WorldEvent[],
): Result {
  const npc = w.npcs.find((n) => n.id === cmd.npcId);
  // Someone already walking off has had their turn.
  if (!npc || npc.mode === 'leaving') return 'no-such-npc';
  if (tileDistance(p.x, p.z, npc.x, npc.z) > SERVE_REACH) return 'too-far';
  if ((p.inventory[npc.want] ?? 0) < npc.qty) return 'missing-ingredients';
  p.inventory[npc.want] = (p.inventory[npc.want] ?? 0) - npc.qty;
  const earned = Math.floor(ITEMS[npc.want].price * npc.qty * customerPremium(w));
  p.money += earned;
  ev.push({ type: 'served', playerId: p.id, npcId: npc.id, item: npc.want, qty: npc.qty, earned });
  // Happy, they walk back the way they came; if they somehow cannot, they are simply gone.
  if (!sendHome(w, npc, ev, newBudget())) w.npcs = w.npcs.filter((n) => n.id !== npc.id);
  return null;
}

export function collect(
  w: World,
  p: PlayerState,
  cmd: Extract<Command, { type: 'collect' }>,
  ev: WorldEvent[],
): Result {
  if (!inBounds(w, cmd.x, cmd.z)) return 'out-of-bounds';
  const b = buildingAt(w, cmd.x, cmd.z);
  if (!b || b.kind !== 'harvester') return 'nothing-there';
  if (tileDistance(p.x, p.z, b.x, b.z) > SERVE_REACH) return 'too-far';
  const items = b.storage ?? {};
  if (Object.values(items).every((n) => !n)) return 'depleted';
  for (const [item, n] of Object.entries(items)) if (n) give(p, item as ItemId, n);
  b.storage = {};
  ev.push({ type: 'collected', playerId: p.id, items });
  return null;
}

export function hire(
  w: World,
  p: PlayerState,
  cmd: Extract<Command, { type: 'hire' }>,
  ev: WorldEvent[],
): Result {
  if (!inBounds(w, cmd.x, cmd.z)) return 'out-of-bounds';
  // Hired people live in a cottage, or in a grown home lot of the town.
  const cottage = buildingAt(w, cmd.x, cmd.z);
  const lot = zoneAt(w, cmd.x, cmd.z) === 'homes' && lotLevelAt(w, cmd.x, cmd.z) >= HOME_LOT_HIRE_LEVEL;
  if (!(cottage?.kind === 'cottage') && !lot) return 'no-cottage';
  const home = { x: cmd.x, z: cmd.z };
  const here = w.workers.filter((k) => k.homeX === home.x && k.homeZ === home.z).length;
  if (here >= WORKERS_PER_COTTAGE) return 'too-many-workers';
  if (p.money < HIRE_COST) return 'cannot-afford';
  const door = doorTile(w, home.x, home.z, staticBlockers(w, null));
  if (!door) return 'occupied';
  p.money -= HIRE_COST;
  const worker = newFarmhand(w.nextId++, p.id, home, door, w.tick, WAGE_INTERVAL_TICKS);
  w.workers.push(worker);
  ev.push({ type: 'hired', worker });
  return null;
}

export function fire(
  w: World,
  p: PlayerState,
  cmd: Extract<Command, { type: 'fire' }>,
  ev: WorldEvent[],
): Result {
  const k = w.workers.find((x) => x.id === cmd.workerId);
  if (!k || k.ownerId !== p.id) return 'nothing-there';
  w.workers = w.workers.filter((x) => x.id !== k.id);
  ev.push({ type: 'workerQuit', workerId: k.id, reason: 'fired' });
  return null;
}

/** A farmhand costs this much every minute of game time (1200 ticks), paid by whoever hired them. */
export const WAGE = 6;
export const WAGE_INTERVAL_TICKS = 1200;
export { WORK_RADIUS, WORK_INTERVAL_TICKS } from './farmhands';
export { BUILDINGS, CROPS };
