import type { PrismaClient } from '@prisma/client';
import { CHAMBER_RESOLVER, RACE_RESOLVER, resolveChamber, resolveRace } from '@/lib/elections/markets';
import { snapshotForDate } from '@/lib/elections/markets.server';

// Resolver registry for self-referential prediction markets. Each resolver reads
// the platform's OWN ground truth and returns a definitive YES/NO, or null when
// the outcome isn't known yet (the tick will try again later). This is what
// makes these markets trustworthy: resolution is mechanical, not an AI judge or
// an admin. Every resolver must FAIL CLOSED to null on any error/missing data so
// a bug can never mis-pay a market.

export type ResolverOutcome = 'YES' | 'NO' | null;

export interface MarketResolver {
  key: string;
  /** `params` is the market's stored `resolverParams` JSON. */
  resolve(params: Record<string, unknown>, db: PrismaClient): Promise<ResolverOutcome>;
}

/** "Will the #1 seed win this tournament?" — resolves once the bracket completes. */
const tournamentTopSeed: MarketResolver = {
  key: 'tournament.topseed',
  async resolve(params, db) {
    const tournamentId = typeof params.tournamentId === 'string' ? params.tournamentId : null;
    if (!tournamentId) return null;
    const t = await db.tournament.findUnique({ where: { id: tournamentId } });
    if (!t) return null;
    if (t.status !== 'COMPLETE') return null; // not decided yet
    const topSeed = await db.tournamentEntrant.findFirst({
      where: { tournamentId, seed: 1 },
      select: { placement: true },
    });
    if (!topSeed) return 'NO';
    return topSeed.placement === 1 ? 'YES' : 'NO';
  },
};

/** "Will this build reach N likes by the deadline?" — resolved at autoResolveAt. */
const buildLikes: MarketResolver = {
  key: 'build.likes',
  async resolve(params, db) {
    const buildId = typeof params.buildId === 'string' ? params.buildId : null;
    const threshold = typeof params.threshold === 'number' ? params.threshold : null;
    if (!buildId || threshold == null) return null;
    const build = await db.userBuild.findUnique({
      where: { id: buildId },
      select: { likeCount: true },
    });
    if (!build) return null;
    // The tick only calls this once past the deadline, so answer definitively.
    return build.likeCount >= threshold ? 'YES' : 'NO';
  },
};

/**
 * "Does <party> control <chamber>?" — settles from the election results feed. Fails closed: no
 * snapshot, an unofficial/derived tally or an undecided chamber is null (see lib/elections/markets.ts).
 */
const electionChamber: MarketResolver = {
  key: CHAMBER_RESOLVER,
  async resolve(params) {
    const snap = await snapshotForDate(params.date);
    return snap ? resolveChamber(snap, params) : null;
  },
};

/** "Does <party> win <race>?" — settles once the race is called. Fails closed like the above. */
const electionRace: MarketResolver = {
  key: RACE_RESOLVER,
  async resolve(params) {
    const snap = await snapshotForDate(params.date);
    return snap ? resolveRace(snap, params) : null;
  },
};

const RESOLVERS: Record<string, MarketResolver> = {
  [electionChamber.key]: electionChamber,
  [electionRace.key]: electionRace,
  [tournamentTopSeed.key]: tournamentTopSeed,
  [buildLikes.key]: buildLikes,
};

export function getResolver(key: string): MarketResolver | undefined {
  return RESOLVERS[key];
}

export const RESOLVER_KEYS = Object.keys(RESOLVERS);
