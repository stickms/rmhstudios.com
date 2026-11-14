/**
 * The city layer's simulation: which roads join the town green, which lots are lit and watered, how many people
 * live here and how happy they are, which zones want to grow, and what the town earns each day. Everything here is
 * a pure function of `World` (plus the world's tick and seed), so every replica of the lockstep sim agrees. See
 * docs/hearthworks-city.md for the rules in prose.
 *
 * Two entry points: `recomputeCity` rebuilds the derived data (`flags`, `stats`) from the cells — call it, or set
 * `city.dirty`, after any edit — and `tickCity` advances the stateful parts (lots growing, people moving in, the
 * daily accounts, milestones).
 */

import {
  BASE_HAPPINESS,
  CITY_EVENTS,
  CITY_EVENT_IDS,
  COTTAGE_HOUSING,
  DAY_TICKS,
  DEFAULT_TAX_RATE,
  EVENT_CHANCE,
  EVENT_MIN_DAY,
  EVENT_MIN_POPULATION,
  EVENT_SALT_PICK,
  EVENT_SALT_START,
  GROWTH_PER_STEP,
  GROWTH_SCALE_LOTS,
  GROWTH_TICKS,
  CITY_REFRESH_TICKS,
  HARVESTER_POWER,
  KITCHEN_JOBS,
  LEVEL_UP_CHANCE,
  MAX_LOT_LEVEL,
  MILESTONES,
  MOVE_IN_CAP,
  MOVE_IN_MIN,
  MOVE_IN_SHARE,
  MOVE_OUT_SHARE,
  PARK_RADIUS,
  POPULATION_TICKS,
  ROAD_UPKEEP,
  SHOP_RADIUS,
  SPROUT_CHANCE,
  SPROUT_DEMAND_FLOOR,
  STALL_JOBS,
  STALL_SERVES,
  TAX_DESIRABILITY_PER_POINT,
  TAX_HAPPINESS_PER_POINT,
  TAX_PER_RESIDENT,
  UNLOCK_IDS,
  UNPOWERED_HOUSING,
  UNPOWERED_JOBS,
  UNWATERED_HOUSING,
  UTILITIES,
  WORKFORCE_RATIO,
  WORKSHOP_RADIUS,
  ZONES,
  isUtilityId,
  taxIncomeFactor,
  type CityEventDef,
  type CityEventId,
  type MetricId,
  type MilestoneDef,
  type UnlockId,
  type UtilityId,
  type ZoneId,
} from '../content';
import { agentOnTile } from './agents';
import {
  FLAG_CONNECTED,
  FLAG_POWERED,
  FLAG_WATERED,
  cellLevel,
  cellRoad,
  cellUtility,
  cellZone,
  cityHub,
  roadLink,
} from './city-cells';
import type {
  CityState,
  CityStats,
} from './city-types';
import type {
  World,
  WorldEvent,
} from './types';
import {
  clamp,
  clamp01,
} from '@/lib/core/math';

const DIRS4 =
  [
    [
      0,
      -1,
    ],
    [
      1,
      0,
    ],
    [
      0,
      1,
    ],
    [
      -1,
      0,
    ],
  ] as const;

const chebyshev =
  (
    ax: number,
    az: number,
    bx: number,
    bz: number,
  ) =>
    Math.max(
      Math.abs(
        ax -
          bx,
      ),
      Math.abs(
        az -
          bz,
      ),
    );

/** A stable pseudo-random number in [0,1) from integers — city growth uses it so it never touches the world's rng stream. */
export function hash01(
  a: number,
  b: number,
  c: number,
): number {
  let h =
    Math.imul(
      a |
        0,
      374761393,
    ) ^
    Math.imul(
      b |
        0,
      668265263,
    ) ^
    Math.imul(
      c |
        0,
      1274126177,
    );
  h =
    Math.imul(
      h ^
        (h >>>
          13),
      1274126177,
    );
  h =
    Math.imul(
      h ^
        (h >>>
          16),
      2246822519,
    );
  return (
    ((h ^
      (h >>>
        15)) >>>
      0) /
    4294967296
  );
}

/** Mark the derived city data out of date (the next step, or `recomputeCity`, refreshes it). */
export function touchCity(
  w: World,
): void {
  w.city.dirty = true;
}

/* ── Tax rate and events ─────────────────────────────────────────────────────────────────────────────────── */

/** What the active event does right now (all neutral when there is none). A pure read of `CityState`. */
export function eventEffects(
  c: Pick<
    CityState,
    'event'
  >,
): Omit<
  CityEventDef,
  | 'name'
  | 'days'
  | 'weight'
  | 'needs'
> {
  const def =
    c.event
      ? CITY_EVENTS[
          c
            .event
            .id
        ]
      : undefined;
  return def
    ? {
        happiness:
          def.happiness,
        power:
          def.power,
        water:
          def.water,
        trade:
          def.trade,
        tax: def.tax,
      }
    : {
        happiness: 0,
        power: 1,
        water: 1,
        trade: 1,
        tax: 1,
      };
}

