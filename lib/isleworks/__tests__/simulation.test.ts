import { describe, expect, it } from 'vitest';

import { BUILDINGS, getDefinition } from '../catalog';
import { createCity, deserializeCity, makeInstance, serializeCity } from '../city';
import { footprintTiles, index, unlockAllForTest } from './helpers';
import { OBJECTIVES, evaluateObjectives } from '../objectives';
import { hasModel } from '../models';
import { advanceMonth, recomputeDerived } from '../simulation';
import { makeRng } from '../terrain';
import type { CityState } from '../types';

/** A flat, fully-owned island so tests measure the sim, not the terrain. */
function sandbox(): CityState {
  const city = createCity(4242);
  for (const tile of city.tiles) {
    tile.terrainType = tile.terrainType === 'water' ? 'water' : 'grass';
    tile.elevation = 1;
  }
  unlockAllForTest(city);
  recomputeDerived(city);
  return city;
}

function place(city: CityState, definitionId: string, x: number, y: number, rotation = 0): string {
  const instance = makeInstance(definitionId, x, y, rotation, city.month);
  instance.constructionProgress = 1;
  city.buildings.push(instance);
  return instance.instanceId;
}

function find(city: CityState, instanceId: string) {
  const found = city.buildings.find((b) => b.instanceId === instanceId);
  if (!found) throw new Error('missing building');
  return found;
}

/*
 * Test geography.
 *
 * `createCity` puts city hall on rows 11–12 (x = 11–12) and its starter road
 * stub on rows 10–14 at x = 13. Every test lane therefore lives SOUTH of all of
 * that: dropping a test building on top of a starter road silently cuts the road
 * graph in two, `mainComponent` follows city hall into the smaller half, and
 * every connectivity assertion in the file becomes a coin toss.
 */
const LANE_Y = 17;
const NORTH_ROW = LANE_Y - 1;
const SOUTH_ROW = LANE_Y + 1;
/** Column of the spur that joins the lane to the starter stub. Keep it clear. */
const SPUR_X = 13;

function road(city: CityState, x: number, y: number): void {
  if (city.tiles[index(x, y, city.width)].occupied) return;
  place(city, 'road', x, y);
}

/** One east–west lane plus the spur that makes it part of the hall's network. */
function mainRoad(city: CityState, x0 = 3, x1 = 21): void {
  for (let y = 15; y <= LANE_Y; y++) road(city, SPUR_X, y);
  for (let x = x0; x <= x1; x++) road(city, x, LANE_Y);
}

