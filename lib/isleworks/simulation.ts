/**
 * Isleworks — the simulation.
 *
 * Two entry points, and the split between them is the whole architecture:
 *
 *  - `recomputeDerived(state)` is a **pure sweep of the board**. It throws away
 *    every derived field and rebuilds it from terrain + buildings alone. Call it
 *    after any edit; call it twice and nothing changes. Because it never reads
 *    its own previous output, the board physically cannot drift out of sync with
 *    what the player can see, which is the failure mode that makes city sims
 *    feel haunted.
 *  - `advanceMonth(state, rng)` is the only function allowed to move *stateful*
 *    quantities — money, population, condition, building levels, event timers —
 *    and it finishes by calling the sweep.
 *
 * ## The dependency order, and the one cycle in it
 *
 * Roads → utilities → traffic → pollution/noise → land value → efficiency →
 * population → happiness → money. Every arrow points forward except one: water
 * pumps need power and power plants need water. That cycle is cut by a design
 * rule rather than a fixed-point solver — **utilities are never starved of the
 * utility they produce**, they only need a road. A plant is assumed to run its
 * own feed. This is stated here because it is the single most surprising line in
 * the file, and it is why `assignUtility()` skips producers.
 *
 * ## Capacity is city-wide, priority is spatial
 *
 * Power and water are not flood-filled through pipes: generation is pooled
 * city-wide, and when demand exceeds supply the shortfall is paid by whoever is
 * *furthest from a generator*. That keeps the readable "build another plant"
 * loop while still rewarding a player who puts the plant near the load — which
 * is the decision a pipe network was there to create in the first place, at a
 * fraction of the explanation.
 */

import { BUILDINGS, CITY_HALL_ID, getDefinition, tryGetDefinition } from './catalog';
import {
  DIRECTIONS,
  ROAD_ID,
  chebyshev,
  footprintCenter,
  inBounds,
  index,
  instanceTiles,
  largestComponent,
  recomputeRoadConnections,
  roadComponents,
} from './grid';
import {
  clamp,
  clamp01,
  falloff,
  type ActiveCityEvent,
  type BuildingDefinition,
  type BuildingInstance,
  type BuildingWarning,
  type CityState,
  type CityStats,
  type ServiceKind,
  type Tile,
} from './types';

/** Every tunable number in one place. Nothing below reads a bare constant. */
export const BALANCE = {
  /** Share of residents who hold a job. */
  workforceRatio: 0.58,
  /** How fast population closes the gap to its target, per month. */
  growthRate: 0.11,
  /** Population lost per month when the target is below the current count. */
  declineRate: 0.07,

  /* Income per resident, per month.
   *
   * Tuned against the shape of a real playthrough rather than in the abstract: a
   * city has to cover ~2 coins per resident of standing costs once it has homes,
   * shops, utilities and the three basic services, so gross income has to clear
   * that with room to save for the next tier. `taxBase` is what a resident is
   * worth on worthless land; `taxLandValue` is what improving the neighbourhood
   * is worth, and it is the larger of the two on purpose — parks and plazas
   * should pay for themselves. */
  taxBase: 1.0,
  taxLandValue: 2.0,
  /** Tax rate the citizens consider "fair"; deviations move happiness. */
  neutralTaxRate: 9,

  commercialRevenue: 2.8,
  industrialRevenue: 2.4,
  /** Museums, landmarks and docks earn on visitors, so they scale with mood. */
  tourismRevenue: 0.85,

  /** Efficiency multipliers for missing inputs. */
  noPowerEfficiency: 0.15,
  noWaterEfficiency: 0.35,
  congestionPenalty: 0.45,

  /** Housing multiplier at level 1 / 2 / 3. */
  levelHousing: [1, 1.35, 1.75],
  levelJobs: [1, 1.3, 1.6],

  /** Land value a building needs to start growing toward the next level. */
  upgradeLandValue: [0, 42, 68],
  upgradeMonths: 4,

  conditionDecay: 0.014,
  conditionRepair: 0.05,

  /** Traffic a single road tile carries before it starts to choke. */
  roadCapacity: 26,
} as const;

const SERVICES: ServiceKind[] = ['health', 'education', 'safety', 'fire', 'leisure'];

