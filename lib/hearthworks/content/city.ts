import type { SkinId } from '../skins';

/**
 * The city layer's rulebook as data: roads, zones, utilities and milestones. Every number the simulation
 * (world/city.ts) uses lives here or in the exported constants, so tuning never means reading code. The rules
 * are written up in docs/hearthworks-city.md.
 */

/* ── Roads ────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Laying one road tile, and the share of that returned when it is taken up again. */
export const ROAD_COST = 3;
export const ROAD_REFUND = 1;
/** Daily upkeep per road tile on the main network (whole town, summed, then rounded). */
export const ROAD_UPKEEP = 0.2;
/** Two road tiles join only if their ground differs by at most this many block levels (a ramp, not a cliff). */
export const ROAD_MAX_GRADE = 1;
/** The longest straight run one `placeRoad` / `removeRoad` command may lay. */
export const ROAD_RUN_MAX = 48;
/** Planning cost of stepping from one road tile to the next (a plain walk costs 1) — roads are the cheap way round. */
export const ROAD_STEP_COST = 0.55;
/** A road step takes this share of a plain walking step's ticks (so about 1.5× as fast). */
export const ROAD_STEP_TIME = 0.65;

/* ── Zones ────────────────────────────────────────────────────────────────────────────────────────────────── */

export const ZONE_IDS = ['homes', 'market', 'workshop'] as const;
export type ZoneId = (typeof ZONE_IDS)[number];
/** The most levels a lot grows to (1 = a plain lot, 3 = dense). */
export const MAX_LOT_LEVEL = 3;
/** The biggest area one `zone` / `unzone` brush stroke may cover. */
export const ZONE_BRUSH_MAX = 256;

type PerLevel = readonly [number, number, number];

export interface ZoneDef {
  name: string;
  /** Painting one tile. */
  cost: number;
  /** Residents a lot houses, by level. */
  housing: PerLevel;
  /** Jobs a lot offers, by level. */
  jobs: PerLevel;
  /** Residents a shop lot can serve (the market zone), by level. */
  serves: PerLevel;
  /** What a lot earns the town each day when it is powered, by level. */
  trade: PerLevel;
  /** Power and water a lot draws, by level. */
  power: PerLevel;
  water: PerLevel;
  /** Land value a lot needs to reach level 2 and level 3. */
  landValueFor: readonly [number, number];
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  homes: {
    name: 'Homes',
    cost: 4,
    housing: [3, 6, 10],
    jobs: [0, 0, 0],
    serves: [0, 0, 0],
    trade: [0, 0, 0],
    power: [1, 2, 3],
    water: [1, 2, 3],
    landValueFor: [46, 64],
  },
  market: {
    name: 'Shops',
    cost: 6,
    housing: [0, 0, 0],
    jobs: [2, 4, 7],
    serves: [6, 14, 26],
    trade: [3, 8, 16],
    power: [1, 2, 4],
    water: [1, 1, 2],
    landValueFor: [44, 62],
  },
  workshop: {
    name: 'Workshops',
    cost: 8,
    housing: [0, 0, 0],
    jobs: [3, 6, 10],
    serves: [0, 0, 0],
    trade: [4, 9, 18],
    power: [2, 4, 6],
    water: [1, 2, 3],
    landValueFor: [30, 48],
  },
};

export const isZoneId = (v: unknown): v is ZoneId =>
  typeof v === 'string' && (ZONE_IDS as readonly string[]).includes(v);

/* ── Utilities ────────────────────────────────────────────────────────────────────────────────────────────── */

export const UTILITY_IDS = ['well', 'windmill', 'pump', 'waterwheel'] as const;
export type UtilityId = (typeof UTILITY_IDS)[number];

export interface UtilityDef {
  name: string;
  supplies: 'power' | 'water';
  /** Units supplied per day-tick (a lot draws `ZoneDef.power` / `.water` units). */
  supply: number;
  /** How many road steps along the network its supply reaches. */
  reach: number;
  cost: number;
  upkeep: number;
  /** Must stand with open water on one side. */
  needsShore: boolean;
}

export const UTILITIES: Record<UtilityId, UtilityDef> = {
  well: {
    name: 'Well',
    supplies: 'water',
    supply: 14,
    reach: 8,
    cost: 60,
    upkeep: 0.5,
    needsShore: false,
  },
  windmill: {
    name: 'Windmill',
    supplies: 'power',
    supply: 12,
    reach: 10,
    cost: 110,
    upkeep: 1,
    needsShore: false,
  },
  pump: {
    name: 'Pumping station',
    supplies: 'water',
    supply: 48,
    reach: 14,
    cost: 240,
    upkeep: 2,
    needsShore: true,
  },
  waterwheel: {
    name: 'Water wheel',
    supplies: 'power',
    supply: 36,
    reach: 14,
    cost: 320,
    upkeep: 2,
    needsShore: true,
  },
};

export const isUtilityId = (v: unknown): v is UtilityId =>
  typeof v === 'string' && (UTILITY_IDS as readonly string[]).includes(v);

/** A harvester (the machine) draws this much power; when it is supplied it works twice as often. */
export const HARVESTER_POWER = 2;
/** Existing buildings the city counts once a road network reaches them. */
export const COTTAGE_HOUSING = 4;
export const STALL_JOBS = 2;
export const STALL_SERVES = 6;
export const KITCHEN_JOBS = 3;