/** Points the tax rate adds to (negative above the default) happiness. 0 at the default rate. */
export const taxHappiness =
  (
    rate: number,
  ): number =>
    (DEFAULT_TAX_RATE -
      rate) *
    TAX_HAPPINESS_PER_POINT;
/** What the tax rate adds to residents' desirability (negative above the default). 0 at the default rate. */
export const taxDesirability =
  (
    rate: number,
  ): number =>
    (DEFAULT_TAX_RATE -
      rate) *
    TAX_DESIRABILITY_PER_POINT;

/**
 * Today's event draw, if any: a pure function of (seed, day, the town's size and utilities), using only `hash01`.
 * The world's rng is never touched, so adding events moved no other random stream. `null` = a quiet day.
 */
export function drawCityEvent(
  w: World,
  day: number,
): CityEventId | null {
  const s =
    w
      .city
      .stats;
  if (
    day <
      EVENT_MIN_DAY ||
    w
      .city
      .population <
      EVENT_MIN_POPULATION
  )
    return null;
  if (
    hash01(
      w.seed,
      EVENT_SALT_START,
      day,
    ) >=
    EVENT_CHANCE
  )
    return null;
  const able =
    CITY_EVENT_IDS.filter(
      (
        id,
      ) => {
        const need =
          CITY_EVENTS[
            id
          ]
            .needs;
        return (
          need ===
            null ||
          (need ===
          'power'
            ? s.powerSupply
            : s.waterSupply) >
            0
        );
      },
    );
  const total =
    able.reduce(
      (
        sum,
        id,
      ) =>
        sum +
        CITY_EVENTS[
          id
        ]
          .weight,
      0,
    );
  if (
    total <=
    0
  )
    return null;
  let roll =
    hash01(
      w.seed,
      EVENT_SALT_PICK,
      day,
    ) *
    total;
  for (const id of able) {
    roll -=
      CITY_EVENTS[
        id
      ]
        .weight;
    if (
      roll <
      0
    )
      return id;
  }
  return able[
    able.length -
      1
  ];
}

/* ── Derived data ─────────────────────────────────────────────────────────────────────────────────────────── */

interface Site {
  i: number;
  x: number;
  z: number;
}
interface Consumer extends Site {
  power: number;
  water: number;
}
interface Producer extends Site {
  kind: UtilityId;
  supply: number;
  reach: number;
  /** Road steps from this producer's feeding road tile, over the main network (-1 = out of reach). */
  dist: Int16Array;
}

/** The land value of a tile: what its neighbours make it worth. Decides how far a lot can grow. */
export function landValueAt(
  w: World,
  x: number,
  z: number,
): number {
  const n =
    w.size;
  const c =
    w.city;
  let parks = 0;
  let shops = 0;
  let works = 0;
  let coast = 0;
  for (
    let dz =
      -SHOP_RADIUS;
    dz <=
    SHOP_RADIUS;
    dz++
  ) {
    for (
      let dx =
        -SHOP_RADIUS;
      dx <=
      SHOP_RADIUS;
      dx++
    ) {
      const tx =
        x +
        dx;
      const tz =
        z +
        dz;
      if (
        tx <
          0 ||
        tz <
          0 ||
        tx >=
          n ||
        tz >=
          n
      )
        continue;
      const d =
        Math.max(
          Math.abs(
            dx,
          ),
          Math.abs(
            dz,
          ),
        );
      const i =
        tz *
          n +
        tx;
      if (
        d <=
          2 &&
        w
          .terrain[
          i
        ] ===
          'water'
      )
        coast = 1;
      const cell =
        c
          .cells[
          i
        ];
      if (
        cellLevel(
          cell,
        ) >
          0 &&
        cellZone(
          cell,
        ) ===
          'market'
      )
        shops++;
      if (
        d <=
          WORKSHOP_RADIUS &&
        cellLevel(
          cell,
        ) >
          0 &&
        cellZone(
          cell,
        ) ===
          'workshop'
      )
        works++;
    }
  }
  for (const b of w.buildings) {
    const d =
      chebyshev(
        b.x,
        b.z,
        x,
        z,
      );
    if (
      b.kind ===
        'park' &&
      d <=
        PARK_RADIUS
    )
      parks++;
    if (
      b.kind ===
        'stall' &&
      d <=
        SHOP_RADIUS
    )
      shops++;
  }
  const f =
    c
      .flags[
      z *
        n +
        x
    ];
  return (
    40 +
    Math.min(
      2,
      parks,
    ) *
      10 +
    Math.min(
      2,
      shops,
    ) *
      5 +
    coast *
      8 -
    Math.min(
      2,
      works,
    ) *
      12 -
    (f &
    FLAG_POWERED
      ? 0
      : 15) -
    (f &
    FLAG_WATERED
      ? 0
      : 10)
  );
}

/**
 * Rebuild everything derived from the cells and buildings: which road tiles are on the network that reaches the
 * town green, which sites are connected, powered and watered, and the stats the HUD and the rules read. Idempotent.
 */
