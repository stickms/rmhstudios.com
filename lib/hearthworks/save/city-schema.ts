import { z } from 'zod';
import { MILESTONE_IDS } from '../content';
import { cellUtility, cellZone, createCity, packCell } from '../world';

/** The city layer's part of a save (version 2). */
const int = z.number().int();
const count = int.nonnegative().default(0);

export const cityStatsSchema = z.object({
  population: count,
  housing: count,
  jobs: count,
  workforce: count,
  homeLots: count,
  markets: count,
  workshops: count,
  parks: count,
  level3: count,
  roads: count,
  connectedRoads: count,
  powerSupply: count,
  powerDemand: count,
  waterSupply: count,
  waterDemand: count,
  powerCover: int.min(0).max(100).default(100),
  waterCover: int.min(0).max(100).default(100),
  happiness: int.min(0).max(100).default(50),
  demandHomes: int.min(0).max(100).default(0),
  demandMarket: int.min(0).max(100).default(0),
  demandWorkshop: int.min(0).max(100).default(0),
  tax: count,
  trade: count,
  upkeep: count,
  net: int.default(0),
});

const milestoneId = z.string().refine((v) => MILESTONE_IDS.includes(v), 'unknown milestone');

/** Every packed cell must decode to something real: utility codes stop at the last utility, and a level needs a zone. */
const validCell = (c: number) => {
  const level = (c >> 3) & 3;
  const zoned = cellZone(c) !== null;
  const utilityCode = (c >> 5) & 7;
  if (utilityCode !== 0 && cellUtility(c) === null) return false;
  if (level > 0 && !zoned) return false;
  return true;
};

export const citySchema = z.object({
  cells: z.array(int.min(0).max(255)).refine((cs) => cs.every(validCell), 'bad city cell'),
  flags: z.array(int.min(0).max(7)),
  roadCount: int.nonnegative(),
  dirty: z.boolean().default(true),
  population: int.nonnegative(),
  peakPopulation: int.nonnegative(),
  day: int.nonnegative(),
  reached: z.array(milestoneId).max(64),
  claimed: z.array(milestoneId).max(64),
  stats: cityStatsSchema.default(() => createCity(1).stats),
});

/**
 * Raw-JSON migration run before validation. A save from before the city layer has no `city`; its `road` buildings
 * (roads used to be ordinary buildings) become road tiles on a fresh city, and the derived data is left stale so the
 * first step rebuilds it. Anything malformed is left alone for the schema to refuse.
 */
export function migrateToCity(json: unknown): unknown {
  if (!json || typeof json !== 'object') return json;
  const w = json as Record<string, unknown>;
  const size = w.size;
  const buildings = w.buildings;
  if (
    typeof size !== 'number' ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 4096 ||
    !Array.isArray(buildings)
  )
    return json;
  const terrain = w.terrain;
  if (!Array.isArray(terrain)) return json;
  const hasRoadBuildings = buildings.some((b) => (b as { kind?: unknown } | null)?.kind === 'road');
  if (w.city !== undefined && !hasRoadBuildings) return json;
  const city = (w.city as ReturnType<typeof createCity> | undefined) ?? createCity(size);
  if (!Array.isArray(city.cells) || city.cells.length !== size * size) return json;
  const rest: unknown[] = [];
  for (const b of buildings) {
    const e = b as { kind?: unknown; x?: unknown; z?: unknown } | null;
    if (e?.kind !== 'road') {
      rest.push(b);
      continue;
    }
    const x = e.x;
    const z = e.z;
    if (
      typeof x !== 'number' ||
      typeof z !== 'number' ||
      !Number.isInteger(x) ||
      !Number.isInteger(z)
    )
      continue;
    if (x < 0 || z < 0 || x >= size || z >= size) continue;
    const i = z * size + x;
    const t = terrain[i];
    if ((t !== 'grass' && t !== 'sand') || city.cells[i] !== 0) continue;
    city.cells[i] = packCell({ road: true });
    city.roadCount++;
  }
  city.dirty = true;
  return { ...w, buildings: rest, city };
}