describe('catalogue integrity', () => {
  it('has a unique id and a real model for every entry', () => {
    const ids = new Set<string>();
    for (const def of BUILDINGS) {
      expect(ids.has(def.id), `duplicate id ${def.id}`).toBe(false);
      ids.add(def.id);
      expect(hasModel(def.modelId), `no model for ${def.id}`).toBe(true);
    }
  });

  it('never ships a building that costs nothing to build and nothing to run', () => {
    for (const def of BUILDINGS) {
      if (def.unique) continue;
      expect(def.cost + def.upkeep, def.id).toBeGreaterThan(0);
    }
  });

  it('gives every producer a positive output and every consumer a positive draw', () => {
    for (const def of BUILDINGS) {
      for (const key of [
        'jobs',
        'housing',
        'powerGeneration',
        'powerConsumption',
        'waterGeneration',
        'waterConsumption',
      ] as const) {
        const value = def[key];
        if (value !== undefined) expect(value, `${def.id}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the sweep is idempotent', () => {
  it('produces identical fields when run twice', () => {
    const city = sandbox();
    mainRoad(city, 6, 20);
    place(city, 'cottage', 6, SOUTH_ROW);
    place(city, 'wind-turbine', 8, 20);
    place(city, 'water-tower', 9, 20);

    recomputeDerived(city);
    const first = JSON.stringify({ tiles: city.tiles, stats: city.stats });
    recomputeDerived(city);
    const second = JSON.stringify({ tiles: city.tiles, stats: city.stats });
    expect(second).toBe(first);
  });
});

describe('road connectivity', () => {
  it('warns a building that has no road at all', () => {
    const city = sandbox();
    const id = place(city, 'cottage', 3, 3);
    recomputeDerived(city);
    expect(find(city, id).warnings).toContain('no-road');
    expect(find(city, id).efficiency).toBe(0);
  });

  it('clears the warning once a connected road runs alongside', () => {
    const city = sandbox();
    mainRoad(city, 8, 16);
    const id = place(city, 'cottage', 9, SOUTH_ROW);
    recomputeDerived(city);
    expect(find(city, id).warnings).not.toContain('no-road');
  });

  it('does not count a road spur that never reaches city hall', () => {
    const city = sandbox();
    for (let x = 1; x <= 4; x++) place(city, 'road', x, 2);
    const id = place(city, 'cottage', 2, 3);
    recomputeDerived(city);
    expect(find(city, id).warnings).toContain('no-road');
  });
});

describe('utilities', () => {
  function poweredSandbox(): CityState {
    const city = sandbox();
    mainRoad(city, 3, 21);
    return city;
  }

  it('leaves a building unpowered when nothing generates', () => {
    const city = poweredSandbox();
    const id = place(city, 'cottage', 6, SOUTH_ROW);
    recomputeDerived(city);
    expect(find(city, id).warnings).toContain('no-power');
  });

  it('powers it once a turbine is up', () => {
    const city = poweredSandbox();
    const id = place(city, 'cottage', 6, SOUTH_ROW);
    place(city, 'wind-turbine', 6, 20);
    place(city, 'water-tower', 7, 20);
    recomputeDerived(city);
    const cottage = find(city, id);
    expect(cottage.warnings).not.toContain('no-power');
    expect(cottage.warnings).not.toContain('no-water');
  });

  it('browns out the buildings furthest from a generator first', () => {
    const city = poweredSandbox();
    place(city, 'wind-turbine', 4, 20); // 34 units of supply
    const near = place(city, 'cottage', 4, SOUTH_ROW); // 3 each — enough for 11
    const far: string[] = [];
    for (let i = 0; i < 14; i++) far.push(place(city, 'cottage', 5 + i, SOUTH_ROW));
    recomputeDerived(city);

    expect(find(city, near).warnings).not.toContain('no-power');
    // The far end of the row is the part that goes dark.
    expect(find(city, far.at(-1) as string).warnings).toContain('no-power');
    expect(city.stats.powerDemand).toBeGreaterThan(city.stats.powerSupply);
  });

  it('never starves a generator of the thing it generates', () => {
    const city = poweredSandbox();
    const gas = place(city, 'gas-plant', 5, SOUTH_ROW);
    recomputeDerived(city);
    // No water supply anywhere, yet the plant still generates.
    expect(city.stats.powerSupply).toBeGreaterThan(0);
    expect(find(city, gas).efficiency).toBeGreaterThan(0);
  });
});

describe('pollution and land value', () => {
  /** Same island, same road, same utilities — only the middle building differs. */
  function districtWith(centrepiece: string): CityState {
    const city = sandbox();
    mainRoad(city);
    place(city, 'wind-turbine', 3, 21);
    place(city, 'wind-turbine', 4, 21);
    place(city, 'water-tower', 5, 21);
    place(city, 'water-tower', 6, 21);
    place(city, centrepiece, 8, SOUTH_ROW);
    recomputeDerived(city);
    return city;
  }

  it('drops land value near a factory and lifts it near a plaza', () => {
    const dirty = districtWith('factory');
    const clean = districtWith('plaza');
    const probe = index(9, 20, dirty.width);

    expect(dirty.tiles[probe].pollution).toBeGreaterThan(0);
    expect(dirty.tiles[probe].landValue).toBeLessThan(clean.tiles[probe].landValue);
  });

  it('lets a recycling plant pull pollution back down', () => {
    const city = districtWith('factory');
    const before = city.stats.pollution;
    expect(before).toBeGreaterThan(0);

    place(city, 'recycling-plant', 12, SOUTH_ROW);
    place(city, 'botanical-garden', 15, SOUTH_ROW);
    place(city, 'water-tower', 7, 21);
    place(city, 'water-tower', 8, 21);
    place(city, 'wind-turbine', 9, 21);
    place(city, 'wind-turbine', 10, 21);
    recomputeDerived(city);
    expect(city.stats.pollution).toBeLessThan(before);
  });
});

describe('population and economy', () => {
  function town(): CityState {
    const city = sandbox();
    mainRoad(city);
    for (let i = 0; i < 6; i++) place(city, 'cottage', 4 + i, NORTH_ROW);
    for (let i = 0; i < 4; i++) place(city, 'cottage', 4 + i, SOUTH_ROW);
    place(city, 'corner-store', 15, SOUTH_ROW);
    place(city, 'workshop', 17, SOUTH_ROW);
    place(city, 'wind-turbine', 19, 20);
    place(city, 'wind-turbine', 20, 20);
    place(city, 'water-tower', 19, 21);
    place(city, 'water-tower', 20, 21);
    place(city, 'pocket-park', 10, SOUTH_ROW);
    recomputeDerived(city);
    return city;
  }

  it('grows toward housing capacity when the city is liveable', () => {
    const city = town();
    const rng = makeRng(1);
    for (let i = 0; i < 24; i++) advanceMonth(city, rng);
    expect(city.stats.population).toBeGreaterThan(0);
    expect(city.stats.population).toBeLessThanOrEqual(city.stats.housingCapacity);
  });

  it('records peak population so unlocks never go backwards', () => {
    const city = town();
    const rng = makeRng(2);
    for (let i = 0; i < 20; i++) advanceMonth(city, rng);
    const peak = city.peakPopulation;
    expect(peak).toBeGreaterThan(0);

    city.buildings = city.buildings.filter((b) => b.definitionId !== 'cottage');
    recomputeDerived(city);
    for (let i = 0; i < 12; i++) advanceMonth(city, rng);
    expect(city.stats.population).toBeLessThan(peak);
    expect(city.peakPopulation).toBe(peak);
  });

  it('fills jobs from the workforce and reports the rest as unemployment', () => {
    const city = town();
    const rng = makeRng(3);
    for (let i = 0; i < 30; i++) advanceMonth(city, rng);
    expect(city.stats.jobsFilled).toBeLessThanOrEqual(city.stats.jobs);
    expect(city.stats.jobsFilled).toBeLessThanOrEqual(city.stats.workforce);
    expect(city.stats.unemployment).toBeGreaterThanOrEqual(0);
    expect(city.stats.unemployment).toBeLessThanOrEqual(1);
  });

  it('taxes more at a higher rate and makes citizens less happy for it', () => {
    const low = town();
    const high = town();
    low.taxRate = 6;
    high.taxRate = 18;
    const rng = () => 0.5;
    for (let i = 0; i < 18; i++) {
      advanceMonth(low, rng);
      advanceMonth(high, rng);
    }
    expect(high.stats.taxIncome / Math.max(1, high.stats.population)).toBeGreaterThan(
      low.stats.taxIncome / Math.max(1, low.stats.population),
    );
    expect(high.stats.happiness).toBeLessThan(low.stats.happiness);
  });

  it('keeps every headline stat finite and in range', () => {
    const city = town();
    const rng = makeRng(9);
    for (let i = 0; i < 40; i++) advanceMonth(city, rng);
    const s = city.stats;
    for (const [name, value] of Object.entries(s)) {
      if (typeof value !== 'number') continue;
      expect(Number.isFinite(value), name).toBe(true);
    }
    expect(s.happiness).toBeGreaterThanOrEqual(0);
    expect(s.happiness).toBeLessThanOrEqual(100);
    expect(s.population).toBeGreaterThanOrEqual(0);
  });
});

describe('events', () => {
  it('scales power demand while a heatwave runs and restores it after', () => {
    const city = sandbox();
    mainRoad(city, 4, 20);
    place(city, 'wind-turbine', 5, 20);
    place(city, 'water-tower', 6, 20);
    for (let i = 0; i < 5; i++) place(city, 'cottage', 7 + i, SOUTH_ROW);
    recomputeDerived(city);
    const normal = city.stats.powerDemand;
    expect(normal).toBeGreaterThan(0);

    city.events = [
      {
        id: 'test-heat',
        definitionId: 'heatwave',
        remaining: 2,
        effect: { powerDemandScale: 1.5 },
        title: 'Heatwave',
        body: '',
        tone: 'bad',
      },
    ];
    recomputeDerived(city);
    expect(city.stats.powerDemand).toBeGreaterThan(normal);

    const rng = makeRng(5);
    advanceMonth(city, rng);
    advanceMonth(city, rng);
    expect(city.events).toHaveLength(0);
    expect(city.stats.powerDemand).toBeCloseTo(normal, 5);
  });
});

describe('objectives', () => {
  it('measures progress in 0…1 and never un-completes', () => {
    const city = sandbox();
    city.objectives = evaluateObjectives(city);
    for (const o of city.objectives) {
      expect(o.progress).toBeGreaterThanOrEqual(0);
      expect(o.progress).toBeLessThanOrEqual(1);
    }

    expect(OBJECTIVES.find((o) => o.id === 'first-roads')).toBeDefined();
    for (let i = 0; i < 8; i++) place(city, 'road', 3 + i, 3);
    recomputeDerived(city);
    city.objectives = evaluateObjectives(city);
    expect(city.objectives.find((o) => o.id === 'first-roads')?.complete).toBe(true);

    city.buildings = city.buildings.filter((b) => b.definitionId !== 'road');
    recomputeDerived(city);
    city.objectives = evaluateObjectives(city);
    expect(city.objectives.find((o) => o.id === 'first-roads')?.complete).toBe(true);
  });
});

describe('saves', () => {
  it('round-trips a city through JSON', () => {
    const city = sandbox();
    mainRoad(city, 4, 20);
    place(city, 'cottage', 6, SOUTH_ROW);
    place(city, 'wind-turbine', 7, 20);
    city.money = 1234;
    city.taxRate = 12;
    recomputeDerived(city);
    advanceMonth(city, makeRng(11));

    const restored = deserializeCity(serializeCity(city));
    expect(restored).not.toBeNull();
    const loaded = restored as CityState;
    expect(loaded.money).toBe(Math.round(city.money));
    expect(loaded.taxRate).toBe(city.taxRate);
    expect(loaded.month).toBe(city.month);
    expect(loaded.buildings).toHaveLength(city.buildings.length);
    expect(loaded.stats.population).toBe(city.stats.population);
  });

  it('rejects junk instead of throwing', () => {
    expect(deserializeCity('not json')).toBeNull();
    expect(deserializeCity('{"v":999}')).toBeNull();
  });

  it('drops buildings whose definition no longer exists', () => {
    const city = sandbox();
    const raw = JSON.parse(serializeCity(city)) as { buildings: { d: string }[] };
    raw.buildings.push({ d: 'a-building-from-an-older-build' });
    const restored = deserializeCity(JSON.stringify(raw));
    expect(
      restored?.buildings.every((b) => b.definitionId !== 'a-building-from-an-older-build'),
    ).toBe(true);
  });

  it('keeps every placed building on a tile it actually fits', () => {
    const city = sandbox();
    const hospital = place(city, 'hospital', 5, 5, 1);
    recomputeDerived(city);
    const instance = find(city, hospital);
    const tiles = footprintTiles(
      instance.gridX,
      instance.gridY,
      getDefinition('hospital').footprint,
      instance.rotation,
    );
    for (const t of tiles) {
      expect(city.tiles[index(t.x, t.y, city.width)].buildingId).toBe(hospital);
    }
  });
});