export function recomputeCity(
  w: World,
): void {
  const c =
    w.city;
  const n =
    w.size;
  const cells =
    c.cells;
  const flags =
    c.flags;
  flags.fill(
    0,
  );

  /* 1. The road network that reaches the green. */
  const fx =
    eventEffects(
      c,
    );
  const hub =
    cityHub(
      n,
    );
  const roadDist =
    new Int16Array(
      n *
        n,
    ).fill(
      -1,
    );
  const queue =
    new Int32Array(
      n *
        n,
    );
  let head = 0;
  let tail = 0;
  let roads = 0;
  for (
    let i = 0;
    i <
    cells.length;
    i++
  ) {
    if (
      !cellRoad(
        cells[
          i
        ],
      )
    )
      continue;
    roads++;
    const x =
      i %
      n;
    const z =
      (i -
        x) /
      n;
    if (
      chebyshev(
        x,
        z,
        hub.x,
        hub.z,
      ) <=
      1
    ) {
      roadDist[
        i
      ] =
        0;
      queue[
        tail++
      ] =
        i;
    }
  }
  let connectedRoads = 0;
  while (
    head <
    tail
  ) {
    const i =
      queue[
        head++
      ];
    flags[
      i
    ] |=
      FLAG_CONNECTED;
    connectedRoads++;
    const x =
      i %
      n;
    const z =
      (i -
        x) /
      n;
    for (const [
      dx,
      dz,
    ] of DIRS4) {
      const nx =
        x +
        dx;
      const nz =
        z +
        dz;
      if (
        nx <
          0 ||
        nz <
          0 ||
        nx >=
          n ||
        nz >=
          n
      )
        continue;
      const j =
        nz *
          n +
        nx;
      if (
        roadDist[
          j
        ] >=
          0 ||
        !roadLink(
          w,
          x,
          z,
          nx,
          nz,
        )
      )
        continue;
      roadDist[
        j
      ] =
        roadDist[
          i
        ] +
        1;
      queue[
        tail++
      ] =
        j;
    }
  }

  /** The main-network road tiles beside a site. */
  const feeders =
    (
      x: number,
      z: number,
    ): number[] => {
      const out: number[] =
        [];
      for (const [
        dx,
        dz,
      ] of DIRS4) {
        const nx =
          x +
          dx;
        const nz =
          z +
          dz;
        if (
          nx <
            0 ||
          nz <
            0 ||
          nx >=
            n ||
          nz >=
            n
        )
          continue;
        const j =
          nz *
            n +
          nx;
        if (
          roadDist[
            j
          ] >=
          0
        )
          out.push(
            j,
          );
      }
      return out;
    };

  /* 2. Sites: lots, producers, and the buildings the city counts. */
  const lots: (Site & {
    zone: ZoneId;
    level: number;
    fed: number[];
  })[] =
    [];
  const producers: Producer[] =
    [];
  const homeSites: {
    x: number;
    z: number;
    housing: number;
    i: number;
  }[] =
    [];
  let housing = 0;
  let jobs = 0;
  let serves = 0;
  let homeLots = 0;
  let markets = 0;
  let workshops = 0;
  let level3 = 0;
  let parks = 0;
  let trade = 0;
  let utilityUpkeep = 0;

  for (
    let i = 0;
    i <
    cells.length;
    i++
  ) {
    const cell =
      cells[
        i
      ];
    const x =
      i %
      n;
    const z =
      (i -
        x) /
      n;
    const util =
      cellUtility(
        cell,
      );
    if (
      util
    ) {
      utilityUpkeep +=
        UTILITIES[
          util
        ]
          .upkeep;
      const fed =
        feeders(
          x,
          z,
        );
      if (
        fed.length >
        0
      ) {
        flags[
          i
        ] |=
          FLAG_CONNECTED;
        const def =
          UTILITIES[
            util
          ];
        const dist =
          new Int16Array(
            n *
              n,
          ).fill(
            -1,
          );
        const q: number[] =
          [];
        for (const f of fed) {
          dist[
            f
          ] =
            0;
          q.push(
            f,
          );
        }
        for (
          let h = 0;
          h <
          q.length;
          h++
        ) {
          const k =
            q[
              h
            ];
          if (
            dist[
              k
            ] >=
            def.reach
          )
            continue;
          const kx =
            k %
            n;
          const kz =
            (k -
              kx) /
            n;
          for (const [
            dx,
            dz,
          ] of DIRS4) {
            const nx =
              kx +
              dx;
            const nz =
              kz +
              dz;
            if (
              nx <
                0 ||
              nz <
                0 ||
              nx >=
                n ||
              nz >=
                n
            )
              continue;
            const j =
              nz *
                n +
              nx;
            if (
              dist[
                j
              ] >=
                0 ||
              roadDist[
                j
              ] <
                0 ||
              !roadLink(
                w,
                kx,
                kz,
                nx,
                nz,
              )
            )
              continue;
            dist[
              j
            ] =
              dist[
                k
              ] +
              1;
            q.push(
              j,
            );
          }
        }
        // A storm or a dry spell cuts what a producer gives (a partial, whole-unit cut) while it lasts.
        const cut =
          def.supplies ===
          'power'
            ? fx.power
            : fx.water;
        const supply =
          cut ===
          1
            ? def.supply
            : Math.floor(
                def.supply *
                  cut,
              );
        producers.push(
          {
            i,
            x,
            z,
            kind: util,
            supply,
            reach:
              def.reach,
            dist,
          },
        );
      }
    }
    const zone =
      cellZone(
        cell,
      );
    if (
      zone
    ) {
      const fed =
        feeders(
          x,
          z,
        );
      if (
        fed.length >
        0
      )
        flags[
          i
        ] |=
          FLAG_CONNECTED;
      const level =
        cellLevel(
          cell,
        );
      if (
        level >
        0
      )
        lots.push(
          {
            i,
            x,
            z,
            zone,
            level,
            fed,
          },
        );
    }
  }

  const consumers: Consumer[] =
    lots.map(
      (
        l,
      ) => ({
        i: l.i,
        x: l.x,
        z: l.z,
        power:
          ZONES[
            l
              .zone
          ]
            .power[
            l.level -
              1
          ],
        water:
          ZONES[
            l
              .zone
          ]
            .water[
            l.level -
              1
          ],
      }),
    );
  const fedOf =
    new Map<
      number,
      number[]
    >(
      lots.map(
        (
          l,
        ) => [
          l.i,
          l.fed,
        ],
      ),
    );
  for (const b of w.buildings) {
    const fed =
      feeders(
        b.x,
        b.z,
      );
    const bi =
      b.z *
        n +
      b.x;
    if (
      fed.length ===
      0
    )
      continue;
    flags[
      bi
    ] |=
      FLAG_CONNECTED;
    if (
      b.kind ===
      'harvester'
    ) {
      consumers.push(
        {
          i: bi,
          x: b.x,
          z: b.z,
          power:
            HARVESTER_POWER,
          water: 0,
        },
      );
      fedOf.set(
        bi,
        fed,
      );
    }
  }

  /* 3. Hand out power and water: the nearest producer with capacity to spare serves each site, nearest sites first. */
  const supplied =
    {
      power: 0,
      water: 0,
    };
  const demanded =
    {
      power: 0,
      water: 0,
    };
  for (const kind of [
    'power',
    'water',
  ] as const) {
    const ps =
      producers.filter(
        (
          p,
        ) =>
          UTILITIES[
            p
              .kind
          ]
            .supplies ===
          kind,
      );
    const left =
      new Map<
        number,
        number
      >(
        ps.map(
          (
            p,
          ) => [
            p.i,
            p.supply,
          ],
        ),
      );
    supplied[
      kind
    ] =
      ps.reduce(
        (
          s,
          p,
        ) =>
          s +
          p.supply,
        0,
      );
    const bit =
      kind ===
      'power'
        ? FLAG_POWERED
        : FLAG_WATERED;
    const options =
      consumers
        .map(
          (
            s,
          ) => {
            const need =
              s[
                kind
              ];
            const opts: {
              p: Producer;
              d: number;
            }[] =
              [];
            for (const p of ps) {
              let best =
                -1;
              for (const f of fedOf.get(
                s.i,
              ) ??
                []) {
                const d =
                  p
                    .dist[
                    f
                  ];
                if (
                  d >=
                    0 &&
                  (best <
                    0 ||
                    d <
                      best)
                )
                  best =
                    d;
              }
              if (
                best >=
                0
              )
                opts.push(
                  {
                    p,
                    d: best,
                  },
                );
            }
            opts.sort(
              (
                a,
                b,
              ) =>
                a.d -
                  b.d ||
                a
                  .p
                  .i -
                  b
                    .p
                    .i,
            );
            return {
              s,
              need,
              opts,
            };
          },
        )
        .sort(
          (
            a,
            b,
          ) =>
            (a
              .opts[0]
              ?.d ??
              1e9) -
              (b
                .opts[0]
                ?.d ??
                1e9) ||
            a
              .s
              .i -
              b
                .s
                .i,
        );
    for (const {
      s,
      need,
      opts,
    } of options) {
      demanded[
        kind
      ] +=
        need;
      if (
        need <=
        0
      ) {
        flags[
          s.i
        ] |=
          bit;
        continue;
      }
      const hit =
        opts.find(
          (
            o,
          ) =>
            (left.get(
              o
                .p
                .i,
            ) ??
              0) >=
            need,
        );
      if (
        !hit
      )
        continue;
      left.set(
        hit
          .p
          .i,
        (left.get(
          hit
            .p
            .i,
        ) ??
          0) -
          need,
      );
      flags[
        s.i
      ] |=
        bit;
    }
  }
  const served =
    {
      power: 0,
      water: 0,
    };
  for (const s of consumers) {
    if (
      flags[
        s
          .i
      ] &
      FLAG_POWERED
    )
      served.power +=
        s.power;
    if (
      flags[
        s
          .i
      ] &
      FLAG_WATERED
    )
      served.water +=
        s.water;
  }

  /* 4. People, jobs and money. */
  for (const l of lots) {
    const def =
      ZONES[
        l
          .zone
      ];
    const f =
      flags[
        l
          .i
      ];
    const connected =
      (f &
        FLAG_CONNECTED) !==
      0;
    const powered =
      (f &
        FLAG_POWERED) !==
      0;
    const watered =
      (f &
        FLAG_WATERED) !==
      0;
    if (
      l.level ===
      MAX_LOT_LEVEL
    )
      level3++;
    if (
      l.zone ===
      'homes'
    ) {
      homeLots++;
      const h =
        connected
          ? Math.floor(
              def
                .housing[
                l.level -
                  1
              ] *
                (powered
                  ? 1
                  : UNPOWERED_HOUSING) *
                (watered
                  ? 1
                  : UNWATERED_HOUSING),
            )
          : 0;
      housing +=
        h;
      homeSites.push(
        {
          x: l.x,
          z: l.z,
          housing:
            h,
          i: l.i,
        },
      );
    } else if (
      connected
    ) {
      if (
        l.zone ===
        'market'
      )
        markets++;
      else
        workshops++;
      jobs +=
        Math.floor(
          def
            .jobs[
            l.level -
              1
          ] *
            (powered
              ? 1
              : UNPOWERED_JOBS),
        );
      serves +=
        Math.floor(
          def
            .serves[
            l.level -
              1
          ] *
            (powered
              ? 1
              : UNPOWERED_JOBS),
        );
      if (
        powered
      )
        trade +=
          def
            .trade[
            l.level -
              1
          ];
    }
  }
  for (const b of w.buildings) {
    const bi =
      b.z *
        n +
      b.x;
    const connected =
      (flags[
        bi
      ] &
        FLAG_CONNECTED) !==
      0;
    if (
      b.kind ===
      'park'
    )
      parks++;
    if (
      !connected
    )
      continue;
    if (
      b.kind ===
      'cottage'
    ) {
      housing +=
        COTTAGE_HOUSING;
      homeSites.push(
        {
          x: b.x,
          z: b.z,
          housing:
            COTTAGE_HOUSING,
          i: bi,
        },
      );
    } else if (
      b.kind ===
      'stall'
    ) {
      jobs +=
        STALL_JOBS;
      serves +=
        STALL_SERVES;
    } else if (
      b.kind ===
      'kitchen'
    )
      jobs +=
        KITCHEN_JOBS;
  }

  const pop =
    c.population;
  const workforce =
    Math.floor(
      pop *
        WORKFORCE_RATIO,
    );
  const powerCover =
    demanded.power >
    0
      ? Math.round(
          (100 *
            served.power) /
            demanded.power,
        )
      : 100;
  const waterCover =
    demanded.water >
    0
      ? Math.round(
          (100 *
            served.water) /
            demanded.water,
        )
      : 100;

  // Happiness: parks and shops in reach are good, workshops next door are not, and so are dark, dry or jobless streets.
  const totalHousing =
    homeSites.reduce(
      (
        s,
        h,
      ) =>
        s +
        h.housing,
      0,
    );
  let nearPark = 0;
  let nearShop = 0;
  let nearWorkshop = 0;
  if (
    totalHousing >
    0
  ) {
    const parkTiles =
      w.buildings.filter(
        (
          b,
        ) =>
          b.kind ===
          'park',
      );
    const shopTiles: {
      x: number;
      z: number;
    }[] =
      w.buildings.filter(
        (
          b,
        ) =>
          b.kind ===
          'stall',
      );
    const workTiles: {
      x: number;
      z: number;
    }[] =
      [];
    for (const l of lots) {
      if (
        l.zone ===
        'market'
      )
        shopTiles.push(
          l,
        );
      if (
        l.zone ===
        'workshop'
      )
        workTiles.push(
          l,
        );
    }
    for (const h of homeSites) {
      if (
        parkTiles.some(
          (
            p,
          ) =>
            chebyshev(
              p.x,
              p.z,
              h.x,
              h.z,
            ) <=
            PARK_RADIUS,
        )
      )
        nearPark +=
          h.housing;
      if (
        shopTiles.some(
          (
            s,
          ) =>
            chebyshev(
              s.x,
              s.z,
              h.x,
              h.z,
            ) <=
            SHOP_RADIUS,
        )
      )
        nearShop +=
          h.housing;
      if (
        workTiles.some(
          (
            s,
          ) =>
            chebyshev(
              s.x,
              s.z,
              h.x,
              h.z,
            ) <=
            WORKSHOP_RADIUS,
        )
      )
        nearWorkshop +=
          h.housing;
    }
  }
  const share =
    (
      v: number,
    ) =>
      totalHousing >
      0
        ? v /
          totalHousing
        : 0;
  const unemployment =
    workforce >
    0
      ? clamp01(
          1 -
            jobs /
              workforce,
        )
      : 0;
  const happiness =
    Math.round(
      clamp(
        BASE_HAPPINESS +
          14 *
            share(
              nearPark,
            ) +
          8 *
            share(
              nearShop,
            ) -
          14 *
            share(
              nearWorkshop,
            ) -
          (100 -
            powerCover) *
            0.12 -
          (100 -
            waterCover) *
            0.1 -
          12 *
            unemployment +
          taxHappiness(
            c.taxRate,
          ) +
          fx.happiness,
        0,
        100,
      ),
    );

  // Demand: how much each zone wants to grow, 0-100.
  const jobGap =
    workforce >
      0 ||
    jobs >
      0
      ? (jobs -
          workforce) /
        Math.max(
          8,
          jobs,
          workforce,
        )
      : 0;
  const slack =
    Math.max(
      0,
      housing -
        pop -
        6,
    );
  const vacancyPenalty =
    housing >
    0
      ? clamp01(
          slack /
            Math.max(
              6,
              housing,
            ),
        ) *
        0.7
      : 0;
  const demandHomes =
    clamp01(
      0.5 +
        0.55 *
          jobGap +
        0.3 *
          ((happiness -
            50) /
            50) -
        vacancyPenalty,
    );
  const demandMarket =
    pop <
    2
      ? 0
      : clamp01(
          (pop -
            serves) /
            Math.max(
              10,
              pop,
            ) +
            0.2,
        );
  const demandWorkshop =
    pop <
    4
      ? 0
      : clamp01(
          0.35 +
            0.8 *
              ((workforce -
                jobs) /
                Math.max(
                  8,
                  workforce,
                )),
        );

  // Taxes scale with the rate (×1 at the default, so the figure is the old one to the coin); events scale them too.
  const tax =
    Math.round(
      pop *
        TAX_PER_RESIDENT *
        (0.6 +
          0.4 *
            (happiness /
              100)) *
        taxIncomeFactor(
          c.taxRate,
        ) *
        fx.tax,
    );
  const tradeToday =
    Math.round(
      trade *
        fx.trade,
    );
  const upkeep =
    Math.round(
      roads *
        ROAD_UPKEEP +
        utilityUpkeep,
    );

  const stats: CityStats =
    {
      population:
        pop,
      housing,
      jobs,
      workforce,
      homeLots,
      markets,
      workshops,
      parks,
      level3,
      roads,
      connectedRoads,
      powerSupply:
        supplied.power,
      powerDemand:
        demanded.power,
      waterSupply:
        supplied.water,
      waterDemand:
        demanded.water,
      powerCover,
      waterCover,
      happiness,
      demandHomes:
        Math.round(
          demandHomes *
            100,
        ),
      demandMarket:
        Math.round(
          demandMarket *
            100,
        ),
      demandWorkshop:
        Math.round(
          demandWorkshop *
            100,
        ),
      tax,
      trade:
        tradeToday,
      upkeep,
      net:
        tax +
        tradeToday -
        upkeep,
    };
  c.stats =
    stats;
  c.dirty = false;
}

