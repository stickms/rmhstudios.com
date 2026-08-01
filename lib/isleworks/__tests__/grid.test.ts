import { describe, expect, it } from 'vitest';

import { getDefinition } from '../catalog';
import { createCity, makeInstance, purchasableParcels, unlockParcel } from '../city';
import {
  PARCEL_SIZE,
  checkPlacement,
  footprintTiles,
  index,
  parcelIndexFor,
  parcelPrice,
  recomputeRoadConnections,
  roadComponents,
  rotatedFootprint,
} from '../grid';
import type { Tile } from '../types';

function blankTiles(width: number, height: number): Tile[] {
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push({
        x,
        y,
        terrainType: 'grass',
        elevation: 1,
        occupied: false,
        roadConnections: [],
        hasPower: false,
        hasWater: false,
        pollution: 0,
        noise: 0,
        landValue: 0,
        traffic: 0,
        unlocked: true,
      });
    }
  }
  return tiles;
}

describe('footprints', () => {
  it('swaps the axes on odd quarter-turns', () => {
    expect(rotatedFootprint({ width: 3, height: 2 }, 0)).toEqual({ width: 3, height: 2 });
    expect(rotatedFootprint({ width: 3, height: 2 }, 1)).toEqual({ width: 2, height: 3 });
    expect(rotatedFootprint({ width: 3, height: 2 }, 2)).toEqual({ width: 3, height: 2 });
    expect(rotatedFootprint({ width: 3, height: 2 }, 3)).toEqual({ width: 2, height: 3 });
  });

  it('covers exactly width × height tiles, anchored at the north-west corner', () => {
    const tiles = footprintTiles(4, 5, { width: 3, height: 2 }, 0);
    expect(tiles).toHaveLength(6);
    expect(tiles[0]).toEqual({ x: 4, y: 5 });
    expect(tiles.at(-1)).toEqual({ x: 6, y: 6 });
  });

  it('keeps the anchor when rotated', () => {
    const rotated = footprintTiles(4, 5, { width: 3, height: 2 }, 1);
    expect(rotated).toHaveLength(6);
    expect(rotated[0]).toEqual({ x: 4, y: 5 });
    expect(rotated.at(-1)).toEqual({ x: 5, y: 7 });
  });
});

describe('placement rules', () => {
  const width = 10;
  const height = 10;

  function ctx(tiles: Tile[], money = 10_000) {
    return { tiles, width, height, money, placedUnique: new Set<string>() };
  }

  it('accepts a legal placement and charges the terrain-adjusted cost', () => {
    const tiles = blankTiles(width, height);
    const def = getDefinition('cottage');
    const check = checkPlacement(def, 2, 2, 0, ctx(tiles));
    expect(check.ok).toBe(true);
    expect(check.cost).toBe(def.cost);
  });

  it('surcharges awkward ground', () => {
    const tiles = blankTiles(width, height);
    tiles[index(2, 2, width)].terrainType = 'rock';
    const check = checkPlacement(getDefinition('cottage'), 2, 2, 0, ctx(tiles));
    expect(check.cost).toBeGreaterThan(getDefinition('cottage').cost);
  });

  it('refuses water, locked land, and occupied tiles', () => {
    const tiles = blankTiles(width, height);
    tiles[index(2, 2, width)].terrainType = 'water';
    expect(checkPlacement(getDefinition('cottage'), 2, 2, 0, ctx(tiles)).error).toBe('water');

    tiles[index(2, 2, width)].terrainType = 'grass';
    tiles[index(2, 2, width)].unlocked = false;
    expect(checkPlacement(getDefinition('cottage'), 2, 2, 0, ctx(tiles)).error).toBe('locked');

    tiles[index(2, 2, width)].unlocked = true;
    tiles[index(2, 2, width)].occupied = true;
    expect(checkPlacement(getDefinition('cottage'), 2, 2, 0, ctx(tiles)).error).toBe('occupied');
  });

  it('refuses a multi-tile building that only partly fits', () => {
    const tiles = blankTiles(width, height);
    tiles[index(5, 4, width)].occupied = true;
    const check = checkPlacement(getDefinition('apartments'), 4, 4, 0, ctx(tiles));
    expect(check.ok).toBe(false);
    expect(check.error).toBe('occupied');
  });

  it('refuses to go off the board', () => {
    const tiles = blankTiles(width, height);
    expect(checkPlacement(getDefinition('apartments'), 9, 9, 0, ctx(tiles)).error).toBe(
      'out-of-bounds',
    );
  });

  it('requires a shoreline for pumps and docks', () => {
    const tiles = blankTiles(width, height);
    const pump = getDefinition('pumping-station');
    expect(checkPlacement(pump, 4, 4, 0, ctx(tiles)).error).toBe('needs-shore');
    tiles[index(3, 4, width)].terrainType = 'water';
    expect(checkPlacement(pump, 4, 4, 0, ctx(tiles)).ok).toBe(true);
  });

  it('refuses what the treasury cannot cover', () => {
    const tiles = blankTiles(width, height);
    expect(checkPlacement(getDefinition('cottage'), 2, 2, 0, ctx(tiles, 10)).error).toBe(
      'too-expensive',
    );
  });

  it('allows only one of a unique building', () => {
    const tiles = blankTiles(width, height);
    const c = ctx(tiles);
    c.placedUnique.add('city-hall');
    expect(checkPlacement(getDefinition('city-hall'), 2, 2, 0, c).error).toBe('already-built');
  });
});

