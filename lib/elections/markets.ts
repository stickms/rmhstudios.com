/**
 * Coin markets on the election: which markets to open, and how each one settles.
 * Pure and client-safe; the DB writes and the resolver glue are in
 * `markets.server.ts`.
 *
 * Two kinds, both riding the platform's existing LMSR markets and auto-resolver
 * registry (lib/predictions): "does <party> control <chamber>" and "does <party>
 * win <toss-up race>".
 *
 * Money-safety rules, because a wrong settlement pays real (virtual) coins out
 * irrecoverably and the feed behind it is an unofficial one:
 *  - Trading CLOSES at noon Eastern on Election Day — before the first polls
 *    close, so nobody trades on known results.
 *  - Settlement is not eligible until noon Eastern the day AFTER, when calls
 *    are stable and the early-night mistakes (the ones that get retracted) are
 *    behind us.
 *  - A resolver answers only when the outcome is mathematically decided; any
 *    ambiguity (no snapshot, uncalled race, a chamber short of a majority with
 *    races still out) is `null` — the market stays open and is retried.
 */

import { etDayStart, type Cycle } from './calendar';
import { raceKey } from './predict';
import { OFFICE_NAME, type ChamberControl, type ElectionSnapshot, type Party } from './types';

export const CHAMBER_RESOLVER = 'election.chamber';
export const RACE_RESOLVER = 'election.race';

export type MarketParty = Extract<Party, 'DEM' | 'GOP'>;

export interface ChamberParams {
  date: string;
  office: 'senate' | 'house';
  party: MarketParty;
}

export interface RaceParams {
  date: string;
  /** Short race key, e.g. "PA-G-S". */
  key: string;
  party: MarketParty;
}

export interface MarketSpec {
  resolverKey: typeof CHAMBER_RESOLVER | typeof RACE_RESOLVER;
  params: ChamberParams | RaceParams;
  title: string;
  description: string;
  subjectUrl: string;
  closesAt: Date;
  autoResolveAt: Date;
}

const HOUR = 3_600_000;
const PARTY_WORD: Record<MarketParty, string> = { DEM: 'Democrats', GOP: 'Republicans' };
const MAX_RACE_MARKETS = 8;

export function marketTimes(date: string) {
  const start = etDayStart(date).getTime();
  return {
    closesAt: new Date(start + 12 * HOUR),
    autoResolveAt: new Date(start + (24 + 12) * HOUR),
  };
}

/** The markets worth opening for this cycle, given what the snapshot knows. */
export function electionMarketSpecs(cycle: Cycle, snapshot: ElectionSnapshot): MarketSpec[] {
  const { closesAt, autoResolveAt } = marketTimes(cycle.date);
  const out: MarketSpec[] = [];
  const note =
    'Settles automatically from the live results feed the day after Election Day. Trading closes at noon ET on Election Day.';

  // Chambers: one question each, from the side most people ask it about.
  const chambers: [ChamberParams['office'], MarketParty][] = [
    ['senate', 'GOP'],
    ['house', 'DEM'],
  ];
  for (const [office, party] of chambers) {
    if (!snapshot.chambers[office]) continue;
    out.push({
      resolverKey: CHAMBER_RESOLVER,
      params: { date: cycle.date, office, party },
      title: `Will ${PARTY_WORD[party]} control the ${OFFICE_NAME[office]} after the ${cycle.year} election?`,
      description: note,
      subjectUrl: `/elections?cycle=${cycle.year}#chamber-${office}-${party}`,
      closesAt,
      autoResolveAt,
    });
  }

  // Toss-up statewide races (Senate and governor), a handful, most-watched first.
  const tossups = snapshot.races
    .filter((r) => (r.office === 'senate' || r.office === 'governor') && r.rating === 'tossup' && r.status !== 'called')
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, MAX_RACE_MARKETS);
  for (const r of tossups) {
    const key = raceKey(r);
    out.push({
      resolverKey: RACE_RESOLVER,
      params: { date: cycle.date, key, party: 'DEM' },
      title: `Will a Democrat win ${r.label.replace(' · ', ': ')}?`.slice(0, 160),
      description: note,
      subjectUrl: `/elections?cycle=${cycle.year}#race-${key}`,
      closesAt,
      autoResolveAt,
    });
  }
  return out;
}

function isMarketParty(v: unknown): v is MarketParty {
  return v === 'DEM' || v === 'GOP';
}

/** YES/NO once decided, null otherwise. Never guesses. */
export function resolveChamber(
  snapshot: ElectionSnapshot,
  params: Record<string, unknown>,
): 'YES' | 'NO' | null {
  const office = params.office;
  const party = params.party;
  if ((office !== 'senate' && office !== 'house') || !isMarketParty(party)) return null;
  if (snapshot.source !== 'nyt') return null;
  const c: ChamberControl | undefined = snapshot.chambers[office];
  if (!c || c.derived) return null; // a derived tally has no holdovers: it cannot say who controls
  if (c.controlledBy === party) return 'YES';
  if (c.controlledBy) return 'NO'; // the other side clinched
  // Nobody has a majority. Only call it NO once every race in the chamber is called (a true tie).
  const racesIn = snapshot.races.filter((r) => r.office === office);
  if (racesIn.length > 0 && racesIn.every((r) => r.status === 'called')) return 'NO';
  return null;
}

export function resolveRace(
  snapshot: ElectionSnapshot,
  params: Record<string, unknown>,
): 'YES' | 'NO' | null {
  const key = params.key;
  const party = params.party;
  if (typeof key !== 'string' || !isMarketParty(party)) return null;
  if (snapshot.source !== 'nyt') return null;
  const race = snapshot.races.find((r) => raceKey(r) === key);
  if (!race || race.status !== 'called' || !race.winnerParty) return null;
  return race.winnerParty === party ? 'YES' : 'NO';
}
