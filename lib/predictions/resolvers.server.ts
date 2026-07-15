import type { PrismaClient } from '@prisma/client';

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

const RESOLVERS: Record<string, MarketResolver> = {
  [tournamentTopSeed.key]: tournamentTopSeed,
  [buildLikes.key]: buildLikes,
};

export function getResolver(key: string): MarketResolver | undefined {
  return RESOLVERS[key];
}

export const RESOLVER_KEYS = Object.keys(RESOLVERS);
