/** Opens election markets and settles them. Server-only. See `markets.ts` for the rules. */

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { currentCycle, parseCycle } from './calendar';
import { isFeedWindow } from './feed';
import { CHAMBER_RESOLVER, RACE_RESOLVER, electionMarketSpecs, marketTimes } from './markets';
import { getElectionSnapshot } from './source.server';

/**
 * Seed the current cycle's markets. Idempotent (keyed by resolver + subjectUrl, which is unique per
 * market), best-effort, and a no-op once trading would already be closed or before the lead window.
 */
export async function seedElectionMarkets(
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<number> {
  try {
    const cycle = currentCycle(now);
    if (!isFeedWindow(cycle, now)) return 0;
    if (now.getTime() >= marketTimes(cycle.date).closesAt.getTime()) return 0;

    const snapshot = await getElectionSnapshot(cycle, now);
    if (snapshot.source !== 'nyt' || !snapshot.races.length) return 0;

    let created = 0;
    for (const spec of electionMarketSpecs(cycle, snapshot)) {
      const exists = await db.prediction.findFirst({
        where: { resolverKey: spec.resolverKey, subjectUrl: spec.subjectUrl },
        select: { id: true },
      });
      if (exists) continue;
      await db.prediction.create({
        data: {
          title: spec.title,
          description: spec.description,
          status: 'OPEN',
          creatorId: null,
          isAiGenerated: false,
          resolverKey: spec.resolverKey,
          resolverParams: spec.params as unknown as object,
          subjectUrl: spec.subjectUrl,
          closesAt: spec.closesAt,
          autoResolveAt: spec.autoResolveAt,
        },
      });
      created++;
    }
    return created;
  } catch (err) {
    console.error('[elections] seedElectionMarkets failed:', err);
    return 0;
  }
}

/** The snapshot a resolver needs, or null (fail closed) when the feed is unreachable. */
export async function snapshotForDate(date: unknown) {
  if (typeof date !== 'string') return null;
  const cycle = parseCycle(date);
  if (!cycle) return null;
  try {
    return await getElectionSnapshot(cycle);
  } catch {
    return null;
  }
}

export const ELECTION_MARKET_KEYS = [CHAMBER_RESOLVER, RACE_RESOLVER] as const;
