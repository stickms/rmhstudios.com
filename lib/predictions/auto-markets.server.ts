import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolvePrediction } from './predictions.server';
import { getResolver } from './resolvers.server';

type Db = PrismaClient;

// Self-referential markets: markets whose outcome the platform already knows.
// Seeders create them from live platform data; the tick settles them via the
// resolver registry. No AI judge, no admin — resolution is mechanical.

const OPEN_AUTO_CAP = 40; // don't flood the market list
const DEFAULT_BUILD_WINDOW_DAYS = 3;

/**
 * Seed a "will the top seed win?" market when a tournament starts. Idempotent per
 * tournament (won't create a second market for the same subject). Best-effort.
 */
export async function seedTournamentMarket(tournamentId: string, db: Db = prisma): Promise<boolean> {
  try {
    const subjectUrl = `/tournaments/${tournamentId}`;
    const existing = await db.prediction.findFirst({
      where: { subjectUrl, resolverKey: 'tournament.topseed' },
      select: { id: true },
    });
    if (existing) return false;

    const t = await db.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, status: true, _count: { select: { entrants: true } } },
    });
    if (!t || t.status !== 'LIVE' || t._count.entrants < 4) return false;

    await db.prediction.create({
      data: {
        title: `Will the #1 seed win ${t.name}?`.slice(0, 160),
        description: 'Auto-settles from the bracket result when this tournament finishes.',
        status: 'OPEN',
        creatorId: null,
        isAiGenerated: false,
        resolverKey: 'tournament.topseed',
        resolverParams: { tournamentId },
        subjectUrl,
        // No trading deadline — closes when the bracket resolves it.
        closesAt: null,
        autoResolveAt: null,
      },
    });
    return true;
  } catch (err) {
    console.error('[auto-markets] seedTournamentMarket failed:', err);
    return false;
  }
}

/**
 * Seed "will this build reach N likes by <deadline>?" markets for builds that are
 * gaining traction. Bounded by the open-auto cap. Best-effort.
 */
export async function seedTrendingBuildMarkets(
  db: Db = prisma,
  opts: { cap?: number } = {},
): Promise<number> {
  const cap = opts.cap ?? OPEN_AUTO_CAP;
  try {
    const openAuto = await db.prediction.count({
      where: { status: 'OPEN', resolverKey: { not: null } },
    });
    if (openAuto >= cap) return 0;

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const builds = await db.userBuild.findMany({
      where: { createdAt: { gte: since }, likeCount: { gte: 3, lte: 200 } },
      orderBy: { likeCount: 'desc' },
      take: 5,
      select: { id: true, slug: true, title: true, likeCount: true },
    });

    let created = 0;
    for (const b of builds) {
      if (openAuto + created >= cap) break;
      const subjectUrl = `/user-builds/${b.slug}`;
      const existing = await db.prediction.findFirst({
        where: { subjectUrl, status: 'OPEN' },
        select: { id: true },
      });
      if (existing) continue;

      const threshold = b.likeCount + Math.max(5, Math.round(b.likeCount * 0.5));
      const deadline = new Date(Date.now() + DEFAULT_BUILD_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      await db.prediction.create({
        data: {
          title: `Will "${b.title}" reach ${threshold} likes in ${DEFAULT_BUILD_WINDOW_DAYS} days?`.slice(
            0,
            160,
          ),
          description: 'Auto-settles from the build’s like count at the deadline.',
          status: 'OPEN',
          creatorId: null,
          isAiGenerated: false,
          resolverKey: 'build.likes',
          resolverParams: { buildId: b.id, threshold },
          subjectUrl,
          closesAt: deadline,
          autoResolveAt: deadline,
        },
      });
      created++;
    }
    return created;
  } catch (err) {
    console.error('[auto-markets] seedTrendingBuildMarkets failed:', err);
    return 0;
  }
}

/**
 * Settle every auto-market whose outcome is now known. A market is eligible when
 * it's OPEN, has a resolverKey, and either has no deadline (poll-to-completion,
 * e.g. tournaments) or its deadline has passed. Idempotent — `resolvePrediction`
 * no-ops on already-resolved markets.
 */
export async function resolveDueAutoMarkets(
  db: Db = prisma,
  opts: { max?: number } = {},
): Promise<number> {
  const max = opts.max ?? 20;
  const now = new Date();
  const due = await db.prediction.findMany({
    where: {
      status: 'OPEN',
      resolverKey: { not: null },
      OR: [{ autoResolveAt: null }, { autoResolveAt: { lte: now } }],
    },
    take: max,
    select: { id: true, resolverKey: true, resolverParams: true },
  });

  let resolved = 0;
  for (const m of due) {
    if (!m.resolverKey) continue;
    const resolver = getResolver(m.resolverKey);
    if (!resolver) continue;
    try {
      const params = (m.resolverParams ?? {}) as Record<string, unknown>;
      const outcome = await resolver.resolve(params, db);
      if (outcome === 'YES' || outcome === 'NO') {
        const res = await resolvePrediction({ predictionId: m.id, outcome }, db);
        if (res.resolved) resolved++;
      }
    } catch (err) {
      // Fail closed: leave the market open, try again next tick.
      console.error(`[auto-markets] resolver ${m.resolverKey} failed for ${m.id}:`, err);
    }
  }
  return resolved;
}

/** One full tick: seed fresh markets, then settle anything now decided. */
export async function runAutoMarketTick(db: Db = prisma): Promise<{ seeded: number; resolved: number }> {
  const seeded = await seedTrendingBuildMarkets(db);
  const resolved = await resolveDueAutoMarkets(db);
  return { seeded, resolved };
}
