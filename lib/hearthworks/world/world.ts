import {
  BUILDINGS,
  CROPS,
  ITEMS,
  RECIPES,
  isBuildingId,
  isCropId,
  isItemId,
} from '../content';
import { nextRandom } from './rng';
import {
  MAX_WORLD_SIZE,
  MIN_WORLD_SIZE,
  START_MONEY,
  TICK_MS,
  type Building,
  type Command,
  type PlayerState,
  type RejectReason,
  type Rot,
  type TerrainKind,
  type World,
  type WorldEvent,
} from './types';

const idx = (w: World, x: number, z: number) => z * w.size + x;
const inBounds = (w: World, x: number, z: number) =>
  Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x < w.size && z < w.size;

/** Build a world from a seed. Same seed and size → identical world. */
export function createWorld(seed: number, size: number): World {
  const n = Math.min(MAX_WORLD_SIZE, Math.max(MIN_WORLD_SIZE, Math.floor(size)));
  let rng = seed >>> 0;
  const forest: boolean[] = new Array(n * n).fill(false);
  for (let i = 0; i < forest.length; i++) {
    const r = nextRandom(rng);
    rng = r.state;
    forest[i] = r.value < 0.34;
  }
  // Two smoothing passes turn noise into woods with clearings.
  for (let pass = 0; pass < 2; pass++) {
    const next = forest.slice();
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        let around = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            const xx = x + dx;
            const zz = z + dz;
            if (xx >= 0 && zz >= 0 && xx < n && zz < n && forest[zz * n + xx]) around++;
          }
        }
        next[z * n + x] = around >= 5 || (forest[z * n + x] && around >= 4);
      }
    }
    for (let i = 0; i < forest.length; i++) forest[i] = next[i];
  }
  const mid = Math.floor(n / 2);
  const terrain: TerrainKind[] = [];
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const edge = x === 0 || z === 0 || x === n - 1 || z === n - 1;
      const spawn = Math.abs(x - mid) <= 3 && Math.abs(z - mid) <= 3;
      terrain.push(edge ? 'water' : spawn ? 'grass' : forest[z * n + x] ? 'forest' : 'grass');
    }
  }
  return {
    version: 1,
    seed: seed >>> 0,
    size: n,
    tick: 0,
    accMs: 0,
    rng,
    nextId: 1,
    terrain,
    buildings: [],
    crops: [],
    players: {},
  };
}

export const buildingAt = (w: World, x: number, z: number): Building | undefined =>
  w.buildings.find((b) => b.x === x && b.z === z);

export const cropStage = (w: World, c: { kind: keyof typeof CROPS; plantedTick: number }): number => {
  const def = CROPS[c.kind];
  return Math.min(def.stages, Math.floor(((w.tick - c.plantedTick) * TICK_MS) / def.stageMs));
};

function reject(events: WorldEvent[], cmd: Command, reason: RejectReason) {
  events.push({ type: 'rejected', command: cmd.type, playerId: cmd.playerId, reason });
}

function give(p: PlayerState, item: keyof typeof ITEMS, qty: number) {
  p.inventory[item] = (p.inventory[item] ?? 0) + qty;
}

