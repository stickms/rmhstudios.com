import { BUILDINGS, CROPS, ITEMS, RECIPES, isBuildingId, isCropId, isItemId } from '../content';
import { DEFAULT_SKIN, SKINS, isSkinId } from '../skins';
import { collect, fire, forage, hire, serve } from './actions';
import { agentOnTile } from './agents';
import { MAX_HP, applyCrimeCommand, crimeGate, newArms } from './crime';
import { tickCrime } from './police';
import { cellLevel, cellRoad, cellUtility, createCity } from './city-cells';
import {
  claimMilestone,
  placeRoad,
  placeUtility,
  removeRoad,
  removeUtility,
  setTaxRate,
  unzone,
  zone,
} from './city-commands';
import { recomputeCity, touchCity } from './city';
import { buildingAt, cropStage, inBounds, tileIndex } from './helpers';
import { fbm } from './noise';
import { tickSystems } from './systems';
import {
  LEVEL_HEIGHT,
  MAX_LEVEL,
  MAX_WORLD_SIZE,
  MEADOW_LEVEL,
  MIN_WORLD_SIZE,
  START_MONEY,
  TICK_MS,
  WATER_LEVEL,
  type Building,
  type Command,
  type PlayerState,
  type RejectReason,
  type Rot,
  type TerrainKind,
  type World,
  type WorldEvent,
} from './types';

/** Buildings you cannot walk through. */
export const SOLID_BUILDINGS: ReadonlySet<string> = new Set([
  'cottage',
  'stall',
  'kitchen',
  'harvester',
]);

/** Build a world from a seed. Same seed and size → identical world. */
export function createWorld(seed: number, size: number): World {
  const n = Math.min(MAX_WORLD_SIZE, Math.max(MIN_WORLD_SIZE, Math.floor(size)));
  const s32 = seed >>> 0;
  const mid = (n - 1) / 2;
  const height: number[] = [];
  const terrain: TerrainKind[] = [];
  const forestSeed = (s32 ^ 0x9e3779b9) >>> 0;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const edge = x === 0 || z === 0 || x === n - 1 || z === n - 1;
      // Island shape: lumpy fractal noise, pulled to the sea only near the rim so the coast is irregular.
      const dx = (x - mid) / mid;
      const dz = (z - mid) / mid;
      const d = Math.hypot(dx, dz);
      const shore = 1 - Math.min(1, Math.max(0, (d - 0.62) / 0.4));
      const ridges = Math.abs(fbm(s32 ^ 0x7f4a, x / 9, z / 9, 2) - 0.5) * 2; // 0 on ridgelines, 1 in basins
      let e = fbm(s32, x / 5.5, z / 5.5, 4) * 0.82 + (1 - ridges) * 0.18;
      e = e * 0.94 * (shore * shore * (3 - 2 * shore)) + 0.06 * shore;
      // The starting meadow is flat grass; it blends into the noise over three tiles.
      const dm = Math.max(Math.abs(x - Math.floor(n / 2)), Math.abs(z - Math.floor(n / 2)));
      const level0 = Math.round(e * (MAX_LEVEL + 2.2));
      const blend = dm <= 3 ? 1 : dm <= 6 ? 1 - (dm - 3) / 3 : 0;
      let level = Math.round(level0 * (1 - blend) + MEADOW_LEVEL * blend);
      level = Math.min(MAX_LEVEL, Math.max(0, level));
      if (edge) level = 0;
      let kind: TerrainKind;
      if (level <= WATER_LEVEL) kind = 'water';
      else if (level === WATER_LEVEL + 1 && dm > 3) kind = 'sand';
      else if (level >= MAX_LEVEL && dm > 6) kind = 'rock';
      else kind = fbm(forestSeed, x / 3.2, z / 3.2, 2) > 0.62 && dm > 3 ? 'forest' : 'grass';
      height.push(level);
      terrain.push(kind);
    }
  }
  return {
    version: 3,
    seed: s32,
    size: n,
    tick: 0,
    accMs: 0,
    rng: s32,
    nextId: 1,
    terrain,
    height,
    buildings: [],
    crops: [],
    players: {},
    officers: [],
    foraged: {},
    npcs: [],
    workers: [],
    city: createCity(n),
  };
}

