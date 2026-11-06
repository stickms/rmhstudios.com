import type { CityEventId, UtilityId, ZoneId } from '../content/city';

/**
 * The city layer's state: plain, JSON-serialisable data that lives inside `World` and travels with every save and
 * every P2P checkpoint. `cells` is authoritative; everything else is either stateful progress (population, the day
 * count, milestones) or derived data the simulation refreshes itself (`flags`, `stats`).
 *
 * A cell packs what stands on one tile into an int:
 *   bit 0       road
 *   bits 1-2    zone      (0 none, 1 homes, 2 market, 3 workshop)
 *   bits 3-4    level     (0 an empty zoned tile, 1-3 a developed lot)
 *   bits 5-7    utility   (0 none, 1 well, 2 windmill, 3 pump, 4 waterwheel)
 */

export interface CityStats {
  population: number;
  /** Housing the town can hold right now (after power / water), and the jobs on offer and the people to fill them. */
  housing: number;
  jobs: number;
  workforce: number;
  /** Developed lots by kind, and the parks standing. */
  homeLots: number;
  markets: number;
  workshops: number;
  parks: number;
  /** Lots at the top level. */
  level3: number;
  /** Road tiles, and how many of them are on the network that reaches the town green. */
  roads: number;
  connectedRoads: number;
  powerSupply: number;
  powerDemand: number;
  waterSupply: number;
  waterDemand: number;
  /** Percent (0-100) of what lots draw that is being supplied. */
  powerCover: number;
  waterCover: number;
  happiness: number;
  /** Percent (0-100): how much each zone wants to grow. */
  demandHomes: number;
  demandMarket: number;
  demandWorkshop: number;
  /** Daily money, in whole units: what the town earns, what it costs to run, and the difference. */
  tax: number;
  trade: number;
  upkeep: number;
  net: number;
}

/** The one town event in progress: which, and how many town days it still has (1 = ends at the next day's close). */
export interface ActiveCityEvent {
  id: CityEventId;
  /** The town day it began on. */
  since: number;
  daysLeft: number;
}

export interface CityState {
  /** size × size packed cells (see above), same layout as `terrain`. */
  cells: number[];
  /** size × size derived bits: 1 connected to the green's road network, 2 powered, 4 watered. */
  flags: number[];
  /** Road tiles laid (kept exact so the pathfinder can scale its heuristic without scanning). */
  roadCount: number;
  /** Set by anything that changes what the derived data depends on; the next step refreshes it. */
  dirty: boolean;
  population: number;
  /** The most residents the town has ever had. */
  peakPopulation: number;
  /** Town days elapsed. */
  day: number;
  /** Milestones reached (in order) and the subset whose reward has been claimed. */
  reached: string[];
  claimed: string[];
  /** Percent the players tax residents at (content: MIN/MAX/DEFAULT_TAX_RATE). Set by `setTaxRate`. */
  taxRate: number;
  /** The event in progress, if any (at most one). Drawn only from `hash01`, never the world's rng. */
  event: ActiveCityEvent | null;
  stats: CityStats;
}

export type CityCommand =
  | { type: 'placeRoad'; playerId: string; x: number; z: number; x2?: number; z2?: number }
  | { type: 'removeRoad'; playerId: string; x: number; z: number; x2?: number; z2?: number }
  | { type: 'zone'; playerId: string; zone: ZoneId; x: number; z: number; x2?: number; z2?: number }
  | { type: 'unzone'; playerId: string; x: number; z: number; x2?: number; z2?: number }
  | { type: 'placeUtility'; playerId: string; kind: UtilityId; x: number; z: number }
  | { type: 'removeUtility'; playerId: string; x: number; z: number }
  | { type: 'claimMilestone'; playerId: string; id: string }
  | { type: 'setTaxRate'; playerId: string; rate: number };

export type CityEvent =
  | { type: 'roadsLaid'; playerId: string; count: number; cost: number }
  | { type: 'roadsRemoved'; playerId: string; count: number; refund: number }
  | { type: 'zoned'; playerId: string; zone: ZoneId; count: number; cost: number }
  | { type: 'unzoned'; playerId: string; count: number }
  | { type: 'utilityPlaced'; playerId: string; kind: UtilityId; x: number; z: number }
  | { type: 'utilityRemoved'; playerId: string; x: number; z: number }
  | { type: 'lotGrew'; x: number; z: number; zone: ZoneId; level: number }
  | { type: 'milestoneReached'; id: string }
  | { type: 'milestoneClaimed'; playerId: string; id: string; reward: number; skin: string | null }
  | { type: 'cityDay'; day: number; net: number; population: number }
  | { type: 'taxRateSet'; playerId: string; rate: number; from: number }
  | { type: 'cityEventStarted'; id: CityEventId; day: number; days: number }
  | { type: 'cityEventEnded'; id: CityEventId; day: number };

export type CityReject =
  'bad-shape' | 'locked' | 'no-shore' | 'unknown-milestone' | 'not-reached' | 'already-claimed';
