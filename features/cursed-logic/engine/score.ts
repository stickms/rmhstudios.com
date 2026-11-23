/**
 * Run score. Client-safe and shared with the score route, which re-derives the ceiling for the duels a submission
 * claims (`maxScoreFor`), so a forged score above what those duels could earn is refused.
 */
import { PACTS, PLAYER, SCORE, SECTORS, TOTAL_DUELS } from './data';
import type { PactId } from './types';

export interface DuelScoreInput {
  sector: number;
  integrityLeft: number;
  rounds: number;
  flawless: boolean;
}

export interface DuelScore {
  base: number;
  integrity: number;
  flawless: number;
  speed: number;
  total: number;
}

/** Points for one duel won, before the pact multiplier. */
export function scoreDuel(d: DuelScoreInput): DuelScore {
  const base = SCORE.duelPerSector * d.sector;
  const integrity = SCORE.perIntegrity * Math.max(0, d.integrityLeft);
  const flawless = d.flawless ? SCORE.flawlessPerSector * d.sector : 0;
  const speed = Math.max(0, SCORE.parRounds - d.rounds) * SCORE.perRoundUnderPar;
  return { base, integrity, flawless, speed, total: base + integrity + flawless + speed };
}

/** The pact multiplier: 1 plus each chosen pact's bonus. */
export function pactMultiplier(pacts: readonly PactId[]): number {
  const unique = [...new Set(pacts)].filter((p) => Object.hasOwn(PACTS, p));
  return 1 + unique.reduce((s, p) => s + PACTS[p].bonus, 0);
}

/** The run score: the duels' raw points plus the victory bonus, times the multiplier, rounded down. */
export function runScore(rawDuelPoints: number, victory: boolean, pacts: readonly PactId[]): number {
  return Math.floor((rawDuelPoints + (victory ? SCORE.runVictory : 0)) * pactMultiplier(pacts));
}

/** Sectors of the first `n` duels of a run, in order. */
function sectorsOfDuels(n: number): number[] {
  const out: number[] = [];
  for (const s of SECTORS) for (let i = 0; i < s.duels && out.length < n; i++) out.push(s.index);
  return out;
}

/** The most a run of `duelsWon` won duels could score (every duel flawless, at the Integrity ceiling, in 1 round). */
export function maxScoreFor(duelsWon: number, multiplier: number): number {
  const n = Math.max(0, Math.min(TOTAL_DUELS, Math.floor(duelsWon)));
  const raw = sectorsOfDuels(n).reduce(
    (sum, sector) =>
      sum + scoreDuel({ sector, integrityLeft: PLAYER.integrityCeiling, rounds: 1, flawless: true }).total,
    0,
  );
  const victory = n === TOTAL_DUELS ? SCORE.runVictory : 0;
  return Math.ceil((raw + victory) * multiplier);
}

/** The ceiling of any run: every duel, every pact. The catalog's `maxScore` sits above this. */
export const MAX_RUN_SCORE = maxScoreFor(TOTAL_DUELS, pactMultiplier(Object.keys(PACTS) as PactId[]));

/** The sector a run is in once it has won `duelsWon` duels (where the next duel, or the last one, is fought). */
export function sectorAfter(duelsWon: number): number {
  const all = sectorsOfDuels(TOTAL_DUELS);
  return all[Math.min(all.length - 1, Math.max(0, duelsWon))] ?? SECTORS.length;
}

export interface RunClaim {
  score: number;
  duelsWon: number;
  sector: number;
  victory: boolean;
  pacts: readonly PactId[];
  flawlessDuels: number;
  fastestDuel: number;
}

/**
 * Why a submitted run cannot be real, or null when its fields agree with each other: the score is within what its
 * duels could earn under its pacts, a victory means every duel, the sector matches the duel count, and the flawless
 * and fastest-duel counts fit the duels won.
 */
export function claimProblem(c: RunClaim): string | null {
  if (c.victory !== (c.duelsWon === TOTAL_DUELS)) return 'victory';
  if (c.sector !== sectorAfter(c.duelsWon)) return 'sector';
  if (c.flawlessDuels > c.duelsWon) return 'flawless';
  if (c.fastestDuel > 0 !== c.duelsWon > 0) return 'fastest';
  if (c.score > maxScoreFor(c.duelsWon, pactMultiplier(c.pacts))) return 'score';
  return null;
}