/** World-space height of a tile's top surface (water sits at one fixed level). */
export function tileTop(w: World, x: number, z: number): number {
  const tx = Math.round(x);
  const tz = Math.round(z);
  if (!(tx >= 0 && tz >= 0 && tx < w.size && tz < w.size)) return 0;
  const i = tz * w.size + tx;
  return (w.terrain[i] === 'water' ? WATER_LEVEL : w.height[i]) * LEVEL_HEIGHT;
}

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
        skin: DEFAULT_SKIN,
        ownedSkins: [DEFAULT_SKIN],
        hp: MAX_HP,
        heat: 0,
        arms: newArms(),
      };
      events.push({ type: 'joined', playerId: cmd.playerId });
    }
    return;
  }
  const p = w.players[cmd.playerId];
  if (!p) return reject(events, cmd, 'unknown-player');
  // A downed player is out of action (crime.ts).
  const gate = crimeGate(w, p, cmd.type);
  if (gate) return gate === 'silent' ? undefined : reject(events, cmd, gate);

  switch (cmd.type) {
    case 'move': {
      if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.z))
        return reject(events, cmd, 'out-of-bounds');
      const tx = Math.floor(cmd.x);
      const tz = Math.floor(cmd.z);
      if (!inBounds(w, tx, tz)) return reject(events, cmd, 'out-of-bounds');
      if (w.terrain[tileIndex(w, tx, tz)] === 'water') return reject(events, cmd, 'bad-terrain');
      p.x = cmd.x;
      p.z = cmd.z;
      return;
    }
    case 'place': {
      if (!isBuildingId(cmd.kind)) return reject(events, cmd, 'nothing-there');
      // Roads belong to the city layer now; `place road` is kept as a single-tile alias for saves and clients that predate it.
      if (cmd.kind === 'road') {
        const reason = placeRoad(w, p, { type: 'placeRoad', playerId: p.id, x: cmd.x, z: cmd.z }, events);
        if (reason) reject(events, cmd, reason);
        return;
      }
      if (!inBounds(w, cmd.x, cmd.z)) return reject(events, cmd, 'out-of-bounds');
      if (w.terrain[tileIndex(w, cmd.x, cmd.z)] !== 'grass')
        return reject(events, cmd, 'bad-terrain');
      if (buildingAt(w, cmd.x, cmd.z)) return reject(events, cmd, 'occupied');
      {
        // A road, a utility or a developed lot already holds the tile; an empty zone is simply built over.
        const cell = w.city.cells[tileIndex(w, cmd.x, cmd.z)];
        if (cellRoad(cell) || cellUtility(cell) || cellLevel(cell) > 0)
          return reject(events, cmd, 'occupied');
      }
      // Never wall someone in: a solid building cannot go up on a tile a player, a customer or a farmhand is standing on.
      if (
        SOLID_BUILDINGS.has(cmd.kind) &&
        (Object.values(w.players).some(
          (o) => Math.round(o.x) === cmd.x && Math.round(o.z) === cmd.z,
        ) ||
          agentOnTile(w, cmd.x, cmd.z))
      )
        return reject(events, cmd, 'occupied');
      const cost = BUILDINGS[cmd.kind].cost;
      if (p.money < cost) return reject(events, cmd, 'cannot-afford');
      p.money -= cost;
      const rot = ([0, 1, 2, 3].includes(cmd.rot ?? 0) ? (cmd.rot ?? 0) : 0) as Rot;
      const building: Building = { id: w.nextId++, kind: cmd.kind, x: cmd.x, z: cmd.z, rot };
      w.buildings.push(building);
      w.city.cells[tileIndex(w, cmd.x, cmd.z)] = 0;
      touchCity(w);
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
      touchCity(w);
      events.push({ type: 'removed', buildingId: b.id, refund });
      return;
    }
    case 'plant': {
      if (!isCropId(cmd.crop)) return reject(events, cmd, 'nothing-there');
      if (!inBounds(w, cmd.x, cmd.z)) return reject(events, cmd, 'out-of-bounds');
      const b = buildingAt(w, cmd.x, cmd.z);
      if (!b || b.kind !== 'plot') return reject(events, cmd, 'no-plot');
      if (w.crops.some((c) => c.x === cmd.x && c.z === cmd.z))
        return reject(events, cmd, 'occupied');
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
        p.inventory[item as keyof typeof ITEMS] =
          (p.inventory[item as keyof typeof ITEMS] ?? 0) - (need ?? 0);
      }
      give(p, recipe.output, recipe.outputQty);
      events.push({ type: 'cooked', playerId: p.id, item: recipe.output, qty: recipe.outputQty });
      return;
    }
    case 'forage':
    case 'serve':
    case 'collect':
    case 'hire':
    case 'fire': {
      const reason =
        cmd.type === 'forage'
          ? forage(w, p, cmd, events)
          : cmd.type === 'serve'
            ? serve(w, p, cmd, events)
            : cmd.type === 'collect'
              ? collect(w, p, cmd, events)
              : cmd.type === 'hire'
                ? hire(w, p, cmd, events)
                : fire(w, p, cmd, events);
      if (reason) reject(events, cmd, reason);
      return;
    }
    case 'hustle':
    case 'buyWeapon':
    case 'equip':
    case 'shoot':
    case 'reload': {
      const reason = applyCrimeCommand(w, p, cmd, events);
      if (reason && reason !== 'silent') reject(events, cmd, reason);
      return;
    }
    case 'placeRoad':
    case 'removeRoad':
    case 'zone':
    case 'unzone':
    case 'placeUtility':
    case 'removeUtility':
    case 'claimMilestone':
    case 'setTaxRate': {
      const reason =
        cmd.type === 'placeRoad'
          ? placeRoad(w, p, cmd, events)
          : cmd.type === 'removeRoad'
            ? removeRoad(w, p, cmd, events)
            : cmd.type === 'zone'
              ? zone(w, p, cmd, events)
              : cmd.type === 'unzone'
                ? unzone(w, p, cmd, events)
                : cmd.type === 'placeUtility'
                  ? placeUtility(w, p, cmd, events)
                  : cmd.type === 'removeUtility'
                    ? removeUtility(w, p, cmd, events)
                    : cmd.type === 'claimMilestone'
                      ? claimMilestone(w, p, cmd, events)
                      : setTaxRate(w, p, cmd, events);
      if (reason) reject(events, cmd, reason);
      return;
    }
    case 'buySkin': {
      if (!isSkinId(cmd.skin)) return reject(events, cmd, 'unknown-skin');
      if (p.ownedSkins.includes(cmd.skin)) return reject(events, cmd, 'already-owned');
      const price = SKINS[cmd.skin].price;
      if (p.money < price) return reject(events, cmd, 'cannot-afford');
      p.money -= price;
      p.ownedSkins.push(cmd.skin);
      events.push({ type: 'skinBought', playerId: p.id, skin: cmd.skin, price });
      return;
    }
    case 'setSkin': {
      if (!isSkinId(cmd.skin)) return reject(events, cmd, 'unknown-skin');
      if (!p.ownedSkins.includes(cmd.skin)) return reject(events, cmd, 'not-owned');
      p.skin = cmd.skin;
      events.push({ type: 'skinChanged', playerId: p.id, skin: cmd.skin });
      return;
    }
    case 'sell': {
      if (!isItemId(cmd.item) || !Number.isInteger(cmd.qty) || cmd.qty <= 0)
        return reject(events, cmd, 'bad-amount');
      if (ITEMS[cmd.item].contraband) return reject(events, cmd, 'contraband'); // no stall buys it: hustle it
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
  // Commands that touched the city are settled at once, so the HUD and the next command see consistent coverage.
  if (world.city.dirty) recomputeCity(world);
  world.accMs += Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  while (world.accMs >= TICK_MS) {
    world.accMs -= TICK_MS;
    world.tick++;
    tickSystems(world, events);
    tickCrime(world, events);
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