/* ── Progress ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** The numbers milestones are measured against. */
export function cityMetrics(
  w: World,
): Record<
  MetricId,
  number
> {
  const s =
    w
      .city
      .stats;
  const m: Record<
    MetricId,
    number
  > =
    {
      population:
        w
          .city
          .population,
      powerCover:
        s.powerCover,
      waterCover:
        s.waterCover,
      happiness:
        s.happiness,
      markets:
        s.markets,
      workshops:
        s.workshops,
      parks:
        s.parks,
      jobs: s.jobs,
      level3:
        s.level3,
      net: s.net,
      roads:
        s.connectedRoads,
    };
  return m;
}

/** 0-1: how close a milestone is (the weakest requirement decides). 1 once it has been reached. */
export function milestoneProgress(
  w: World,
  def: MilestoneDef,
): number {
  if (
    w.city.reached.includes(
      def.id,
    )
  )
    return 1;
  const m =
    cityMetrics(
      w,
    );
  return Math.min(
    ...def.needs.map(
      (
        r,
      ) =>
        clamp01(
          m[
            r
              .metric
          ] /
            r.min,
        ),
    ),
  );
}

export function unlockedBy(
  w: World,
  id: UnlockId,
): boolean {
  return MILESTONES.some(
    (
      d,
    ) =>
      d.unlocks.includes(
        id,
      ) &&
      w.city.reached.includes(
        d.id,
      ),
  );
}
export const zoneUnlocked =
  (
    w: World,
    zone: ZoneId,
  ): boolean =>
    !(
      UNLOCK_IDS as readonly string[]
    ).includes(
      `zone:${zone}`,
    ) ||
    unlockedBy(
      w,
      `zone:${zone}` as UnlockId,
    );