export function emptyStats(): CityStats {
  return {
    population: 0,
    housingCapacity: 0,
    jobs: 0,
    jobsFilled: 0,
    workforce: 0,
    unemployment: 0,
    powerSupply: 0,
    powerDemand: 0,
    waterSupply: 0,
    waterDemand: 0,
    happiness: 55,
    landValue: 0,
    pollution: 0,
    traffic: 0,
    coverage: { health: 0, education: 0, safety: 0, fire: 0, leisure: 0 },
    taxIncome: 0,
    tradeIncome: 0,
    upkeep: 0,
    netIncome: 0,
  };
}

export interface AggregatedEffects {
  powerDemandScale: number;
  happiness: number;
  incomeScale: number;
  pollution: number;
  growthScale: number;
}

export function aggregateEffects(events: ActiveCityEvent[]): AggregatedEffects {
  const out: AggregatedEffects = {
    powerDemandScale: 1,
    happiness: 0,
    incomeScale: 1,
    pollution: 0,
    growthScale: 1,
  };
  for (const event of events) {
    const e = event.effect;
    if (e.powerDemandScale) out.powerDemandScale *= e.powerDemandScale;
    if (e.happiness) out.happiness += e.happiness;
    if (e.incomeScale) out.incomeScale *= e.incomeScale;
    if (e.pollution) out.pollution += e.pollution;
    if (e.growthScale) out.growthScale *= e.growthScale;
  }
  return out;
}

/** Per-building scratch space for one sweep. Never stored. */
interface Node {
  instance: BuildingInstance;
  def: BuildingDefinition;
  tiles: { x: number; y: number }[];
  /** Grid-space centre, used for every radius test. */
  cx: number;
  cy: number;
  roadAccess: boolean;
  hasPower: boolean;
  hasWater: boolean;
  /** Usable housing after road/power/water — known before efficiency exists. */
  capacity: number;
  congestion: number;
  warnings: BuildingWarning[];
}

/**
 * Rebuild every derived field on the board.
 *
 * Mutates `state.tiles`, each `BuildingInstance`'s derived fields, and
 * `state.stats`. Deliberately mutating rather than returning a copy: the board
 * is up to 576 tiles plus a few hundred buildings and this runs on every
 * placement, so a structural clone per keystroke would be the game's single
 * biggest allocation source for no benefit — the store swaps the top-level
 * object reference to tell React something changed.
 */
