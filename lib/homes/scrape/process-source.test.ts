import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processSource, type ProcessPrisma } from './process-source';
import type { HomeSourceConfig } from './types';

const FIXTURE = readFileSync(join(__dirname, 'adapters/__fixtures__/craigslist-apa.rss'), 'utf8');
const FEED_URL = 'https://rochester.craigslist.org/search/apa?format=rss';
const ROBOTS_URL = 'https://rochester.craigslist.org/robots.txt';

const SOURCE: HomeSourceConfig = {
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

// ── In-memory prisma fake ────────────────────────────────────────────────────

interface Row {
  id: string;
  sourceRefId: string;
  externalId: string;
  source: string;
  status: string;
  lastSeenAt: Date;
}

function makePrisma() {
  const listings = new Map<string, Row>();
  const sourceUpdates: Record<string, unknown>[] = [];
  const key = (s: string, e: string) => `${s}::${e}`;

  const prisma: ProcessPrisma = {
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
      async updateMany({ where, data }) {
        let count = 0;
        const before = (where.lastSeenAt as { lt: Date }).lt;
        for (const r of listings.values()) {
          if (
            r.sourceRefId === where.sourceRefId &&
            r.source === where.source &&
            r.status === where.status &&
            r.lastSeenAt < before
          ) {
            r.status = String(data.status);
            count++;
          }
        }
        return { count };
      },
    },
    homeSource: {
      async update({ data }) {
        sourceUpdates.push(data);
        return { id: SOURCE.id };
      },
    },
  };

  return { prisma, listings, sourceUpdates };
}

// ── fetch stub ───────────────────────────────────────────────────────────────

function makeFetch(opts: {
  feedBody: string;
  robots?: { status: number; body: string };
}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === ROBOTS_URL) {
      const r = opts.robots ?? { status: 404, body: '' };
      return new Response(r.body, { status: r.status });
    }
    if (url === FEED_URL) return new Response(opts.feedBody, { status: 200 });
    return new Response('', { status: 404 });
  }) as typeof fetch;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('processSource', () => {
  it('creates external listings on the first run', async () => {
    const { prisma, listings, sourceUpdates } = makePrisma();
    const stats = await processSource(
      {
        prisma,
        fetchImpl: makeFetch({ feedBody: FIXTURE }),
        now: new Date('2026-07-10T00:00:00Z'),
      },
      SOURCE,
    );
    expect(stats).toMatchObject({
      discovered: 2,
      created: 2,
      updated: 0,
      expired: 0,
      errored: false,
    });
    expect(stats.newListingIds).toHaveLength(2);
    expect(listings.size).toBe(2);
    // Source stamped healthy with lastSuccessAt.
    expect(sourceUpdates.at(-1)).toMatchObject({ status: 'ACTIVE' });
    expect(sourceUpdates.at(-1)).toHaveProperty('lastSuccessAt');
  });

  it('updates in place on a re-run (no duplicates, no expiry)', async () => {
    const { prisma, listings } = makePrisma();
    const fetchImpl = makeFetch({ feedBody: FIXTURE });
    await processSource({ prisma, fetchImpl, now: new Date('2026-07-10T00:00:00Z') }, SOURCE);
    const stats = await processSource(
      { prisma, fetchImpl, now: new Date('2026-07-11T00:00:00Z') },
      SOURCE,
    );
    expect(stats).toMatchObject({ discovered: 2, created: 0, updated: 2, expired: 0 });
    expect(listings.size).toBe(2);
  });

  it('expires listings that vanish from the feed', async () => {
    const { prisma, listings } = makePrisma();
    // First run: both listings.
    await processSource(
      {
        prisma,
        fetchImpl: makeFetch({ feedBody: FIXTURE }),
        now: new Date('2026-07-10T00:00:00Z'),
      },
      SOURCE,
    );
    // Second run: a feed with only listing 1001 — 1002 should expire.
    const onlyFirst = FIXTURE.replace(/<item rdf:about="[^"]*1002\.html">[\s\S]*?<\/item>/, '');
    const stats = await processSource(
      {
        prisma,
        fetchImpl: makeFetch({ feedBody: onlyFirst }),
        now: new Date('2026-07-11T00:00:00Z'),
      },
      SOURCE,
    );
    expect(stats).toMatchObject({ discovered: 1, updated: 1, expired: 1 });
    expect(listings.get('src1::1002')?.status).toBe('REMOVED');
    expect(listings.get('src1::1001')?.status).toBe('ACTIVE');
  });

  it('does NOT expire on a transient empty feed', async () => {
    const { prisma, listings } = makePrisma();
    await processSource(
      {
        prisma,
        fetchImpl: makeFetch({ feedBody: FIXTURE }),
        now: new Date('2026-07-10T00:00:00Z'),
      },
      SOURCE,
    );
    const stats = await processSource(
      {
        prisma,
        fetchImpl: makeFetch({ feedBody: '<rdf:RDF></rdf:RDF>' }),
        now: new Date('2026-07-11T00:00:00Z'),
      },
      SOURCE,
    );
    expect(stats.discovered).toBe(0);
    expect(stats.expired).toBe(0);
    // Inventory preserved.
    expect(listings.get('src1::1001')?.status).toBe('ACTIVE');
    expect(listings.get('src1::1002')?.status).toBe('ACTIVE');
  });

  it('blocks the source when robots.txt disallows the feed', async () => {
    const { prisma, listings, sourceUpdates } = makePrisma();
    const stats = await processSource(
      {
        prisma,
        fetchImpl: makeFetch({
          feedBody: FIXTURE,
          robots: { status: 200, body: 'User-agent: *\nDisallow: /' },
        }),
        now: new Date('2026-07-10T00:00:00Z'),
      },
      SOURCE,
    );
    expect(stats.blocked).toBe(true);
    expect(stats.errored).toBe(true);
    expect(listings.size).toBe(0);
    expect(sourceUpdates.at(-1)).toMatchObject({ status: 'BLOCKED' });
  });
});