function applyCommand(w: World, cmd: Command, events: WorldEvent[]) {
  if (cmd.type === 'join') {
    if (!w.players[cmd.playerId]) {
      const mid = Math.floor(w.size / 2);
      w.players[cmd.playerId] = {
        id: cmd.playerId,
        x: mid,
        z: mid,
        money: START_MONEY,
        inventory: {},
      };
      events.push({ type: 'joined', playerId: cmd.playerId });
    }
    return;
  }
  const p = w.players[cmd.playerId];
  if (!p) return reject(events, cmd, 'unknown-player');

  switch (cmd.type) {
    case 'move': {
      if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.z)) return reject(events, cmd, 'out-of-bounds');
      const tx = Math.floor(cmd.x);
      const tz = Math.floor(cmd.z);
      if (!inBounds(w, tx, tz)) return reject(events, cmd, 'out-of-bounds');
      if (w.terrain[idx(w, tx, tz)] === 'water') return reject(events, cmd, 'bad-terrain');
      p.x = cmd.x;
      p.z = cmd.z;
      return;
    }
    case 'place': {
      if (!isBuildingId(cmd.kind)) return reject(events, cmd, 'nothing-there');
      if (!inBounds(w, cmd.x, cmd.z)) return reject(events, cmd, 'out-of-bounds');
      if (w.terrain[idx(w, cmd.x, cmd.z)] !== 'grass') return reject(events, cmd, 'bad-terrain');
      if (buildingAt(w, cmd.x, cmd.z)) return reject(events, cmd, 'occupied');
      const cost = BUILDINGS[cmd.kind].cost;
      if (p.money < cost) return reject(events, cmd, 'cannot-afford');
      p.money -= cost;
      const rot = ([0, 1, 2, 3].includes(cmd.rot ?? 0) ? (cmd.rot ?? 0) : 0) as Rot;
      const building: Building = { id: w.nextId++, kind: cmd.kind, x: cmd.x, z: cmd.z, rot };
      w.buildings.push(building);
      events.push({ type: 'placed', building });
      return;
    }
    case 'remove': {
      if (!inBounds(w, cmd.x, cmd.z)) return reject(events, cmd, 'out-of-bounds');
      const b = buildingAt(w, cmd.x, cmd.z);
      if (!b) return reject(events, cmd, 'nothing-there');
      const refund = Math.floor(BUILDINGS[b.kind].cost / 2);
      p.money += refund;
      w.buildings = w.buildings.filter((o) => o.id !== b.id);
      w.crops = w.crops.filter((c) => !(c.x === b.x && c.z === b.z));
      events.push({ type: 'removed', buildingId: b.id, refund });
      return;
    }
    case 'plant': {
      if (!isCropId(cmd.crop)) return reject(events, cmd, 'nothing-there');
      if (!inBounds(w, cmd.x, cmd.z)) return reject(events, cmd, 'out-of-bounds');
      const b = buildingAt(w, cmd.x, cmd.z);
      if (!b || b.kind !== 'plot') return reject(events, cmd, 'no-plot');
      if (w.crops.some((c) => c.x === cmd.x && c.z === cmd.z)) return reject(events, cmd, 'occupied');
      const price = CROPS[cmd.crop].seedPrice;
      if (p.money < price) return reject(events, cmd, 'cannot-afford');
      p.money -= price;
      const crop = { id: w.nextId++, kind: cmd.crop, x: cmd.x, z: cmd.z, plantedTick: w.tick };
      w.crops.push(crop);
      events.push({ type: 'planted', crop });
      return;
    }
    case 'harvest': {
      const crop = w.crops.find((c) => c.x === cmd.x && c.z === cmd.z);
      if (!crop) return reject(events, cmd, 'nothing-there');
      const def = CROPS[crop.kind];
      if (cropStage(w, crop) < def.stages) return reject(events, cmd, 'not-ripe');
      w.crops = w.crops.filter((c) => c.id !== crop.id);
      give(p, def.yieldItem, def.yieldQty);
      events.push({ type: 'harvested', playerId: p.id, item: def.yieldItem, qty: def.yieldQty });
      return;
    }
    case 'cook': {
      const recipe = Object.hasOwn(RECIPES, cmd.recipe) ? RECIPES[cmd.recipe] : undefined;
      if (!recipe) return reject(events, cmd, 'unknown-recipe');
      if (!w.buildings.some((b) => b.kind === 'kitchen')) return reject(events, cmd, 'no-kitchen');
      for (const [item, need] of Object.entries(recipe.inputs)) {
        if ((p.inventory[item as keyof typeof ITEMS] ?? 0) < (need ?? 0))
          return reject(events, cmd, 'missing-ingredients');
      }
      for (const [item, need] of Object.entries(recipe.inputs)) {
        p.inventory[item as keyof typeof ITEMS] = (p.inventory[item as keyof typeof ITEMS] ?? 0) - (need ?? 0);
      }
      give(p, recipe.output, recipe.outputQty);
      events.push({ type: 'cooked', playerId: p.id, item: recipe.output, qty: recipe.outputQty });
      return;
    }
    case 'sell': {
      if (!isItemId(cmd.item) || !Number.isInteger(cmd.qty) || cmd.qty <= 0)
        return reject(events, cmd, 'bad-amount');
      if (!w.buildings.some((b) => b.kind === 'stall')) return reject(events, cmd, 'no-stall');
      if ((p.inventory[cmd.item] ?? 0) < cmd.qty) return reject(events, cmd, 'missing-ingredients');
      p.inventory[cmd.item] = (p.inventory[cmd.item] ?? 0) - cmd.qty;
      const earned = ITEMS[cmd.item].price * cmd.qty;
      p.money += earned;
      events.push({ type: 'sold', playerId: p.id, item: cmd.item, qty: cmd.qty, earned });
      return;
    }
  }
}

/**
 * Advance the world: apply `cmds` in order, then run as many whole ticks as `dtMs` of game
 * time allows. Mutates `world` and returns what happened. Deterministic: the same world fed the
 * same (dtMs, cmds) sequence ends identical — the property host migration and tests rely on.
 */
export function stepWorld(world: World, dtMs: number, cmds: readonly Command[] = []): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const cmd of cmds) applyCommand(world, cmd, events);
  world.accMs += Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  while (world.accMs >= TICK_MS) {
    world.accMs -= TICK_MS;
    world.tick++;
    for (const crop of world.crops) {
      const def = CROPS[crop.kind];
      const elapsed = (world.tick - crop.plantedTick) * TICK_MS;
      if (elapsed > 0 && elapsed % def.stageMs === 0 && elapsed / def.stageMs <= def.stages) {
        events.push({ type: 'cropGrew', cropId: crop.id, stage: elapsed / def.stageMs });
      }
    }
  }
  return events;
}