export function recomputeDerived(state: CityState): void {
  const { tiles, width, height } = state;
  const effects = aggregateEffects(state.events);

  /* ── 0. Reset ──────────────────────────────────────────────────────────── */
  for (const tile of tiles) {
    tile.occupied = false;
    tile.buildingId = undefined;
    tile.hasPower = false;
    tile.hasWater = false;
    tile.pollution = 0;
    tile.noise = 0;
    tile.landValue = 0;
    tile.traffic = 0;
  }

  const nodes: Node[] = [];
  const defAt: (string | undefined)[] = new Array(tiles.length).fill(undefined);

  for (const instance of state.buildings) {
    const def = tryGetDefinition(instance.definitionId);
    if (!def) continue;
    const owned = instanceTiles(instance, def);
    const [cx, cy] = footprintCenter(
      instance.gridX,
      instance.gridY,
      def.footprint,
      instance.rotation,
      width,
      height,
    );
    for (const t of owned) {
      if (!inBounds(t.x, t.y, width, height)) continue;
      const i = index(t.x, t.y, width);
      tiles[i].occupied = true;
      tiles[i].buildingId = instance.instanceId;
      defAt[i] = def.id;
    }
    nodes.push({
      instance,
      def,
      tiles: owned,
      cx: cx + width / 2,
      cy: cy + height / 2,
      roadAccess: false,
      hasPower: false,
      hasWater: false,
      capacity: 0,
      congestion: 0,
      warnings: [],
    });
  }

  /* ── 1. Roads ──────────────────────────────────────────────────────────── */
  const isRoadTile = (tile: Tile) => defAt[index(tile.x, tile.y, width)] === ROAD_ID;
  recomputeRoadConnections(tiles, width, height, isRoadTile);
  const { componentOf, sizes } = roadComponents(tiles, width, height, isRoadTile);

  // The network is the component city hall is on — falling back to the biggest
  // one before the hall has any road at all. Anchoring on the hall is what makes
  // "your new district is not connected to the city" a real, visible failure
  // rather than a silent re-election of whichever half is currently larger.
  let mainComponent = -1;
  const hall = nodes.find((n) => n.def.id === CITY_HALL_ID);
  if (hall) {
    for (const t of adjacentTiles(hall.tiles, width, height)) {
      const c = componentOf[index(t.x, t.y, width)];
      if (c !== -1) {
        mainComponent = c;
        break;
      }
    }
  }
  if (mainComponent === -1) mainComponent = largestComponent(sizes);

  for (const node of nodes) {
    if (node.def.id === ROAD_ID) {
      node.roadAccess =
        componentOf[index(node.instance.gridX, node.instance.gridY, width)] === mainComponent;
      continue;
    }
    if (!node.def.requiresRoad) {
      node.roadAccess = true;
      continue;
    }
    node.roadAccess = adjacentTiles(node.tiles, width, height).some(
      (t) => componentOf[index(t.x, t.y, width)] === mainComponent,
    );
  }

  /* ── 2. Utilities ──────────────────────────────────────────────────────── */
  const live = nodes.filter((n) => n.roadAccess || !n.def.requiresRoad);

  // Producers only need their road. See the header note on the one cycle.
  const powerProducers = live.filter((n) => (n.def.powerGeneration ?? 0) > 0);
  const waterProducers = live.filter((n) => (n.def.waterGeneration ?? 0) > 0);

  // Battery banks earn their keep exactly when a demand-spike event is running.
  const spiking = effects.powerDemandScale > 1;
  const powerSupply = powerProducers.reduce(
    (sum, n) =>
      sum + (n.def.powerGeneration ?? 0) * (n.def.id === 'battery-bank' && spiking ? 2 : 1),
    0,
  );
  const waterSupply = waterProducers.reduce((sum, n) => sum + (n.def.waterGeneration ?? 0), 0);

  const powerDemand =
    live.reduce((sum, n) => sum + (n.def.powerConsumption ?? 0), 0) * effects.powerDemandScale;
  const waterDemand = live.reduce((sum, n) => sum + (n.def.waterConsumption ?? 0), 0);

  assignUtility(live, powerProducers, powerSupply, 'power', effects.powerDemandScale);
  assignUtility(live, waterProducers, waterSupply, 'water', 1);

  const liveSet = new Set(live);
  for (const node of nodes) {
    if (!liveSet.has(node)) continue;
    for (const t of node.tiles) {
      const i = index(t.x, t.y, width);
      tiles[i].hasPower = node.hasPower;
      tiles[i].hasWater = node.hasWater;
    }
  }

  /* ── 3. Occupancy ──────────────────────────────────────────────────────── */
  const working = live.filter(
    (n) => (!n.def.requiresPower || n.hasPower) && (!n.def.requiresWater || n.hasWater),
  );

  // Residents are placed BEFORE traffic, pollution and land value, because all
  // three read them. Usable housing depends only on road/power/water — never on
  // efficiency, which is computed further down. That ordering is what makes the
  // sweep idempotent: nothing here reads a value this same function writes later.
  const population = state.stats.population;
  const residentials = nodes.filter((n) => (n.def.housing ?? 0) > 0);
  let housingCapacity = 0;
  for (const node of residentials) {
    node.capacity =
      node.def.requiresRoad && !node.roadAccess
        ? 0
        : (node.def.housing ?? 0) *
          BALANCE.levelHousing[node.instance.level - 1] *
          (node.hasPower || !node.def.requiresPower ? 1 : 0.25) *
          (node.hasWater || !node.def.requiresWater ? 1 : 0.4);
    housingCapacity += node.capacity;
  }
  housingCapacity = Math.floor(housingCapacity);
  distributeResidents(residentials, population);

  /* ── 4. Traffic ────────────────────────────────────────────────────────── */

  const load = new Float32Array(tiles.length);
  for (const node of working) {
    if (node.def.id === ROAD_ID) continue;
    const trips =
      (node.instance.occupiedResidents * 0.6 + (node.def.jobs ?? 0) * 0.9) /
      Math.max(1, node.tiles.length);
    if (trips <= 0) continue;
    for (const t of adjacentTiles(node.tiles, width, height)) {
      const i = index(t.x, t.y, width);
      if (defAt[i] === ROAD_ID) load[i] += trips;
    }
  }

  // Spread each road's load two hops along the network so a single access road
  // does not absorb a whole district's traffic on its own.
  diffuseAlongRoads(load, tiles, width, height, defAt, 2, 0.45);

  // Transit removes cars rather than adding capacity — a bus stop should feel
  // like a fix for congestion, not like a wider road.
  const transitRelief = new Float32Array(tiles.length);
  for (const node of working) {
    const relief = node.def.id === 'transit-hub' ? 0.55 : node.def.id === 'bus-stop' ? 0.3 : 0;
    if (!relief) continue;
    stamp(node, relief, width, height, transitRelief, node.def.effectRadius ?? 4);
  }

  for (let i = 0; i < tiles.length; i++) {
    if (defAt[i] !== ROAD_ID) continue;
    const relieved = load[i] * (1 - clamp01(transitRelief[i]));
    tiles[i].traffic = clamp((relieved / BALANCE.roadCapacity) * 100, 0, 100);
  }

  for (const node of nodes) {
    const roads = adjacentTiles(node.tiles, width, height).filter(
      (t) => defAt[index(t.x, t.y, width)] === ROAD_ID,
    );
    node.congestion = roads.length
      ? roads.reduce((sum, t) => sum + tiles[index(t.x, t.y, width)].traffic, 0) /
        roads.length /
        100
      : 0;
  }

  /* ── 5. Pollution and noise ────────────────────────────────────────────── */
  const pollutionField = new Float32Array(tiles.length);
  const noiseField = new Float32Array(tiles.length);

  for (const tile of tiles) {
    if (tile.terrainType === 'forest') pollutionField[index(tile.x, tile.y, width)] -= 5;
    if (tile.terrainType === 'water') pollutionField[index(tile.x, tile.y, width)] -= 3;
  }

  for (const node of working) {
    const radius = node.def.effectRadius ?? 2;
    if (node.def.pollution) stamp(node, node.def.pollution, width, height, pollutionField, radius);
    if (node.def.noise) stamp(node, node.def.noise, width, height, noiseField, radius);
  }

  // Traffic is the other half of noise, and the half players can actually fix.
  for (let i = 0; i < tiles.length; i++) {
    if (defAt[i] !== ROAD_ID) continue;
    const t = tiles[i];
    spreadRadial(noiseField, t.x, t.y, width, height, t.traffic * 0.18, 2);
    spreadRadial(pollutionField, t.x, t.y, width, height, t.traffic * 0.05, 1);
  }

  for (let i = 0; i < tiles.length; i++) {
    tiles[i].pollution = clamp(pollutionField[i] + effects.pollution, 0, 100);
    tiles[i].noise = clamp(noiseField[i], 0, 100);
  }

  /* ── 6. Land value ─────────────────────────────────────────────────────── */
  const amenity = new Float32Array(tiles.length);
  for (const node of working) {
    if (!node.def.landValueBonus) continue;
    stamp(node, node.def.landValueBonus, width, height, amenity, node.def.effectRadius ?? 3);
  }

  for (const tile of tiles) {
    if (tile.terrainType === 'water') continue;
    const i = index(tile.x, tile.y, width);
    const coast = nearTerrain(tiles, width, height, tile.x, tile.y, 'water', 3);
    const green = nearTerrain(tiles, width, height, tile.x, tile.y, 'forest', 2);
    // The base is deliberately generous. Land value is the multiplier on every
    // coin the city earns, so a board that starts near zero makes the first
    // hundred residents unpayable — the player is then losing money for reasons
    // they cannot act on, which reads as the game being broken rather than hard.
    // Pollution stays the harshest term: it is the one a player can always fix.
    tile.landValue = clamp(
      24 +
        tile.elevation * 3 +
        coast * 14 +
        green * 6 +
        amenity[i] -
        tile.pollution * 0.55 -
        tile.noise * 0.25 -
        tile.traffic * 0.1,
      0,
      100,
    );
  }

  /* ── 7. Services ───────────────────────────────────────────────────────── */
  const serviceCapacity: Record<ServiceKind, number> = {
    health: 0,
    education: 0,
    safety: 0,
    fire: 0,
    leisure: 0,
  };
  const serviceNodes: Record<ServiceKind, Node[]> = {
    health: [],
    education: [],
    safety: [],
    fire: [],
    leisure: [],
  };
  for (const node of working) {
    const kind = node.def.service;
    if (!kind) continue;
    serviceCapacity[kind] += node.def.serviceCapacity ?? 0;
    serviceNodes[kind].push(node);
  }

  const coverage: Record<ServiceKind, number> = {
    health: 0,
    education: 0,
    safety: 0,
    fire: 0,
    leisure: 0,
  };
  for (const kind of SERVICES) {
    let reached = 0;
    let total = 0;
    for (const home of residentials) {
      const residents = Math.max(0, home.instance.occupiedResidents);
      total += residents;
      const inRange = serviceNodes[kind].some(
        (s) => chebyshev(s.cx, s.cy, home.cx, home.cy) <= (s.def.effectRadius ?? 5),
      );
      if (inRange) reached += residents;
    }
    const reach = total > 0 ? reached / total : 0;
    const capacity = population > 0 ? clamp01(serviceCapacity[kind] / population) : 1;
    coverage[kind] = clamp01(reach * capacity);
  }

  /* ── 8. Efficiency and warnings ────────────────────────────────────────── */
  const rawJobs = working.reduce(
    (sum, n) => sum + (n.def.jobs ?? 0) * BALANCE.levelJobs[n.instance.level - 1],
    0,
  );
  const workforce = Math.floor(population * BALANCE.workforceRatio);
  const staffing = rawJobs > 0 ? clamp01(workforce / rawJobs) : 1;

  for (const node of nodes) {
    const { def, instance } = node;
    const warnings: BuildingWarning[] = [];
    let efficiency = 1;

    if (def.requiresRoad && !node.roadAccess) {
      warnings.push('no-road');
      efficiency = 0;
    }
    if (def.requiresPower && !node.hasPower) {
      warnings.push('no-power');
      efficiency *= BALANCE.noPowerEfficiency;
    }
    if (def.requiresWater && !node.hasWater) {
      warnings.push('no-water');
      efficiency *= BALANCE.noWaterEfficiency;
    }
    if (node.congestion > 0.6) warnings.push('congested');
    efficiency *= 1 - node.congestion * BALANCE.congestionPenalty;

    if ((def.jobs ?? 0) > 0 && staffing < 0.75) {
      if (staffing < 0.5) warnings.push('no-workers');
      efficiency *= 0.45 + 0.55 * staffing;
    }

    const localPollution = averageOver(node.tiles, tiles, width, (t) => t.pollution);
    if (localPollution > 55 && (def.housing ?? 0) > 0) warnings.push('polluted');
    if (def.housing || def.category === 'commercial') {
      efficiency *= clamp01(1 - localPollution / 190);
    }

    efficiency *= 0.55 + 0.45 * instance.condition;

    // Fabrication labs are the one building whose output is gated on schooling —
    // the payoff for a university, made legible in a single line.
    if (def.id === 'fabrication-lab') efficiency *= 0.45 + 0.55 * coverage.education;

    instance.efficiency = clamp01(efficiency);
    instance.warnings = warnings;
    node.warnings = warnings;
  }

  /* ── 9. Jobs ──────────────────────────────────────── */
  const jobs = Math.floor(
    working.reduce(
      (sum, n) =>
        sum + (n.def.jobs ?? 0) * BALANCE.levelJobs[n.instance.level - 1] * n.instance.efficiency,
      0,
    ),
  );
  const jobsFilled = Math.min(jobs, workforce);
  const unemployment = workforce > 0 ? clamp01(1 - jobsFilled / workforce) : 0;

  distributeJobs(working, jobsFilled);

  /* ── 10. Happiness ──────────────────────────────────────────────────────── */
  const residentialLandValue = weightedAverage(residentials, tiles, width, (t) => t.landValue);
  const residentialPollution = weightedAverage(residentials, tiles, width, (t) => t.pollution);
  const poweredShare = shareOfResidents(residentials, (n) => n.hasPower || !n.def.requiresPower);
  const wateredShare = shareOfResidents(residentials, (n) => n.hasWater || !n.def.requiresWater);
  const avgTraffic = averageTraffic(tiles, defAt);

  let amenityBonus = 0;
  for (const node of working) {
    if (!node.def.happinessBonus) continue;
    const served = residentials.reduce(
      (sum, home) =>
        chebyshev(node.cx, node.cy, home.cx, home.cy) <= (node.def.effectRadius ?? 4)
          ? sum + home.instance.occupiedResidents
          : sum,
      0,
    );
    if (population > 0) amenityBonus += node.def.happinessBonus * clamp01(served / population);
  }

  const happiness = clamp(
    46 +
      coverage.health * 13 +
      coverage.education * 8 +
      coverage.safety * 10 +
      coverage.fire * 6 +
      coverage.leisure * 14 +
      Math.min(16, amenityBonus) +
      (residentialLandValue - 40) * 0.16 -
      residentialPollution * 0.3 -
      avgTraffic * 0.1 -
      unemployment * 22 -
      (state.taxRate - BALANCE.neutralTaxRate) * 1.9 -
      (1 - poweredShare) * 26 -
      (1 - wateredShare) * 20 +
      effects.happiness,
    0,
    100,
  );

  /* ── 11. Money ─────────────────────────────────────────────────────────── */
  const taxIncome =
    population *
    (BALANCE.taxBase + (residentialLandValue / 100) * BALANCE.taxLandValue) *
    (state.taxRate / BALANCE.neutralTaxRate);

  let tradeIncome = 0;
  for (const node of working) {
    const filled = node.instance.occupiedJobs;
    if (node.def.category === 'commercial') {
      tradeIncome += filled * BALANCE.commercialRevenue * (0.5 + residentialLandValue / 120);
    } else if (node.def.category === 'industrial') {
      tradeIncome += filled * BALANCE.industrialRevenue;
    } else if (node.def.category === 'recreation' || node.def.id === 'ferry-dock') {
      tradeIncome +=
        (node.def.serviceCapacity ?? 40) *
        BALANCE.tourismRevenue *
        0.02 *
        (happiness / 100) *
        node.instance.efficiency;
    }
  }

  const upkeep = state.buildings.reduce(
    (sum, b) => sum + (tryGetDefinition(b.definitionId)?.upkeep ?? 0),
    0,
  );

  const netIncome = (taxIncome + tradeIncome) * effects.incomeScale - upkeep;

  state.stats = {
    population,
    housingCapacity,
    jobs,
    jobsFilled,
    workforce,
    unemployment,
    powerSupply: Math.round(powerSupply),
    powerDemand: Math.round(powerDemand),
    waterSupply: Math.round(waterSupply),
    waterDemand: Math.round(waterDemand),
    happiness,
    landValue: residentialLandValue || averageLandValue(tiles),
    pollution: averageLandTiles(tiles, (t) => t.pollution),
    traffic: avgTraffic,
    coverage,
    taxIncome,
    tradeIncome,
    upkeep,
    netIncome,
  };
}

