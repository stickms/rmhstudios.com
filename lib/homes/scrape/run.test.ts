import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runHomesScrape, type RunPrisma } from './run';

const FIXTURE = readFileSync(join(__dirname, 'adapters/__fixtures__/craigslist-apa.rss'), 'utf8');
const FEED_URL = 'https://rochester.craigslist.org/search/apa?format=rss';

const SOURCE_ROW = {
  id: 'src1',
  key: 'craigslist:rochester:apa',
  provider: 'CRAIGSLIST',
  label: 'Craigslist Rochester — Rentals',
  region: 'rochester',
  category: 'apa',
  url: null,
  listingType: 'RENT',
  defaultCity: 'Rochester',
  defaultState: 'NY',
  defaultLat: 43.1566,
  defaultLng: -77.6088,
};

interface Row {
  id: string;
  sourceRefId: string;
  externalId: string;
  source: string;
  status: string;
  lastSeenAt: Date;
}

function makeRunPrisma() {
  const listings = new Map<string, Row>();
  const runs: { id: string; data: Record<string, unknown> }[] = [];
  const key = (s: string, e: string) => `${s}::${e}`;

  const prisma: RunPrisma = {
    homeListing: {
      async findUnique({ where }) {
        const r = listings.get(
          key(where.sourceRefId_externalId.sourceRefId, where.sourceRefId_externalId.externalId),
        );
        return r ? { id: r.id, status: r.status } : null;
      },
      async upsert({ where, create, update }) {
        const k = key(
          where.sourceRefId_externalId.sourceRefId,
          where.sourceRefId_externalId.externalId,
        );
        const existing = listings.get(k);
        if (existing) {
          existing.status = String(update.status);
          existing.lastSeenAt = update.lastSeenAt as Date;
          return { id: existing.id };
        }
        const row: Row = {
          id: `L-${where.sourceRefId_externalId.externalId}`,
          sourceRefId: where.sourceRefId_externalId.sourceRefId,
          externalId: where.sourceRefId_externalId.externalId,
          source: String(create.source),
          status: String(create.status),
          lastSeenAt: create.lastSeenAt as Date,
        };
        listings.set(k, row);
        return { id: row.id };
      },
      async updateMany() {
        return { count: 0 };
      },
    },
    homeSource: {
      async update() {
        return { id: 'src1' };
      },
      async findMany() {
        return [SOURCE_ROW];
      },
    },
    homeScrapeRun: {
      async create() {
        return { id: 'run1' };
      },
      async update({ where, data }) {
        runs.push({ id: where.id, data });
        return { id: where.id };
      },
    },
  };

  return { prisma, listings, runs };
}

function fetchServing(body: string): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === FEED_URL) return new Response(body, { status: 200 });
    return new Response('', { status: 404 }); // robots.txt 404 → allowed
  }) as typeof fetch;
}

describe('runHomesScrape', () => {
  it('processes sources, aggregates totals, finalizes the run row', async () => {
    const { prisma, listings, runs } = makeRunPrisma();
    const newIds: string[] = [];

    const result = await runHomesScrape(
      {
        prisma,
        fetchImpl: fetchServing(FIXTURE),
        now: new Date('2026-07-10T00:00:00Z'),
        sleepMs: 0,
        onNewListing: (id) => {
          newIds.push(id);
        },
      },
      { trigger: 'CRON' },
    );

    expect(result).toMatchObject({
      runId: 'run1',
      sources: 1,
      discovered: 2,
      created: 2,
      updated: 0,
      errors: 0,
    });
    expect(listings.size).toBe(2);
    // Watch fan-out fired for each new listing.
    expect(newIds).toEqual(['L-1001', 'L-1002']);
    // Run row finalized with counts.
    expect(runs.at(-1)?.data).toMatchObject({ discoveredCount: 2, createdCount: 2, errorCount: 0 });
    expect(runs.at(-1)?.data).toHaveProperty('finishedAt');
  });

  it('honors the limitSources option', async () => {
    const { prisma } = makeRunPrisma();
    const result = await runHomesScrape(
      {
        prisma,
        fetchImpl: fetchServing(FIXTURE),
        now: new Date('2026-07-10T00:00:00Z'),
        sleepMs: 0,
      },
      { trigger: 'MANUAL', limitSources: 0 },
    );
    expect(result.sources).toBe(0);
    expect(result.discovered).toBe(0);
  });
});
