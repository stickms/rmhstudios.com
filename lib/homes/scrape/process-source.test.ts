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
  priceCents: number;
  lastSeenAt: Date;
}

function makePrisma(initialStatus = 'ACTIVE') {
  /** The source row as the database holds it: only the columns a status write touches. */
  const source: Record<string, unknown> = { status: initialStatus, lastError: null };
  const listings = new Map<string, Row>();
  const sourceUpdates: Record<string, unknown>[] = [];
  const key = (s: string, e: string) => `${s}::${e}`;
  const calls = { findMany: 0 };
  const priceChanges: Record<string, unknown>[] = [];
  const dropStamps: Array<Record<string, unknown>> = [];

  const prisma: ProcessPrisma = {
    homeListing: {
      async findMany({ where }) {
        calls.findMany++;
        const wanted = new Set(where.externalId.in);
        return [...listings.values()]
          .filter((r) => r.sourceRefId === where.sourceRefId && wanted.has(r.externalId))
          .map((r) => ({ id: r.id, externalId: r.externalId, status: r.status, priceCents: r.priceCents }));
      },
      async upsert({ where, create, update }) {
        const k = key(where.sourceRefId_externalId.sourceRefId, where.sourceRefId_externalId.externalId);
        const existing = listings.get(k);
        if (existing) {
          existing.status = String(update.status);
          existing.priceCents = update.priceCents as number;
          existing.lastSeenAt = update.lastSeenAt as Date;
          return {
            id: existing.id,
          };
        }
        const row: Row = {
          id: `L-${where.sourceRefId_externalId.externalId}`,
          sourceRefId: where.sourceRefId_externalId.sourceRefId,
          externalId: where.sourceRefId_externalId.externalId,
          source: String(create.source),
          status: String(create.status),
          priceCents: create.priceCents as number,
          lastSeenAt: create.lastSeenAt as Date,
        };
        listings.set(k, row);
        return {
          id: row.id,
        };
      },
      async updateMany({ where, data }) {
        if (where.id) {
          dropStamps.push({ where, data });
          return { count: 1 };
        }
        let count = 0;
        const before = (
          where.lastSeenAt as {
            lt: Date;
          }
        ).lt;
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
        return {
          count,
        };
      },
    },
    homeListingPriceChange: {
      async createMany({ data }) {
        priceChanges.push(...data);
        return { count: data.length };
      },
    },
    homeSource: {
      async updateMany({ where, data }) {
        // The conditional write: `status: { not: 'DISABLED' }` skips a paused source, as Postgres would.
        const not = (where.status as { not?: string } | undefined)?.not;
        if (not !== undefined && source.status === not) return { count: 0 };
        sourceUpdates.push(data);
        Object.assign(source, data);
        return { count: 1 };
      },
    },
  };

  return {
    source,
    prisma,
    listings,
    sourceUpdates,
    calls,
    priceChanges,
    dropStamps,
  };
}

// ── fetch stub ───────────────────────────────────────────────────────────────