/**
 * Move the city on by one month.
 *
 * Order matters: money is banked from *last* month's economy (the numbers the
 * player was looking at), then population moves, then buildings age and grow,
 * then the board is swept. Doing it the other way round means the treasury
 * silently reacts to a change the player has not seen yet.
 */
export function advanceMonth(state: CityState, rng: () => number): void {
  const effects = aggregateEffects(state.events);

  state.money += state.stats.netIncome;
  state.month += 1;

  /* Population — target is capacity scaled by how much people want to live here. */
  const s = state.stats;
  const jobAvailability = s.workforce > 0 ? clamp01(s.jobs / Math.max(1, s.workforce)) : 1;
  const desirability = clamp01(
    0.18 + s.happiness / 145 + jobAvailability * 0.28 - s.unemployment * 0.35,
  );
  const target = s.housingCapacity * desirability;
  const delta = target - s.population;
  const rate = delta >= 0 ? BALANCE.growthRate * effects.growthScale : BALANCE.declineRate;
  // A little jitter keeps a stable city from showing the same number forever.
  const jitter = 0.9 + rng() * 0.2;
  state.stats.population = Math.max(0, Math.round(s.population + delta * rate * jitter));
  state.peakPopulation = Math.max(state.peakPopulation, state.stats.population);

  /* Buildings age, get repaired, and grow. */
  for (const instance of state.buildings) {
    const def = tryGetDefinition(instance.definitionId);
    if (!def) continue;
    const localPollution = s.pollution;
    instance.condition = clamp01(
      instance.condition -
        (BALANCE.conditionDecay + localPollution / 3200) +
        BALANCE.conditionRepair * s.coverage.fire,
    );

    const canGrow =
      (def.category === 'residential' || def.category === 'commercial') &&
      instance.level < 3 &&
      instance.efficiency > 0.6;
    if (canGrow) {
      const tile = state.tiles[index(instance.gridX, instance.gridY, state.width)];
      const needed = BALANCE.upgradeLandValue[instance.level];
      const eligible = tile.landValue >= needed && s.happiness >= 48;
      instance.levelProgress = clamp01(
        instance.levelProgress + (eligible ? 1 / BALANCE.upgradeMonths : -0.15),
      );
      if (instance.levelProgress >= 1) {
        instance.level += 1;
        instance.levelProgress = 0;
      }
    }
  }

  /* Events tick down. */
  state.events = state.events
    .map((e) => ({ ...e, remaining: e.remaining - 1 }))
    .filter((e) => e.remaining > 0);

  recomputeDerived(state);

  state.ledger.push({
    month: state.month,
    income: Math.round(state.stats.netIncome),
    population: state.stats.population,
    happiness: Math.round(state.stats.happiness),
  });
  if (state.ledger.length > 120) state.ledger.shift();
}

