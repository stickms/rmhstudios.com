import { z } from 'zod';
import {
  CITY_EVENT_IDS,
  CITY_EVENTS,
  DEFAULT_TAX_RATE,
  MAX_TAX_RATE,
  MILESTONE_IDS,
  MIN_TAX_RATE,
} from '../content';
import {
  cellUtility,
  cellZone,
  createCity,
  packCell,
} from '../world';

/** The city layer's part of a save (version 2; the tax rate and events are version 3). */
const int =
  z
    .number()
    .int();
const count =
  int
    .nonnegative()
    .default(
      0,
    );

export const cityStatsSchema =
  z.object(
    {
      population:
        count,
      housing:
        count,
      jobs: count,
      workforce:
        count,
      homeLots:
        count,
      markets:
        count,
      workshops:
        count,
      parks:
        count,
      level3:
        count,
      roads:
        count,
      connectedRoads:
        count,
      powerSupply:
        count,
      powerDemand:
        count,
      waterSupply:
        count,
      waterDemand:
        count,
      powerCover:
        int
          .min(
            0,
          )
          .max(
            100,
          )
          .default(
            100,
          ),
      waterCover:
        int
          .min(
            0,
          )
          .max(
            100,
          )
          .default(
            100,
          ),
      happiness:
        int
          .min(
            0,
          )
          .max(
            100,
          )
          .default(
            50,
          ),
      demandHomes:
        int
          .min(
            0,
          )
          .max(
            100,
          )
          .default(
            0,
          ),
      demandMarket:
        int
          .min(
            0,
          )
          .max(
            100,
          )
          .default(
            0,
          ),
      demandWorkshop:
        int
          .min(
            0,
          )
          .max(
            100,
          )
          .default(
            0,
          ),
      tax: count,
      trade:
        count,
      upkeep:
        count,
      net: int.default(
        0,
      ),
    },
  );

const milestoneId =
  z
    .string()
    .refine(
      (
        v,
      ) =>
        MILESTONE_IDS.includes(
          v,
        ),
      'unknown milestone',
    );

/** Every packed cell must decode to something real: utility codes stop at the last utility, and a level needs a zone. */
const validCell =
  (
    c: number,
  ) => {
    const level =
      (c >>
        3) &
      3;
    const zoned =
      cellZone(
        c,
      ) !==
      null;
    const utilityCode =
      (c >>
        5) &
      7;
    if (
      utilityCode !==
        0 &&
      cellUtility(
        c,
      ) ===
        null
    )
      return false;
    if (
      level >
        0 &&
      !zoned
    )
      return false;
    return true;
  };

const cityEventSchema =
  z
    .object(
      {
        id: z.enum(
          CITY_EVENT_IDS,
        ),
        since:
          int.nonnegative(),
        daysLeft:
          int.min(
            1,
          ),
      },
    )
    .refine(
      (
        e,
      ) =>
        e.daysLeft <=
        CITY_EVENTS[
          e
            .id
        ]
          .days,
      'event outlasts its length',
    );

export const citySchema =
  z.object(
    {
      cells:
        z
          .array(
            int
              .min(
                0,
              )
              .max(
                255,
              ),
          )
          .refine(
            (
              cs,
            ) =>
              cs.every(
                validCell,
              ),
            'bad city cell',
          ),
      flags:
        z.array(
          int
            .min(
              0,
            )
            .max(
              7,
            ),
        ),
      roadCount:
        int.nonnegative(),
      dirty:
        z
          .boolean()
          .default(
            true,
          ),
      population:
        int.nonnegative(),
      peakPopulation:
        int.nonnegative(),
      day: int.nonnegative(),
      reached:
        z
          .array(
            milestoneId,
          )
          .max(
            64,
          ),
      claimed:
        z
          .array(
            milestoneId,
          )
          .max(
            64,
          ),
      taxRate:
        int
          .min(
            MIN_TAX_RATE,
          )
          .max(
            MAX_TAX_RATE,
          ),
      event:
        cityEventSchema.nullable(),
      stats:
        cityStatsSchema.default(
          () =>
            createCity(
              1,
            )
              .stats,
        ),
    },
  );

/**
 * Raw-JSON migration run before validation. A save from before the city layer has no `city`; its `road` buildings
 * (roads used to be ordinary buildings) become road tiles on a fresh city, and the derived data is left stale so the
 * first step rebuilds it. Anything malformed is left alone for the schema to refuse.
 */
export function migrateToCity(
  json: unknown,
): unknown {
  if (
    !json ||
    typeof json !==
      'object'
  )
    return json;
  const w =
    json as Record<
      string,
      unknown
    >;
  const size =
    w.size;
  const buildings =
    w.buildings;
  if (
    typeof size !==
      'number' ||
    !Number.isInteger(
      size,
    ) ||
    size <
      1 ||
    size >
      4096 ||
    !Array.isArray(
      buildings,
    )
  )
    return json;
  const terrain =
    w.terrain;
  if (
    !Array.isArray(
      terrain,
    )
  )
    return json;
  const hasRoadBuildings =
    buildings.some(
      (
        b,
      ) =>
        (
          b as {
            kind?: unknown;
          } | null
        )
          ?.kind ===
        'road',
    );
  if (
    w.city !==
      undefined &&
    !hasRoadBuildings
  )
    return json;
  const city =
    (w.city as
      | ReturnType<
          typeof createCity
        >
      | undefined) ??
    createCity(
      size,
    );
  if (
    !Array.isArray(
      city.cells,
    ) ||
    city
      .cells
      .length !==
      size *
        size
  )
    return json;
  const rest: unknown[] =
    [];
  for (const b of buildings) {
    const e =
      b as {
        kind?: unknown;
        x?: unknown;
        z?: unknown;
      } | null;
    if (
      e?.kind !==
      'road'
    ) {
      rest.push(
        b,
      );
      continue;
    }
    const x =
      e.x;
    const z =
      e.z;
    if (
      typeof x !==
        'number' ||
      typeof z !==
        'number' ||
      !Number.isInteger(
        x,
      ) ||
      !Number.isInteger(
        z,
      )
    )
      continue;
    if (
      x <
        0 ||
      z <
        0 ||
      x >=
        size ||
      z >=
        size
    )
      continue;
    const i =
      z *
        size +
      x;
    const t =
      terrain[
        i
      ];
    if (
      (t !==
        'grass' &&
        t !==
          'sand') ||
      city
        .cells[
        i
      ] !==
        0
    )
      continue;
    city.cells[
      i
    ] =
      packCell(
        {
          road: true,
        },
      );
    city.roadCount++;
  }
  city.dirty = true;
  return {
    ...w,
    buildings:
      rest,
    city,
  };
}

/**
 * Version 2 → 3: the city gains a tax rate and an event slot. A version 2 city (or none at all, for version 1) gets
 * the default rate — the one at which income, happiness and move-in are exactly what they were — and no event. A
 * version 3 save must carry both (the schema refuses one that does not). Raw JSON in, raw JSON out.
 */
export function migrateCityToV3(
  json: unknown,
  fromVersion: number,
): unknown {
  if (
    fromVersion >=
      3 ||
    !json ||
    typeof json !==
      'object'
  )
    return json;
  const w =
    json as Record<
      string,
      unknown
    >;
  const city =
    w.city;
  if (
    !city ||
    typeof city !==
      'object'
  )
    return json;
  return {
    ...w,
    city: {
      taxRate:
        DEFAULT_TAX_RATE,
      event:
        null,
      ...(city as object),
    },
  };
}
