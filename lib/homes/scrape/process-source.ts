/**
 * RMHHomes scraper — process one source (server only).
 *
 * robots-gate → discover → assess → upsert each listing → expire the ones that
 * vanished from the feed. Every listing becomes an EXTERNAL HomeListing keyed by
 * (sourceRefId, externalId) so re-runs update in place instead of duplicating.
 *
 * The Prisma surface is a structural `ProcessPrisma` so tests inject an
 * in-memory fake (same idiom as lib/rmhladder/pipeline/process-source.ts).
 */

import { getAdapter, checkRobots } from './adapters/index';
import { assessListing } from './ingest';
import { isPriceChange, isPriceDrop } from '../prices';
import type { HomeSourceConfig } from './types';

export interface SourceRunStats {
  discovered: number;
  created: number;
  updated: number;
  expired: number;
  errored: boolean;
  blocked: boolean;
  errorMessage?: string;
  /** Ids of listings newly created this run (for watch-alert fan-out). */
  newListingIds: string[];
  /** Listings whose price dropped by at least 1% this run (for the favouriters' drop notices). */
  priceDrops: PriceDropRecord[];
}

export interface PriceDropRecord {
  listingId: string;
  title: string;
  city: string;
  state: string;
  oldCents: number;
  newCents: number;
}

interface ExistingRow {
  id: string;
  externalId: string;
  status: string;
  priceCents: number;
}

