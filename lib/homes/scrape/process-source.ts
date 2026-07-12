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
}

interface ExistingRow {
  id: string;
  status: string;
}

export interface ProcessPrisma {
  homeListing: {
    findUnique(args: {
      where: { sourceRefId_externalId: { sourceRefId: string; externalId: string } };
      select?: Record<string, unknown>;
    }): Promise<ExistingRow | null>;
    upsert(args: {
      where: { sourceRefId_externalId: { sourceRefId: string; externalId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<{ id: string }>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  homeSource: {
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

const ZERO: Omit<SourceRunStats, 'newListingIds'> = {
  discovered: 0,
  created: 0,
  updated: 0,
  expired: 0,
  errored: false,
  blocked: false,
};

export async function processSource(
  deps: { prisma: ProcessPrisma; fetchImpl?: typeof fetch; now?: Date },
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
    };
  }

  const feedUrl = adapter.feedUrl(source);
  if (!feedUrl) {
    return {
      ...ZERO,
      errored: true,
      errorMessage: `Source ${source.key} has no resolvable feed URL`,
      newListingIds: [],
    };
  }

  const stats: SourceRunStats = { ...ZERO, newListingIds: [] };

  try {
    // 1. Respect robots.txt before touching the feed.
    const allowed = await checkRobots(feedUrl, deps.fetchImpl);
    if (!allowed) {
      await deps.prisma.homeSource.update({
        where: { id: source.id },
        data: { status: 'BLOCKED', lastRunAt: now, lastError: 'robots.txt disallows this feed' },
      });
      return {
        ...stats,
        errored: true,
        blocked: true,
        errorMessage: 'robots.txt disallows this feed',
      };
    }

    // 2. Discover.
    const listings = await adapter.discover({ source, fetchImpl: deps.fetchImpl });
    stats.discovered = listings.length;

    // Zero discoveries: empty feed or fetch failure — no success evidence, and
    // crucially we do NOT expire (a transient fetch failure must not wipe the
    // source's inventory).
    if (stats.discovered === 0) {
      await deps.prisma.homeSource.update({
        where: { id: source.id },
        data: { status: 'ACTIVE', lastRunAt: now, lastError: 'no listings discovered' },
      });
      return { ...stats, errorMessage: 'no listings discovered (empty feed or fetch failure)' };
    }

    // 3. Upsert each listing.
    for (const normalized of listings) {
      const assessed = assessListing(normalized, source);
      if (!assessed) continue;

      const existing = await deps.prisma.homeListing.findUnique({
        where: {
          sourceRefId_externalId: { sourceRefId: source.id, externalId: assessed.externalId },
        },
        select: { id: true, status: true },
      });

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
          sourceRefId_externalId: { sourceRefId: source.id, externalId: assessed.externalId },
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
      } else {
        stats.created++;
        stats.newListingIds.push(upserted.id);
      }
    }

    // 4. Expire listings from this source not seen this run.
    const expired = await deps.prisma.homeListing.updateMany({
      where: {
        sourceRefId: source.id,
        source: 'EXTERNAL',
        status: 'ACTIVE',
        lastSeenAt: { lt: now },
      },
      data: { status: 'REMOVED' },
    });
    stats.expired = expired.count;

    // 5. Mark the source healthy.
    await deps.prisma.homeSource.update({
      where: { id: source.id },
      data: { status: 'ACTIVE', lastRunAt: now, lastSuccessAt: now, lastError: null },
    });

    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await deps.prisma.homeSource.update({
        where: { id: source.id },
        data: { status: 'ERROR', lastRunAt: now, lastError: message.slice(0, 500) },
      });
    } catch {
      // ignore secondary error
    }
    return { ...stats, errored: true, errorMessage: message };
  }
}