/* ── helpers ───────────────────────────────────────────────────────────────
 * Everything below is local plumbing for the two functions above.
 */

/** Orthogonal neighbours of a footprint that are not part of it. */
function adjacentTiles(
  own: { x: number; y: number }[],
  width: number,
  height: number,
): { x: number; y: number }[] {
  const ownKeys = new Set(own.map((t) => `${t.x},${t.y}`));
  const seen = new Set<string>();
  const out: { x: number; y: number }[] = [];
  for (const t of own) {
    for (const { dx, dy } of DIRECTIONS) {
      const nx = t.x + dx;
      const ny = t.y + dy;
      const key = `${nx},${ny}`;
      if (ownKeys.has(key) || seen.has(key)) continue;
      if (!inBounds(nx, ny, width, height)) continue;
      seen.add(key);
      out.push({ x: nx, y: ny });
    }
  }
  return out;
}

/**
 * Hand out a limited utility supply, nearest-to-a-generator first.
 *
 * Producers are always satisfied (see the header note); everything else queues
 * by distance to the closest generator, which is what makes "put the plant where
 * the load is" the right move without modelling a single pipe.
 */
function assignUtility(
  live: Node[],
  producers: Node[],
  supply: number,
  kind: 'power' | 'water',
  demandScale: number,
): void {
  const key = kind === 'power' ? 'hasPower' : 'hasWater';
  const consumptionKey = kind === 'power' ? 'powerConsumption' : 'waterConsumption';
  const generationKey = kind === 'power' ? 'powerGeneration' : 'waterGeneration';

  let budget = supply;
  const queue: Node[] = [];

  for (const node of live) {
    if ((node.def[generationKey] ?? 0) > 0) {
      node[key] = true;
      continue;
    }
    const need = (node.def[consumptionKey] ?? 0) * demandScale;
    if (need <= 0) {
      node[key] = true;
      continue;
    }
    queue.push(node);
  }

  if (!producers.length) {
    for (const node of queue) node[key] = false;
    return;
  }

  const distance = new Map<Node, number>();
  for (const node of queue) {
    let best = Infinity;
    for (const p of producers) best = Math.min(best, chebyshev(p.cx, p.cy, node.cx, node.cy));
    distance.set(node, best);
  }
  queue.sort((a, b) => (distance.get(a) as number) - (distance.get(b) as number));

  for (const node of queue) {
    const need = (node.def[consumptionKey] ?? 0) * demandScale;
    if (budget >= need) {
      budget -= need;
      node[key] = true;
    } else {
      node[key] = false;
    }
  }
}