/* ── People, happiness, money ─────────────────────────────────────────────────────────────────────────────── */

/** Share of residents who work. */
export const WORKFORCE_RATIO = 0.58;
/** Ticks between people moving in or out; each time at least `MOVE_IN_MIN` arrive, up to `MOVE_IN_CAP`, closing this share of the gap. */
export const POPULATION_TICKS = 400;
export const MOVE_IN_MIN = 1;
export const MOVE_IN_CAP = 12;
export const MOVE_IN_SHARE = 0.12;
export const MOVE_OUT_SHARE = 0.2;
/** A lot with no power works at this share of its jobs; a home without power / water holds this share of its housing. */
export const UNPOWERED_JOBS = 0.3;
export const UNPOWERED_HOUSING = 0.5;
export const UNWATERED_HOUSING = 0.6;

export const BASE_HAPPINESS = 50;
/** Radius (tiles) over which parks, shops and workshops colour a lot's surroundings. */
export const PARK_RADIUS = 3;
export const SHOP_RADIUS = 5;
export const WORKSHOP_RADIUS = 3;

/** Income per resident per day, scaled by how content they are. */
export const TAX_PER_RESIDENT = 1.5;

/* ── Time ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Ticks (50 ms) between the derived-data refresh, between growth steps, and per town day. */
export const CITY_REFRESH_TICKS = 20;
export const GROWTH_TICKS = 200;
export const DAY_TICKS = 1200;
/** At most this many lots sprout or level up in one growth step, plus one more for every this-many lots already standing. */
export const GROWTH_PER_STEP = 1;
export const GROWTH_SCALE_LOTS = 12;
/** Chance per growth step that an eligible empty lot sprouts, and an eligible lot levels up (× demand). */
export const SPROUT_CHANCE = 0.4;
export const LEVEL_UP_CHANCE = 0.25;
/** Demand (0..1) a zone needs before its empty lots begin to sprout. */
export const SPROUT_DEMAND_FLOOR = 0.12;

/* ── Milestones ───────────────────────────────────────────────────────────────────────────────────────────── */

/** What a milestone can measure; `cityMetrics()` in world/city.ts produces each one. */
export const METRIC_IDS = [
  'population',
  'powerCover',
  'waterCover',
  'happiness',
  'markets',
  'workshops',
  'parks',
  'jobs',
  'level3',
  'net',
  'roads',
] as const;
export type MetricId = (typeof METRIC_IDS)[number];

/** Things a milestone opens up. Anything not listed here is available from the start. */
export const UNLOCK_IDS = ['zone:workshop', 'utility:pump', 'utility:waterwheel'] as const;
export type UnlockId = (typeof UNLOCK_IDS)[number];

export interface MilestoneDef {
  id: string;
  name: string;
  /** Short literal goal text. */
  goal: string;
  /** Every requirement must hold at once (a milestone then stays reached for good). */
  needs: readonly { metric: MetricId; min: number }[];
  reward: number;
  rewardSkin?: SkinId;
  unlocks: readonly UnlockId[];
}

export const MILESTONES: readonly MilestoneDef[] = [
  {
    id: 'hamlet',
    name: 'Hamlet',
    goal: '16 residents, light and water for most of them, and a shop.',
    needs: [
      { metric: 'population', min: 16 },
      { metric: 'powerCover', min: 70 },
      { metric: 'waterCover', min: 70 },
      { metric: 'markets', min: 1 },
    ],
    reward: 250,
    unlocks: ['zone:workshop', 'utility:pump'],
  },
  {
    id: 'village',
    name: 'Village',
    goal: '30 residents, 12 jobs, and neighbours who are content.',
    needs: [
      { metric: 'population', min: 30 },
      { metric: 'jobs', min: 12 },
      { metric: 'happiness', min: 55 },
    ],
    reward: 600,
    unlocks: ['utility:waterwheel'],
  },
  {
    id: 'commons',
    name: 'Green commons',
    goal: '3 parks and a happy village of 40.',
    needs: [
      { metric: 'population', min: 40 },
      { metric: 'parks', min: 3 },
      { metric: 'happiness', min: 62 },
    ],
    reward: 500,
    rewardSkin: 'worker',
    unlocks: [],
  },
  {
    id: 'town',
    name: 'Town',
    goal: '80 residents, 3 dense lots, and the books in the black.',
    needs: [
      { metric: 'population', min: 80 },
      { metric: 'level3', min: 3 },
      { metric: 'net', min: 20 },
    ],
    reward: 1500,
    rewardSkin: 'barney',
    unlocks: [],
  },
  {
    id: 'city',
    name: 'City',
    goal: '200 residents, 3 workshops, and the lights on everywhere.',
    needs: [
      { metric: 'population', min: 200 },
      { metric: 'workshops', min: 3 },
      { metric: 'powerCover', min: 90 },
      { metric: 'waterCover', min: 90 },
      { metric: 'happiness', min: 65 },
    ],
    reward: 4000,
    unlocks: [],
  },
];

export const MILESTONE_IDS = MILESTONES.map((m) => m.id);
export const isMilestoneId = (v: unknown): v is string =>
  typeof v === 'string' && MILESTONE_IDS.includes(v);