export const utilityUnlocked =
  (
    w: World,
    kind: UtilityId,
  ): boolean =>
    !(
      UNLOCK_IDS as readonly string[]
    ).includes(
      `utility:${kind}`,
    ) ||
    unlockedBy(
      w,
      `utility:${kind}` as UnlockId,
    );

/** The next small thing worth doing, for the HUD's hint line. Pure, so the UI and tests agree. */
export type NextStep =
  | 'road'
  | 'zone-homes'
  | 'power'
  | 'water'
  | 'zone-market'
  | 'grow'
  | 'milestone';
export function nextStep(
  w: World,
): NextStep {
  const s =
    w
      .city
      .stats;
  const c =
    w.city;
  if (
    s.connectedRoads <
    4
  )
    return 'road';
  if (
    !c.cells.some(
      (
        v,
      ) =>
        cellZone(
          v,
        ) ===
        'homes',
    )
  )
    return 'zone-homes';
  const has =
    (
      kind:
        | 'power'
        | 'water',
    ) =>
      c.cells.some(
        (
          v,
        ) => {
          const u =
            cellUtility(
              v,
            );
          return (
            u !==
              null &&
            isUtilityId(
              u,
            ) &&
            UTILITIES[
              u
            ]
              .supplies ===
              kind
          );
        },
      );
  if (
    !has(
      'power',
    )
  )
    return 'power';
  if (
    !has(
      'water',
    )
  )
    return 'water';
  if (
    s.markets ===
      0 &&
    !c.cells.some(
      (
        v,
      ) =>
        cellZone(
          v,
        ) ===
        'market',
    )
  )
    return 'zone-market';
  return c
    .reached
    .length <
    MILESTONES.length
    ? 'milestone'
    : 'grow';
}

