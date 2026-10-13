/**
 * Swiss tournament glue — pure and client-safe. Turns persisted match rows
 * into the inputs `swiss.ts` wants, and turns final standings into placements
 * and prize amounts. Kept free of I/O so the money path is unit-testable.
 */
import { standings, type Standing, type SwissResult } from './swiss';
import { rakeOf, TOURNAMENT_PAYOUT_SPLITS } from '@/lib/wager/constants';

export interface SwissMatchRow {
  entrantAId: string | null;
  entrantBId: string | null;
  winnerEntrantId: string | null;
  state: string;
}

/** Completed matches as Swiss results; a missing opponent is a bye (a win). */
export function resultsFromMatches(matches: readonly SwissMatchRow[]): SwissResult[] {
  const out: SwissResult[] = [];
  for (const m of matches) {
    if (m.state !== 'COMPLETE' || !m.winnerEntrantId) continue;
    const a = m.entrantAId ?? m.entrantBId;
    if (!a) continue;
    const b = m.entrantAId && m.entrantBId ? m.entrantBId : null;
    out.push({ a, b, winner: m.winnerEntrantId });
  }
  return out;
}

/** Standings table for a Swiss event; `entrantIdsBySeed` breaks full ties. */
export function swissTable(
  entrantIdsBySeed: readonly string[],
  matches: readonly SwissMatchRow[],
): Standing[] {
  return standings(entrantIdsBySeed, resultsFromMatches(matches));
}

/**
 * Pool split by entrant-count bucket (largest key <= count), rake taken first,
 * rounding remainder to first place. Sum of payouts + rake always equals pool.
 */
export function computePayouts(
  prizePoolCoins: number,
  rakeBps: number,
  entrantCount: number,
): { payouts: number[]; rake: number } {
  const bucketKey = Object.keys(TOURNAMENT_PAYOUT_SPLITS)
    .map(Number)
    .filter((k) => k <= entrantCount)
    .sort((a, b) => b - a)[0];
  const split = TOURNAMENT_PAYOUT_SPLITS[bucketKey ?? 2] ?? [10_000];
  const rake = rakeOf(prizePoolCoins, rakeBps);
  const pool = prizePoolCoins - rake;
  const payouts = split.map((bps) => Math.floor((pool * bps) / 10_000));
  const distributed = payouts.reduce((s, p) => s + p, 0);
  if (payouts.length > 0) payouts[0] += pool - distributed;
  return { payouts, rake };
}

export interface Settlement {
  entrantId: string;
  placement: number;
  amount: number;
}

/** Final placements and prizes from Swiss standings. */
export function swissSettlement(
  entrantIdsBySeed: readonly string[],
  matches: readonly SwissMatchRow[],
  prizePoolCoins: number,
  rakeBps: number,
): Settlement[] {
  const table = swissTable(entrantIdsBySeed, matches);
  const { payouts } = computePayouts(prizePoolCoins, rakeBps, table.length);
  return table.map((s, i) => ({ entrantId: s.id, placement: i + 1, amount: payouts[i] ?? 0 }));
}
