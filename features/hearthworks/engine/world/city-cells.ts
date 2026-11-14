import {
  DEFAULT_TAX_RATE,
  ROAD_MAX_GRADE,
  UTILITY_IDS,
  ZONE_IDS,
  type UtilityId,
  type ZoneId,
} from '../content/city';
import type {
  CityState,
  CityStats,
} from './city-types';

/** Bit layout of a packed cell — see city-types.ts. */
export const CELL_ROAD = 1;
const ZONE_SHIFT = 1;
const LEVEL_SHIFT = 3;
const UTILITY_SHIFT = 5;

/** Derived flag bits. */
export const FLAG_CONNECTED = 1;
export const FLAG_POWERED = 2;
export const FLAG_WATERED = 4;

export const zoneCode =
  (
    z: ZoneId,
  ): number =>
    ZONE_IDS.indexOf(
      z,
    ) +
    1;
export const utilityCode =
  (
    u: UtilityId,
  ): number =>
    UTILITY_IDS.indexOf(
      u,
    ) +
    1;

export const cellRoad =
  (
    c: number,
  ): boolean =>
    (c &
      CELL_ROAD) !==
    0;
export const cellZone =
  (
    c: number,
  ): ZoneId | null =>
    ZONE_IDS[
      ((c >>
        ZONE_SHIFT) &
        3) -
        1
    ] ??
    null;
export const cellLevel =
  (
    c: number,
  ): number =>
    (c >>
      LEVEL_SHIFT) &
    3;
export const cellUtility =
  (
    c: number,
  ): UtilityId | null =>
    UTILITY_IDS[
      ((c >>
        UTILITY_SHIFT) &
        7) -
        1
    ] ??
    null;

export function packCell(f: {
  road?: boolean;
  zone?: ZoneId | null;
  level?: number;
  utility?: UtilityId | null;
}): number {
  return (
    (f.road
      ? CELL_ROAD
      : 0) |
    ((f.zone
      ? zoneCode(
          f.zone,
        )
      : 0) <<
      ZONE_SHIFT) |
    (((f.level ??
      0) &
      3) <<
      LEVEL_SHIFT) |
    ((f.utility
      ? utilityCode(
          f.utility,
        )
      : 0) <<
      UTILITY_SHIFT)
  );
}

export const emptyStats =
  (): CityStats => ({
    population: 0,
    housing: 0,
    jobs: 0,
    workforce: 0,
    homeLots: 0,
    markets: 0,
    workshops: 0,
    parks: 0,
    level3: 0,
    roads: 0,
    connectedRoads: 0,
    powerSupply: 0,
    powerDemand: 0,
    waterSupply: 0,
    waterDemand: 0,
    powerCover: 100,
    waterCover: 100,
    happiness: 50,
    demandHomes: 0,
    demandMarket: 0,
    demandWorkshop: 0,
    tax: 0,
    trade: 0,
    upkeep: 0,
    net: 0,
  });

export function createCity(
  size: number,
): CityState {
  return {
    cells:
      new Array<number>(
        size *
          size,
      ).fill(
        0,
      ),
    flags:
      new Array<number>(
        size *
          size,
      ).fill(
        0,
      ),
    roadCount: 0,
    dirty: true,
    population: 0,
    peakPopulation: 0,
    day: 0,
    reached:
      [],
    claimed:
      [],
    taxRate:
      DEFAULT_TAX_RATE,
    event:
      null,
    stats:
      emptyStats(),
  };
}

interface Grid {
  size: number;
  city: CityState;
  height: number[];
}

const idx =
  (
    g: {
      size: number;
    },
    x: number,
    z: number,
  ) =>
    z *
      g.size +
    x;
const inside =
  (
    g: {
      size: number;
    },
    x: number,
    z: number,
  ) =>
    x >=
      0 &&
    z >=
      0 &&
    x <
      g.size &&
    z <
      g.size;

/** Raw packed cell at a tile (0 off the map). */
export function cellAt(
  w: Grid,
  x: number,
  z: number,
): number {
  return Number.isInteger(
    x,
  ) &&
    Number.isInteger(
      z,
    ) &&
    inside(
      w,
      x,
      z,
    )
    ? (w
        .city
        .cells[
        idx(
          w,
          x,
          z,
        )
      ] ??
        0)
    : 0;
}
export const roadAt =
  (
    w: Grid,
    x: number,
    z: number,
  ): boolean =>
    cellRoad(
      cellAt(
        w,
        x,
        z,
      ),
    );
export const zoneAt =
  (
    w: Grid,
    x: number,
    z: number,
  ): ZoneId | null =>
    cellZone(
      cellAt(
        w,
        x,
        z,
      ),
    );
export const lotLevelAt =
  (
    w: Grid,
    x: number,
    z: number,
  ): number =>
    cellLevel(
      cellAt(
        w,
        x,
        z,
      ),
    );
export const utilityAt =
  (
    w: Grid,
    x: number,
    z: number,
  ): UtilityId | null =>
    cellUtility(
      cellAt(
        w,
        x,
        z,
      ),
    );
export function flagsAt(
  w: Grid,
  x: number,
  z: number,
): number {
  return Number.isInteger(
    x,
  ) &&
    Number.isInteger(
      z,
    ) &&
    inside(
      w,
      x,
      z,
    )
    ? (w
        .city
        .flags[
        idx(
          w,
          x,
          z,
        )
      ] ??
        0)
    : 0;
}

/** True if a developed lot or a utility stands here — something solid people must walk around. */
export function citySolidAt(
  w: Grid,
  x: number,
  z: number,
): boolean {
  const c =
    cellAt(
      w,
      x,
      z,
    );
  return (
    cellLevel(
      c,
    ) >
      0 ||
    cellUtility(
      c,
    ) !==
      null
  );
}

/**
 * True if a walker stepping A → B (orthogonal neighbours) stays on the road: both tiles are road and the ground
 * between them rises or falls by no more than a ramp. This is the one test the pathfinder, the mover and the
 * renderer share, so what is drawn as a joined road is exactly what is walked as one.
 */
export function roadLink(
  w: Grid,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): boolean {
  if (
    Math.abs(
      ax -
        bx,
    ) +
      Math.abs(
        az -
          bz,
      ) !==
    1
  )
    return false;
  if (
    !roadAt(
      w,
      ax,
      az,
    ) ||
    !roadAt(
      w,
      bx,
      bz,
    )
  )
    return false;
  return (
    Math.abs(
      w
        .height[
        idx(
          w,
          ax,
          az,
        )
      ] -
        w
          .height[
          idx(
            w,
            bx,
            bz,
          )
        ],
    ) <=
    ROAD_MAX_GRADE
  );
}

export const cityHub =
  (
    size: number,
  ): {
    x: number;
    z: number;
  } => ({
    x: Math.floor(
      size /
        2,
    ),
    z: Math.floor(
      size /
        2,
    ),
  });