/* ── Stepping ─────────────────────────────────────────────────────────────────────────────────────────────── */

function growLots(
  w: World,
  ev: WorldEvent[],
): boolean {
  const c =
    w.city;
  const n =
    w.size;
  const step =
    Math.floor(
      w.tick /
        GROWTH_TICKS,
    );
  const s =
    c.stats;
  const demand: Record<
    ZoneId,
    number
  > =
    {
      homes:
        s.demandHomes /
        100,
      market:
        s.demandMarket /
        100,
      workshop:
        s.demandWorkshop /
        100,
    };
  const picks: {
    i: number;
    score: number;
  }[] =
    [];
  for (
    let i = 0;
    i <
    c
      .cells
      .length;
    i++
  ) {
    const cell =
      c
        .cells[
        i
      ];
    const zone =
      cellZone(
        cell,
      );
    if (
      !zone ||
      cellRoad(
        cell,
      ) ||
      (c
        .flags[
        i
      ] &
        FLAG_CONNECTED) ===
        0
    )
      continue;
    const level =
      cellLevel(
        cell,
      );
    if (
      level >=
      MAX_LOT_LEVEL
    )
      continue;
    const x =
      i %
      n;
    const z =
      (i -
        x) /
      n;
    let p: number;
    if (
      level ===
      0
    ) {
      if (
        demand[
          zone
        ] <
        SPROUT_DEMAND_FLOOR
      )
        continue;
      p =
        SPROUT_CHANCE *
        demand[
          zone
        ];
    } else {
      const f =
        c
          .flags[
          i
        ];
      if (
        (f &
          FLAG_POWERED) ===
          0 ||
        (f &
          FLAG_WATERED) ===
          0 ||
        s.happiness <
          45
      )
        continue;
      if (
        landValueAt(
          w,
          x,
          z,
        ) <
        ZONES[
          zone
        ]
          .landValueFor[
          level -
            1
        ]
      )
        continue;
      p =
        LEVEL_UP_CHANCE *
        (0.5 +
          demand[
            zone
          ] /
            2);
    }
    const score =
      hash01(
        w.seed,
        i,
        step,
      );
    if (
      score >=
      p
    )
      continue;
    // Never build under someone's feet.
    if (
      agentOnTile(
        w,
        x,
        z,
      ) ||
      Object.values(
        w.players,
      ).some(
        (
          o,
        ) =>
          Math.round(
            o.x,
          ) ===
            x &&
          Math.round(
            o.z,
          ) ===
            z,
      )
    )
      continue;
    picks.push(
      {
        i,
        score,
      },
    );
  }
  picks.sort(
    (
      a,
      b,
    ) =>
      a.score -
        b.score ||
      a.i -
        b.i,
  );
  const developed =
    s.homeLots +
    s.markets +
    s.workshops;
  const chosen =
    picks.slice(
      0,
      GROWTH_PER_STEP +
        Math.floor(
          developed /
            GROWTH_SCALE_LOTS,
        ),
    );
  for (const {
    i,
  } of chosen) {
    const cell =
      c
        .cells[
        i
      ];
    c.cells[
      i
    ] =
      cell +
      (1 <<
        3);
    const x =
      i %
      n;
    const z =
      (i -
        x) /
      n;
    ev.push(
      {
        type: 'lotGrew',
        x,
        z,
        zone: cellZone(
          cell,
        )!,
        level:
          cellLevel(
            cell,
          ) +
          1,
      },
    );
  }
  return (
    chosen.length >
    0
  );
}