function makeFetch(opts: {
  feedBody: string;
  robots?: {
    status: number;
    body: string;
  };
}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === ROBOTS_URL) {
      const r = opts.robots ?? {
        status: 404,
        body: '',
      };
      return new Response(r.body, {
        status: r.status,
      });
    }
    if (url === FEED_URL)
      return new Response(opts.feedBody, {
        status: 200,
      });
    return new Response('', {
      status: 404,
    });
  }) as typeof fetch;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('processSource', () => {
  it('creates external listings on the first run', async () => {
    const { prisma, listings, sourceUpdates } = makePrisma();
    const stats = await processSource(
      {
        prisma,
        fetchImpl: makeFetch({
          feedBody: FIXTURE,
        }),
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
    expect(sourceUpdates.at(-1)).toMatchObject({
      status: 'ACTIVE',
    });
    expect(sourceUpdates.at(-1)).toHaveProperty('lastSuccessAt');
  });

  it('updates in place on a re-run (no duplicates, no expiry)', async () => {
    const { prisma, listings } = makePrisma();
    const fetchImpl = makeFetch({
      feedBody: FIXTURE,
    });
    await processSource(
      {
        prisma,
        fetchImpl,
        now: new Date('2026-07-10T00:00:00Z'),
      },
      SOURCE,
    );
    const stats = await processSource(
      {
        prisma,
        fetchImpl,
        now: new Date('2026-07-11T00:00:00Z'),
      },
      SOURCE,
    );
    expect(stats).toMatchObject({
      discovered: 2,
      created: 0,
      updated: 2,
      expired: 0,
    });
    expect(listings.size).toBe(2);
  });

  it('expires listings that vanish from the feed', async () => {
    const { prisma, listings } = makePrisma();
    // First run: both listings.
    await processSource(
      {
        prisma,
        fetchImpl: makeFetch({
          feedBody: FIXTURE,
        }),
        now: new Date('2026-07-10T00:00:00Z'),
      },
      SOURCE,
    );
    // Second run: a feed with only listing 1001 — 1002 should expire.
    const onlyFirst = FIXTURE.replace(/<item rdf:about="[^"]*1002\.html">[\s\S]*?<\/item>/, '');
    const stats = await processSource(
      {
        prisma,
        fetchImpl: makeFetch({
          feedBody: onlyFirst,
        }),
        now: new Date('2026-07-11T00:00:00Z'),
      },
      SOURCE,
    );
    expect(stats).toMatchObject({
      discovered: 1,
      updated: 1,
      expired: 1,
    });
    expect(listings.get('src1::1002')?.status).toBe('REMOVED');
    expect(listings.get('src1::1001')?.status).toBe('ACTIVE');
  });

  it('does NOT expire on a transient empty feed', async () => {
    const { prisma, listings } = makePrisma();
    await processSource(
      {
        prisma,
        fetchImpl: makeFetch({
          feedBody: FIXTURE,
        }),
        now: new Date('2026-07-10T00:00:00Z'),
      },
      SOURCE,
    );
    const stats = await processSource(
      {
        prisma,
        fetchImpl: makeFetch({
          feedBody: '<rdf:RDF></rdf:RDF>',
        }),
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
          robots: {
            status: 200,
            body: 'User-agent: *\nDisallow: /',
          },
        }),
        now: new Date('2026-07-10T00:00:00Z'),
      },
      SOURCE,
    );
    expect(stats.blocked).toBe(true);
    expect(stats.errored).toBe(true);
    expect(listings.size).toBe(0);
    expect(sourceUpdates.at(-1)).toMatchObject({
      status: 'BLOCKED',
    });
  });

  describe('price changes', () => {
    const run = (prisma: ProcessPrisma, feedBody: string, day: string) =>
      processSource({ prisma, fetchImpl: makeFetch({ feedBody }), now: new Date(`2026-07-${day}T00:00:00Z`) }, SOURCE);

    it('reads the stored rows once per batch and records nothing on the first run or an unchanged re-run', async () => {
      const { prisma, calls, priceChanges, dropStamps } = makePrisma();
      await run(prisma, FIXTURE, '10');
      expect(calls.findMany).toBe(1);
      const stats = await run(prisma, FIXTURE, '11');
      expect(calls.findMany).toBe(2);
      expect(priceChanges).toEqual([]);
      expect(dropStamps).toEqual([]);
      expect(stats.priceDrops).toEqual([]);
    });

    it('records a drop for the changed listing only, stamps it and reports it', async () => {
      const { prisma, priceChanges, dropStamps } = makePrisma();
      await run(prisma, FIXTURE, '10');
      const stats = await run(prisma, FIXTURE.replace('$1,850', '$1,700'), '11');
      expect(priceChanges).toEqual([
        {
          listingId: 'L-1001',
          oldCents: 185000,
          newCents: 170000,
          source: 'feed',
          changedAt: new Date('2026-07-11T00:00:00Z'),
        },
      ]);
      expect(dropStamps).toHaveLength(1);
      expect(dropStamps[0]).toMatchObject({
        where: { id: { in: ['L-1001'] } },
        data: { priceDroppedAt: new Date('2026-07-11T00:00:00Z') },
      });
      expect(stats.priceDrops).toMatchObject([{ listingId: 'L-1001', oldCents: 185000, newCents: 170000 }]);
    });

    it('records a rise but neither stamps nor reports it, and ignores a drop under 1%', async () => {
      const { prisma, priceChanges, dropStamps } = makePrisma();
      await run(prisma, FIXTURE, '10');
      const rise = await run(prisma, FIXTURE.replace('$1,850', '$1,900'), '11');
      expect(priceChanges).toHaveLength(1);
      expect(dropStamps).toEqual([]);
      expect(rise.priceDrops).toEqual([]);
      // 1,900 to 1,890 is a 0.5% drop: recorded, not a drop.
      const small = await run(prisma, FIXTURE.replace('$1,850', '$1,890'), '12');
      expect(priceChanges).toHaveLength(2);
      expect(dropStamps).toEqual([]);
      expect(small.priceDrops).toEqual([]);
    });
  });
});