/**
 * Add `amount` to every tile within a building's effect radius, with falloff.
 *
 * Deliberately NOT scaled by the building's efficiency: efficiency is computed
 * after every field this stamps into, so reading it here would make the sweep
 * depend on its own previous output. Callers pass only buildings that have road,
 * power and water — "operating or not" is the distinction the fields need.
 */
function stamp(
  node: Node,
  amount: number,
  width: number,
  height: number,
  field: Float32Array,
  radius: number,
): void {
  const x0 = Math.floor(node.cx - radius);
  const x1 = Math.ceil(node.cx + radius);
  const y0 = Math.floor(node.cy - radius);
  const y1 = Math.ceil(node.cy + radius);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inBounds(x, y, width, height)) continue;
      const d = chebyshev(x + 0.5, y + 0.5, node.cx, node.cy);
      const f = falloff(d, radius);
      if (f <= 0) continue;
      field[index(x, y, width)] += amount * f;
    }
  }
}

function spreadRadial(
  field: Float32Array,
  x: number,
  y: number,
  width: number,
  height: number,
  amount: number,
  radius: number,
): void {
  if (amount <= 0) return;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny, width, height)) continue;
      const f = falloff(Math.max(Math.abs(dx), Math.abs(dy)), radius);
      if (f > 0) field[index(nx, ny, width)] += amount * f;
    }
  }
}