function movePeople(
  w: World,
): void {
  const c =
    w.city;
  const s =
    c.stats;
  const before =
    c.population;
  const jobFactor =
    s.workforce <=
    0
      ? 1
      : clamp01(
          s.jobs /
            s.workforce,
        );
  const desirability =
    clamp(
      0.45 +
        0.3 *
          clamp01(
            (s.happiness -
              30) /
              70,
          ) +
        0.25 *
          jobFactor +
        taxDesirability(
          c.taxRate,
        ),
      0.15,
      1,
    );
  const target =
    Math.floor(
      s.housing *
        desirability,
    );
  if (
    c.population <
    target
  ) {
    const gap =
      target -
      c.population;
    c.population +=
      Math.min(
        MOVE_IN_CAP,
        Math.max(
          MOVE_IN_MIN,
          Math.round(
            gap *
              MOVE_IN_SHARE,
          ),
        ),
      );
  } else if (
    c.population >
    target +
      1
  ) {
    c.population -=
      Math.ceil(
        (c.population -
          target) *
          MOVE_OUT_SHARE,
      );
  }
  c.population =
    Math.max(
      0,
      Math.min(
        c.population,
        Math.max(
          s.housing,
          0,
        ),
      ),
    );
  // People ride out a storm, a dry spell or a festival: while an event lasts nobody leaves, so a cut can never
  // cost the town a resident (it only slows growth). The usual rules resume the day it ends.
  if (
    c.event
  )
    c.population =
      Math.max(
        c.population,
        before,
      );
  c.peakPopulation =
    Math.max(
      c.peakPopulation,
      c.population,
    );
}