describe('a pause outlives a run in flight', () => {
  const NOW = new Date('2026-07-10T00:00:00Z');

  it('writes the status conditionally: a source that is not DISABLED gets the outcome', async () => {
    const { prisma, source } = makePrisma('ERROR');
    await processSource({ prisma, fetchImpl: makeFetch({ feedBody: FIXTURE }), now: NOW }, SOURCE);
    expect(source).toMatchObject({ status: 'ACTIVE', lastError: null, lastSuccessAt: NOW });
  });

  it('leaves a DISABLED source disabled after a good run, and still stamps its run times', async () => {
    const { prisma, source } = makePrisma('DISABLED');
    await processSource({ prisma, fetchImpl: makeFetch({ feedBody: FIXTURE }), now: NOW }, SOURCE);
    expect(source.status).toBe('DISABLED');
    expect(source).toMatchObject({ lastRunAt: NOW, lastSuccessAt: NOW });
  });

  it('keeps a pause made while the feed was being fetched (the end-of-run write does not undo it)', async () => {
    const { prisma, source } = makePrisma('ACTIVE');
    const inner = makeFetch({ feedBody: FIXTURE });
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      // The admin pauses the source while its feed is in flight.
      if (String(input) === FEED_URL) source.status = 'DISABLED';
      return inner(input, init);
    }) as typeof fetch;
    await processSource({ prisma, fetchImpl, now: NOW }, SOURCE);
    expect(source.status).toBe('DISABLED');
  });

  it('does not turn a DISABLED source into ERROR or BLOCKED, and keeps its last error', async () => {
    const errored = makePrisma('DISABLED');
    errored.source.lastError = 'older problem';
    errored.prisma.homeListing.findMany = async () => {
      throw new Error('database exploded');
    };
    const stats = await processSource(
      { prisma: errored.prisma, fetchImpl: makeFetch({ feedBody: FIXTURE }), now: NOW },
      SOURCE,
    );
    expect(stats.errored).toBe(true);
    expect(errored.source).toMatchObject({ status: 'DISABLED', lastError: 'older problem' });

    const blocked = makePrisma('DISABLED');
    const robots = (async (input: RequestInfo | URL) =>
      String(input) === ROBOTS_URL
        ? new Response('User-agent: *\nDisallow: /', { status: 200 })
        : new Response('', { status: 404 })) as typeof fetch;
    await processSource({ prisma: blocked.prisma, fetchImpl: robots, now: NOW }, SOURCE);
    expect(blocked.source.status).toBe('DISABLED');
  });
});