/** Push road load outward along connected roads, decaying each hop. */
function diffuseAlongRoads(
  load: Float32Array,
  tiles: Tile[],
  width: number,
  height: number,
  defAt: (string | undefined)[],
  hops: number,
  decay: number,
): void {
  let current = load.slice();
  for (let hop = 0; hop < hops; hop++) {
    const next = new Float32Array(load.length);
    for (let i = 0; i < tiles.length; i++) {
      if (defAt[i] !== ROAD_ID || current[i] <= 0) continue;
      const tile = tiles[i];
      const neighbours: number[] = [];
      for (const { dx, dy } of DIRECTIONS) {
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (!inBounds(nx, ny, width, height)) continue;
        const ni = index(nx, ny, width);
        if (defAt[ni] === ROAD_ID) neighbours.push(ni);
      }
      if (!neighbours.length) continue;
      const share = (current[i] * decay) / neighbours.length;
      for (const ni of neighbours) next[ni] += share;
    }
    for (let i = 0; i < load.length; i++) load[i] += next[i];
    current = next;
  }
}

/** Fraction of tiles within `radius` that are the given terrain, 0–1. */
function nearTerrain(
  tiles: Tile[],
  width: number,
  height: number,
  x: number,
  y: number,
  terrain: Tile['terrainType'],
  radius: number,
): number {
  let best = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny, width, height)) continue;
      if (tiles[index(nx, ny, width)].terrainType !== terrain) continue;
      best = Math.max(best, falloff(Math.max(Math.abs(dx), Math.abs(dy)), radius));
    }
  }
  return best;
}