/** Close the day's books: the town's net is shared evenly between the players (a deficit is charged the same way). */
function settleDay(
  w: World,
  ev: WorldEvent[],
): void {
  const c =
    w.city;
  c.day += 1;
  const net =
    c
      .stats
      .net;
  const ids =
    Object.keys(
      w.players,
    ).sort();
  if (
    ids.length >
      0 &&
    net !==
      0
  ) {
    if (
      net >
      0
    ) {
      const share =
        Math.floor(
          net /
            ids.length,
        );
      let rem =
        net -
        share *
          ids.length;
      for (const id of ids) {
        w.players[
          id
        ].money +=
          share +
          (rem >
          0
            ? 1
            : 0);
        if (
          rem >
          0
        )
          rem--;
      }
    } else {
      const share =
        Math.ceil(
          -net /
            ids.length,
        );
      for (const id of ids)
        w.players[
          id
        ].money -=
          Math.min(
            w
              .players[
              id
            ]
              .money,
            share,
          );
    }
  }
  ev.push(
    {
      type: 'cityDay',
      day: c.day,
      net,
      population:
        c.population,
    },
  );
  advanceEvent(
    w,
    ev,
  );
}

/**
 * The day's close, for events: the one in progress loses a day (and ends when none are left), otherwise a quiet town
 * may draw a new one. Only `hash01` is consulted, so every replica starts and ends the same events on the same day.
 */
function advanceEvent(
  w: World,
  ev: WorldEvent[],
): void {
  const c =
    w.city;
  if (
    c.event
  ) {
    c.event.daysLeft -= 1;
    if (
      c
        .event
        .daysLeft >
      0
    )
      return;
    ev.push(
      {
        type: 'cityEventEnded',
        id: c
          .event
          .id,
        day: c.day,
      },
    );
    c.event =
      null;
    recomputeCity(
      w,
    );
    return;
  }
  const id =
    drawCityEvent(
      w,
      c.day,
    );
  if (
    !id
  )
    return;
  const days =
    CITY_EVENTS[
      id
    ]
      .days;
  c.event =
    {
      id,
      since:
        c.day,
      daysLeft:
        days,
    };
  ev.push(
    {
      type: 'cityEventStarted',
      id,
      day: c.day,
      days,
    },
  );
  recomputeCity(
    w,
  );
}

function checkMilestones(
  w: World,
  ev: WorldEvent[],
): void {
  const m =
    cityMetrics(
      w,
    );
  for (const def of MILESTONES) {
    if (
      w.city.reached.includes(
        def.id,
      )
    )
      continue;
    if (
      !def.needs.every(
        (
          r,
        ) =>
          m[
            r
              .metric
          ] >=
          r.min,
      )
    )
      continue;
    w.city.reached.push(
      def.id,
    );
    ev.push(
      {
        type: 'milestoneReached',
        id: def.id,
      },
    );
  }
}

/**
 * One tick of the city. Cheap on most ticks: the derived data is only rebuilt when something changed it (`dirty`),
 * and growth, the daily accounts and the milestone check run on their own cadence.
 */
export function tickCity(
  w: World,
  ev: WorldEvent[],
): void {
  const c =
    w.city;
  if (
    c.dirty
  )
    recomputeCity(
      w,
    );
  if (
    w.tick %
      GROWTH_TICKS ===
      0 &&
    growLots(
      w,
      ev,
    )
  )
    recomputeCity(
      w,
    );
  if (
    w.tick %
      POPULATION_TICKS ===
    0
  ) {
    const before =
      c.population;
    movePeople(
      w,
    );
    if (
      c.population !==
      before
    )
      recomputeCity(
        w,
      );
  }
  if (
    w.tick %
      DAY_TICKS ===
    0
  )
    settleDay(
      w,
      ev,
    );
  if (
    w.tick %
      CITY_REFRESH_TICKS ===
    0
  )
    checkMilestones(
      w,
      ev,
    );
}
