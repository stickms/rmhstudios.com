/** What the world does by itself each tick: customers come and go, machines gather, farmhands work. */

import { CROPS, ITEMS, ITEM_IDS, type ItemId } from '../content';
import { SKIN_IDS } from '../skins';
import {
  WAGE,
  WAGE_INTERVAL_TICKS,
  WORK_INTERVAL_TICKS,
  WORK_RADIUS,
} from './actions';
import { buildingAt, cropRipe, tileDistance, tileIndex } from './helpers';
import { nextRandom } from './rng';
import type { Npc, World, WorldEvent } from './types';

const CUSTOMER_EVERY_TICKS = 200;
const CUSTOMER_PATIENCE_TICKS = 1200;
const MACHINE_EVERY_TICKS = 20;
const MACHINE_RADIUS = 2;
const CUSTOMER_LOOKS = ['citizen', 'worker', 'rebel'] as const;

function draw(w: World): number {
  const r = nextRandom(w.rng);
  w.rng = r.state;
  return r.value;
}

/** Customers prefer what is worth cooking: pick an item weighted toward dearer goods. */
function pickWant(w: World): ItemId {
  const items = ITEM_IDS.filter((i) => ITEMS[i].price >= 5);
  const total = items.reduce((s, i) => s + ITEMS[i].price, 0);
  let roll = draw(w) * total;
  for (const i of items) {
    roll -= ITEMS[i].price;
    if (roll <= 0) return i;
  }
  return items[items.length - 1];
}

function tickCustomers(w: World, ev: WorldEvent[]) {
  // They wait, then give up.
  for (const n of [...w.npcs]) {
    n.patience -= 1;
    if (n.patience <= 0) {
      w.npcs = w.npcs.filter((o) => o.id !== n.id);
      ev.push({ type: 'customerLeft', npcId: n.id });
    }
  }
  if (w.tick % CUSTOMER_EVERY_TICKS !== 0) return;
  const stalls = w.buildings.filter((b) => b.kind === 'stall');
  if (stalls.length === 0 || w.npcs.length >= Math.min(4, 1 + stalls.length * 2)) return;
  const stall = stalls[Math.floor(draw(w) * stalls.length)];
  // Appear on an open tile beside the stall.
  for (let attempt = 0; attempt < 8; attempt++) {
    const x = stall.x + Math.floor(draw(w) * 3) - 1;
    const z = stall.z + Math.floor(draw(w) * 3) - 1;
    if (x < 0 || z < 0 || x >= w.size || z >= w.size) continue;
    const kind = w.terrain[tileIndex(w, x, z)];
    if ((kind !== 'grass' && kind !== 'sand') || buildingAt(w, x, z)) continue;
    if (w.npcs.some((n) => Math.round(n.x) === x && Math.round(n.z) === z)) continue;
    const npc: Npc = {
      id: w.nextId++,
      kind: 'customer',
      x,
      z,
      want: pickWant(w),
      qty: 1 + Math.floor(draw(w) * 3),
      patience: CUSTOMER_PATIENCE_TICKS,
      look: CUSTOMER_LOOKS[Math.floor(draw(w) * CUSTOMER_LOOKS.length)] ?? SKIN_IDS[0],
    };
    w.npcs.push(npc);
    ev.push({ type: 'customerArrived', npc });
    return;
  }
}

function tickMachines(w: World) {
  if (w.tick % MACHINE_EVERY_TICKS !== 0) return;
  for (const m of w.buildings) {
    if (m.kind !== 'harvester') continue;
    for (const c of [...w.crops]) {
      if (tileDistance(c.x, c.z, m.x, m.z) > MACHINE_RADIUS || !cropRipe(w, c)) continue;
      const def = CROPS[c.kind];
      m.storage ??= {};
      m.storage[def.yieldItem] = (m.storage[def.yieldItem] ?? 0) + def.yieldQty;
      w.crops = w.crops.filter((o) => o.id !== c.id);
    }
  }
}

function tickWorkers(w: World, ev: WorldEvent[]) {
  for (const k of [...w.workers]) {
    const owner = w.players[k.ownerId];
    if (!owner) continue;
    if (w.tick >= k.nextWageTick) {
      k.nextWageTick = w.tick + WAGE_INTERVAL_TICKS;
      if (owner.money < WAGE) {
        w.workers = w.workers.filter((o) => o.id !== k.id);
        ev.push({ type: 'workerQuit', workerId: k.id, reason: 'unpaid' });
        continue;
      }
      owner.money -= WAGE;
    }
    if (w.tick < k.nextActTick) continue;
    k.nextActTick = w.tick + WORK_INTERVAL_TICKS;
    // Bring in the nearest ripe crop, else replant an empty plot with what they planted last.
    const ripe = w.crops
      .filter((c) => cropRipe(w, c) && tileDistance(c.x, c.z, k.homeX, k.homeZ) <= WORK_RADIUS)
      .sort((a, b) => tileDistance(a.x, a.z, k.homeX, k.homeZ) - tileDistance(b.x, b.z, k.homeX, k.homeZ) || a.id - b.id)[0];
    if (ripe) {
      const def = CROPS[ripe.kind];
      owner.inventory[def.yieldItem] = (owner.inventory[def.yieldItem] ?? 0) + def.yieldQty;
      w.crops = w.crops.filter((c) => c.id !== ripe.id);
      k.lastCrop = ripe.kind;
      k.x = ripe.x;
      k.z = ripe.z;
      continue;
    }
    if (!k.lastCrop) continue;
    const plot = w.buildings
      .filter(
        (b) =>
          b.kind === 'plot' &&
          tileDistance(b.x, b.z, k.homeX, k.homeZ) <= WORK_RADIUS &&
          !w.crops.some((c) => c.x === b.x && c.z === b.z),
      )
      .sort((a, b) => a.id - b.id)[0];
    const seed = CROPS[k.lastCrop].seedPrice;
    if (plot && owner.money >= seed) {
      owner.money -= seed;
      w.crops.push({ id: w.nextId++, kind: k.lastCrop, x: plot.x, z: plot.z, plantedTick: w.tick });
      k.x = plot.x;
      k.z = plot.z;
    }
  }
}

export function tickSystems(w: World, ev: WorldEvent[]): void {
  tickCustomers(w, ev);
  tickMachines(w);
  tickWorkers(w, ev);
}