describe('road graph', () => {
  const width = 8;
  const height = 8;

  it('records the sides a road meets another road on', () => {
    const tiles = blankTiles(width, height);
    const roads = new Set([index(2, 2, width), index(3, 2, width), index(2, 3, width)]);
    const isRoad = (tile: Tile) => roads.has(index(tile.x, tile.y, width));
    recomputeRoadConnections(tiles, width, height, isRoad);

    expect(new Set(tiles[index(2, 2, width)].roadConnections)).toEqual(new Set(['e', 's']));
    expect(tiles[index(3, 2, width)].roadConnections).toEqual(['w']);
    expect(tiles[index(4, 4, width)].roadConnections).toEqual([]);
  });

  it('separates disconnected road spurs into their own components', () => {
    const tiles = blankTiles(width, height);
    const roads = new Set([
      index(1, 1, width),
      index(2, 1, width),
      index(3, 1, width),
      index(6, 6, width),
    ]);
    const isRoad = (tile: Tile) => roads.has(index(tile.x, tile.y, width));
    const { componentOf, sizes } = roadComponents(tiles, width, height, isRoad);

    expect(sizes).toHaveLength(2);
    expect(componentOf[index(1, 1, width)]).toBe(componentOf[index(3, 1, width)]);
    expect(componentOf[index(6, 6, width)]).not.toBe(componentOf[index(1, 1, width)]);
    expect(componentOf[index(0, 0, width)]).toBe(-1);
  });
});

describe('land parcels', () => {
  it('maps tiles to the parcel that contains them', () => {
    expect(parcelIndexFor(0, 0, 24)).toBe(0);
    expect(parcelIndexFor(PARCEL_SIZE, 0, 24)).toBe(1);
    expect(parcelIndexFor(0, PARCEL_SIZE, 24)).toBe(24 / PARCEL_SIZE);
  });

  it('charges more for each parcel bought, and less for a mostly-water one', () => {
    const dry = PARCEL_SIZE * PARCEL_SIZE;
    expect(parcelPrice(10, dry)).toBeGreaterThan(parcelPrice(5, dry));
    expect(parcelPrice(8, 4)).toBeLessThan(parcelPrice(8, dry));
  });

  it('only offers parcels adjacent to land already owned', () => {
    const city = createCity(7);
    const offered = purchasableParcels(city);
    expect(offered.length).toBeGreaterThan(0);
    for (const parcel of offered) expect(city.ownedParcels).not.toContain(parcel);

    unlockParcel(city, offered[0]);
    expect(purchasableParcels(city)).not.toContain(offered[0]);
  });
});

describe('new city', () => {
  it('starts with a city hall, some road, and unlocked land in the middle', () => {
    const city = createCity(42);
    expect(city.buildings.some((b) => b.definitionId === 'city-hall')).toBe(true);
    expect(city.buildings.filter((b) => b.definitionId === 'road').length).toBeGreaterThan(0);
    expect(city.ownedParcels).toHaveLength(4);
    expect(city.tiles.some((t) => t.unlocked)).toBe(true);
  });

  it('is deterministic in the seed', () => {
    const a = createCity(123)
      .tiles.map((t) => t.terrainType)
      .join('');
    const b = createCity(123)
      .tiles.map((t) => t.terrainType)
      .join('');
    const c = createCity(124)
      .tiles.map((t) => t.terrainType)
      .join('');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('leaves the middle of the island buildable', () => {
    for (const seed of [1, 2, 3, 99, 4242]) {
      const city = createCity(seed);
      const mid = city.tiles[index(city.width / 2, city.height / 2, city.width)];
      expect(mid.terrainType).not.toBe('water');
      expect(mid.elevation).toBe(1);
    }
  });

  it('never places a starter building on water', () => {
    for (const seed of [5, 15, 25, 35]) {
      const city = createCity(seed);
      for (const building of city.buildings) {
        const def = getDefinition(building.definitionId);
        for (const t of footprintTiles(building.gridX, building.gridY, def.footprint, 0)) {
          expect(city.tiles[index(t.x, t.y, city.width)].terrainType).not.toBe('water');
        }
      }
    }
  });
});

describe('instances', () => {
  it('mints unique ids', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => makeInstance('cottage', 0, 0, 0, 1).instanceId),
    );
    expect(ids.size).toBe(50);
  });
});