function averageOver(
  own: { x: number; y: number }[],
  tiles: Tile[],
  width: number,
  pick: (tile: Tile) => number,
): number {
  if (!own.length) return 0;
  let sum = 0;
  for (const t of own) sum += pick(tiles[index(t.x, t.y, width)]);
  return sum / own.length;
}

/** Average of a tile field over residential buildings, weighted by residents. */
function weightedAverage(
  homes: Node[],
  tiles: Tile[],
  width: number,
  pick: (tile: Tile) => number,
): number {
  let total = 0;
  let weight = 0;
  for (const home of homes) {
    const w = Math.max(1, home.instance.occupiedResidents);
    total += averageOver(home.tiles, tiles, width, pick) * w;
    weight += w;
  }
  return weight > 0 ? total / weight : 0;
}

function shareOfResidents(homes: Node[], predicate: (node: Node) => boolean): number {
  let total = 0;
  let ok = 0;
  for (const home of homes) {
    const residents = Math.max(1, home.instance.occupiedResidents);
    total += residents;
    if (predicate(home)) ok += residents;
  }
  return total > 0 ? ok / total : 1;
}

function averageLandTiles(tiles: Tile[], pick: (tile: Tile) => number): number {
  let sum = 0;
  let count = 0;
  for (const tile of tiles) {
    if (tile.terrainType === 'water') continue;
    sum += pick(tile);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function averageLandValue(tiles: Tile[]): number {
  return averageLandTiles(tiles, (t) => t.landValue);
}

function averageTraffic(tiles: Tile[], defAt: (string | undefined)[]): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (defAt[i] !== ROAD_ID) continue;
    sum += tiles[i].traffic;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/** Spread the population across housing proportionally to usable capacity. */
function distributeResidents(homes: Node[], population: number): void {
  let capacity = 0;
  const usable = homes.map((home) => {
    capacity += home.capacity;
    return home.capacity;
  });

  let assigned = 0;
  homes.forEach((home, i) => {
    const share = capacity > 0 ? (usable[i] / capacity) * population : 0;
    const residents = Math.min(Math.round(share), Math.floor(usable[i]));
    home.instance.occupiedResidents = residents;
    assigned += residents;
  });

  // Rounding leftovers go wherever there is still room, best building first.
  let leftover = Math.max(0, population - assigned);
  if (!leftover) return;
  const order = homes
    .map((home, i) => ({ home, room: Math.floor(usable[i]) - home.instance.occupiedResidents }))
    .filter((entry) => entry.room > 0)
    .sort((a, b) => b.room - a.room);
  for (const entry of order) {
    if (leftover <= 0) break;
    const take = Math.min(entry.room, leftover);
    entry.home.instance.occupiedResidents += take;
    leftover -= take;
  }
}

function distributeJobs(working: Node[], jobsFilled: number): void {
  const employers = working.filter((n) => (n.def.jobs ?? 0) > 0);
  let capacity = 0;
  const slots = employers.map((n) => {
    const value =
      (n.def.jobs ?? 0) * BALANCE.levelJobs[n.instance.level - 1] * n.instance.efficiency;
    capacity += value;
    return value;
  });
  employers.forEach((node, i) => {
    node.instance.occupiedJobs = capacity > 0 ? Math.round((slots[i] / capacity) * jobsFilled) : 0;
  });
  for (const node of working) {
    if ((node.def.jobs ?? 0) === 0) node.instance.occupiedJobs = 0;
  }
}

/** Catalogue sanity — used by the tests, not by the game. */
export function catalogIds(): string[] {
  return BUILDINGS.map((b) => b.id);
}

export { getDefinition };