export interface ProcessPrisma {
  homeListing: {
    /** One read per batch: the stored rows for the feed's external ids. */
    findMany(args: {
      where: { sourceRefId: string; externalId: { in: string[] } };
      select?: Record<string, unknown>;
    }): Promise<ExistingRow[]>;
    upsert(args: {
      where: {
        sourceRefId_externalId: {
          sourceRefId: string;
          externalId: string;
        };
      };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<{
      id: string;
    }>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{
      count: number;
    }>;
  };
  homeListingPriceChange: {
    createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>;
  };
  homeSource: {
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

/**
 * Record the outcome on the source row. An admin's pause (`DISABLED`, /admin/homes) must survive a run in flight, so
 * the status, the error text and the timestamps go in one `updateMany` that skips a disabled source. A source paused
 * while it was being fetched only has its run times written: the pause stays and `lastError` is not replaced.
 */
async function writeSourceOutcome(
  prisma: ProcessPrisma,
  id: string,
  data: { status: 'ACTIVE' | 'ERROR' | 'BLOCKED'; lastRunAt: Date; lastSuccessAt?: Date; lastError: string | null },
): Promise<void> {
  const { count } = await prisma.homeSource.updateMany({ where: { id, status: { not: 'DISABLED' } }, data });
  if (count > 0) return;
  const { status: _status, lastError: _lastError, ...times } = data;
  await prisma.homeSource.updateMany({ where: { id }, data: times });
}

const ZERO: Omit<SourceRunStats, 'newListingIds' | 'priceDrops'> = {
  discovered: 0,
  created: 0,
  updated: 0,
  expired: 0,
  errored: false,
  blocked: false,
};

export async function processSource(
  deps: {
    prisma: ProcessPrisma;
    fetchImpl?: typeof fetch;
    now?: Date;
  },
  source: HomeSourceConfig,
): Promise<SourceRunStats> {
  const now = deps.now ?? new Date();
  const adapter = getAdapter(source.provider);
  if (!adapter) {
    return {
      ...ZERO,
      errored: true,
      errorMessage: `No adapter for provider ${source.provider}`,
      newListingIds: [],
      priceDrops: [],
    };
  }

  const feedUrl = adapter.feedUrl(source);
  if (!feedUrl) {
    return {
      ...ZERO,
      errored: true,
      errorMessage: `Source ${source.key} has no resolvable feed URL`,
      newListingIds: [],
      priceDrops: [],
    };
  }

  const stats: SourceRunStats = {
    ...ZERO,
    newListingIds: [],
    priceDrops: [],
  };

  try {
    // 1. Respect robots.txt before touching the feed.
    const allowed = await checkRobots(feedUrl, deps.fetchImpl);
    if (!allowed) {
      await writeSourceOutcome(deps.prisma, source.id, {
        status: 'BLOCKED',
        lastRunAt: now,
        lastError: 'robots.txt disallows this feed',
      });
      return {
        ...stats,
        errored: true,
        blocked: true,
        errorMessage: 'robots.txt disallows this feed',
      };
    }

    // 2. Discover.
    const listings = await adapter.discover({
      source,
      fetchImpl: deps.fetchImpl,
    });
    stats.discovered = listings.length;

    // Zero discoveries: empty feed or fetch failure — no success evidence, and
    // crucially we do NOT expire (a transient fetch failure must not wipe the
    // source's inventory).
    if (stats.discovered === 0) {
      await writeSourceOutcome(deps.prisma, source.id, {
        status: 'ACTIVE',
        lastRunAt: now,
        lastError: 'no listings discovered',
      });
      return {
        ...stats,
        errorMessage: 'no listings discovered (empty feed or fetch failure)',
      };
    }

    // 3. Upsert each listing. The stored rows for the whole batch are read once, up front, so a price change
    // is found by comparing in memory (one read per batch, not one per listing).
    const assessedAll = [];
    for (const normalized of listings) {
      const assessed = assessListing(normalized, source);
      if (assessed) assessedAll.push(assessed);
    }
    const existingRows = await deps.prisma.homeListing.findMany({
      where: {
        sourceRefId: source.id,
        externalId: { in: [...new Set(assessedAll.map((a) => a.externalId))] },
      },
      select: {
        id: true,
        externalId: true,
        status: true,
        priceCents: true,
      },
    });
    const existingByExternal = new Map(existingRows.map((r) => [r.externalId, r]));
    const changes: Array<{ listingId: string; oldCents: number; newCents: number }> = [];

    for (const assessed of assessedAll) {
      const existing = existingByExternal.get(assessed.externalId);

      const shared = {
        listingType: assessed.listingType,
        propertyType: assessed.propertyType,
        title: assessed.title,
        description: assessed.description,
        priceCents: assessed.priceCents,
        beds: assessed.beds,
        baths: assessed.baths,
        sqft: assessed.sqft,
        petsAllowed: assessed.petsAllowed,
        city: assessed.city,
        state: assessed.state,
        lat: assessed.lat,
        lng: assessed.lng,
        images: assessed.images,
        sourceName: assessed.sourceName,
        externalUrl: assessed.externalUrl,
        lastSeenAt: now,
      };

      const upserted = await deps.prisma.homeListing.upsert({
        where: {
          sourceRefId_externalId: {
            sourceRefId: source.id,
            externalId: assessed.externalId,
          },
        },
        create: {
          source: 'EXTERNAL',
          status: 'ACTIVE',
          authorId: null,
          sourceRefId: source.id,
          externalId: assessed.externalId,
          amenities: [],
          aiImages: [],
          availableFrom: null,
          // Show the real feed date as the "posted" time when we have it.
          createdAt: assessed.postedAt ?? now,
          ...shared,
        },
        update: {
          // Re-seen listings are live again (external listings are never marked
          // rented/sold by an owner, so forcing ACTIVE is safe).
          status: 'ACTIVE',
          ...shared,
        },
      });

      if (existing) {
        stats.updated++;
        if (isPriceChange(existing.priceCents, assessed.priceCents)) {
          changes.push({ listingId: existing.id, oldCents: existing.priceCents, newCents: assessed.priceCents });
          if (isPriceDrop(existing.priceCents, assessed.priceCents)) {
            stats.priceDrops.push({
              listingId: existing.id,
              title: assessed.title,
              city: assessed.city,
              state: assessed.state,
              oldCents: existing.priceCents,
              newCents: assessed.priceCents,
            });
          }
          // A later duplicate of the same posting in this feed compares against what was just written.
          existingByExternal.set(assessed.externalId, { ...existing, priceCents: assessed.priceCents });
        }
      } else {
        stats.created++;
        stats.newListingIds.push(upserted.id);
      }
    }

    // Record the price changes after the upserts: the history rows, then the drop stamp.
    if (changes.length > 0) {
      await deps.prisma.homeListingPriceChange.createMany({
        data: changes.map((c) => ({ ...c, source: 'feed', changedAt: now })),
      });
      if (stats.priceDrops.length > 0) {
        await deps.prisma.homeListing.updateMany({
          where: { id: { in: stats.priceDrops.map((d) => d.listingId) } },
          data: { priceDroppedAt: now },
        });
      }
    }

    // 4. Expire listings from this source not seen this run.
    const expired = await deps.prisma.homeListing.updateMany({
      where: {
        sourceRefId: source.id,
        source: 'EXTERNAL',
        status: 'ACTIVE',
        lastSeenAt: {
          lt: now,
        },
      },
      data: {
        status: 'REMOVED',
      },
    });
    stats.expired = expired.count;

    // 5. Mark the source healthy.
    await writeSourceOutcome(deps.prisma, source.id, {
      status: 'ACTIVE',
      lastRunAt: now,
      lastSuccessAt: now,
      lastError: null,
    });

    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await writeSourceOutcome(deps.prisma, source.id, {
        status: 'ERROR',
        lastRunAt: now,
        lastError: message.slice(0, 500),
      });
    } catch {
      // ignore secondary error
    }
    return {
      ...stats,
      errored: true,
      errorMessage: message,
    };
  }
}
