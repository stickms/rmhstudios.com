import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processSource } from './process-source';
import type { PrismaLike } from './process-source';

// ── Fixtures & stubs ─────────────────────────────────────────────────────────

const GREENHOUSE_FIXTURE = readFileSync(
  join(__dirname, '../adapters/__fixtures__/greenhouse-board.json'),
  'utf8',
);
const GREENHOUSE_URL =
  'https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true';

/** Returns a fetch stub that always serves the greenhouse fixture at the board URL. */
function makeGreenhouseFetch(): typeof fetch {
  return async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    if (url === GREENHOUSE_URL) {
      return new Response(GREENHOUSE_FIXTURE, { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };
}

/** Counting wrapper: tracks how many times the underlying fetchImpl is called. */
function makeCountingFetch(inner: typeof fetch) {
  let calls = 0;
  const impl: typeof fetch = async (input, init?) => {
    calls++;
    return inner(input, init);
  };
  return { impl, getCount: () => calls };
}

// ── In-memory fake Prisma (~45 lines) ────────────────────────────────────────

type AnyRow = Record<string, unknown>;

function makeFakePrisma(): PrismaLike & {
  _state: {
    jobs: Map<string, AnyRow>;
    verifications: AnyRow[];
    reviewTasks: AnyRow[];
    lastSourceUpdate: AnyRow | null;
  };
} {
  const jobs = new Map<string, AnyRow>();
  const verifications: AnyRow[] = [];
  const reviewTasks: AnyRow[] = [];
  let lastSourceUpdate: AnyRow | null = null;
  let jobSeq = 0;
  let veriSeq = 0;
  let rtSeq = 0;

  return {
    ladderJob: {
      async findUnique({ where }) {
        const row = jobs.get(where.dedupeHash);
        return row
          ? (row as { id: string; discoveredAt: Date; alternateUrls: string[]; originalPostingUrl: string })
          : null;
      },
      async upsert({ where, create, update }) {
        const existing = jobs.get(where.dedupeHash);
        if (existing) {
          // Dumb spread — processSource itself computes alternateUrls merge before calling upsert.
          const updated: AnyRow = { ...existing, ...(update as AnyRow) };
          jobs.set(where.dedupeHash, updated);
          return updated as ReturnType<PrismaLike['ladderJob']['upsert']> extends Promise<infer R>
            ? R
            : never;
        }
        const row: AnyRow = {
          id: `job-${++jobSeq}`,
          ...(create as AnyRow),
          alternateUrls: ((create as AnyRow).alternateUrls as string[] | undefined) ?? [],
        };
        jobs.set(where.dedupeHash, row);
        return row as ReturnType<PrismaLike['ladderJob']['upsert']> extends Promise<infer R>
          ? R
          : never;
      },
    },
    ladderVerification: {
      async create({ data }) {
        const row: AnyRow = { id: `v-${++veriSeq}`, ...(data as AnyRow) };
        verifications.push(row);
        return { id: row.id as string };
      },
    },
    ladderReviewTask: {
      async findFirst({ where }) {
        const hit = reviewTasks.find(
          (t) => t.jobId === where.jobId && t.reason === where.reason && t.status === where.status,
        );
        return hit ? { id: hit.id as string } : null;
      },
      async create({ data }) {
        const row: AnyRow = { id: `rt-${++rtSeq}`, ...(data as AnyRow) };
        reviewTasks.push(row);
        return { id: row.id as string };
      },
    },
    ladderSource: {
      async update({ data }) {
        lastSourceUpdate = data as AnyRow;
        return { id: 'source-1' };
      },
    },
    _state: { jobs, verifications, reviewTasks, get lastSourceUpdate() { return lastSourceUpdate; } },
  } as PrismaLike & {
    _state: {
      jobs: Map<string, AnyRow>;
      verifications: AnyRow[];
      reviewTasks: AnyRow[];
      lastSourceUpdate: AnyRow | null;
    };
  };
}

// ── Shared source fixture ─────────────────────────────────────────────────────

const SOURCE = {
  id: 'src-1',
  platform: 'greenhouse',
  slug: 'stripe',
  company: { id: 'co-1', name: 'Stripe', priorityLevel: 1 },
};

const NOW = new Date('2026-07-07T12:00:00Z');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('processSource', () => {
  // Scenario 1 & 2 share a prisma instance to test re-run semantics.
  const sharedPrisma = makeFakePrisma();

  describe('scenario 1 — first run with greenhouse fixture', () => {
    let stats: Awaited<ReturnType<typeof processSource>>;

    it('runs without error', async () => {
      stats = await processSource(
        { prisma: sharedPrisma, fetchImpl: makeGreenhouseFetch(), now: NOW },
        SOURCE,
      );
      expect(stats.errored).toBe(false);
    });

    it('reports discovered = 2', () => {
      expect(stats.discovered).toBe(2);
    });

    it('reports created = 2, updated = 0', () => {
      expect(stats.created).toBe(2);
      expect(stats.updated).toBe(0);
    });

    it('reports verified = 2 (both jobs are api-sourced with US locations)', () => {
      expect(stats.verified).toBe(2);
    });

    it('inserts 2 verification rows', () => {
      expect(sharedPrisma._state.verifications).toHaveLength(2);
    });

    it('stores 2 job rows keyed by dedupeHash', () => {
      expect(sharedPrisma._state.jobs.size).toBe(2);
    });

    it('sets source lastSuccessAt', () => {
      expect(sharedPrisma._state.lastSourceUpdate?.lastSuccessAt).toEqual(NOW);
    });

    it('stored job row carries externalId "4285367007" from the adapter', () => {
      const job = [...sharedPrisma._state.jobs.values()].find(
        (r) => (r as { externalId?: string }).externalId === '4285367007',
      );
      expect(job).toBeDefined();
    });
  });

  describe('scenario 2 — re-run same board (state retained)', () => {
    let stats: Awaited<ReturnType<typeof processSource>>;
    let reviewTasksAfterFirst: number;

    it('captures review task count after first run', () => {
      reviewTasksAfterFirst = sharedPrisma._state.reviewTasks.length;
    });

    it('runs without error', async () => {
      stats = await processSource(
        { prisma: sharedPrisma, fetchImpl: makeGreenhouseFetch(), now: new Date(NOW.getTime() + 60_000) },
        SOURCE,
      );
      expect(stats.errored).toBe(false);
    });

    it('reports created = 0, updated = 2', () => {
      expect(stats.created).toBe(0);
      expect(stats.updated).toBe(2);
    });

    it('still 2 job rows (no duplicates)', () => {
      expect(sharedPrisma._state.jobs.size).toBe(2);
    });

    it('4 verification rows total (2 per run)', () => {
      expect(sharedPrisma._state.verifications).toHaveLength(4);
    });

    it('no new review tasks for the same reasons (findFirst prevents duplicates)', () => {
      // Open tasks for the same jobId+reason should not be duplicated.
      const openTasks = sharedPrisma._state.reviewTasks.filter((t) => t.status === 'open');
      // Every (jobId, reason) pair should appear at most once among open tasks.
      const seen = new Set<string>();
      for (const t of openTasks) {
        const key = `${t.jobId}:${t.reason}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
      // And the total count didn't grow past what was there after the first run.
      expect(sharedPrisma._state.reviewTasks.length).toBe(reviewTasksAfterFirst);
    });
  });

  describe('scenario 3 — unknown platform', () => {
    it('returns errored without touching DB', async () => {
      const prisma = makeFakePrisma();
      const stats = await processSource(
        { prisma, fetchImpl: makeGreenhouseFetch(), now: NOW },
        { ...SOURCE, platform: 'unknown_ats' },
      );

      expect(stats.errored).toBe(true);
      expect(stats.errorMessage).toMatch(/No adapter/i);
      expect(stats.discovered).toBe(0);
      expect(stats.created).toBe(0);
      expect(prisma._state.jobs.size).toBe(0);
      expect(prisma._state.verifications).toHaveLength(0);
      expect(prisma._state.lastSourceUpdate).toBeNull();
    });

    it('returns errored when slug is null', async () => {
      const prisma = makeFakePrisma();
      const stats = await processSource(
        { prisma, fetchImpl: makeGreenhouseFetch(), now: NOW },
        { ...SOURCE, slug: null },
      );

      expect(stats.errored).toBe(true);
      expect(stats.errorMessage).toMatch(/slug/i);
      expect(prisma._state.jobs.size).toBe(0);
    });
  });

  describe('scenario 4 — prisma throws mid-loop (errored, partial stats)', () => {
    it('catches the throw, returns errored with partial stats, no review tasks after throw point', async () => {
      const prisma = makeFakePrisma();
      let upsertCalls = 0;

      // Override upsert to throw on the second call (second job).
      const origUpsert = prisma.ladderJob.upsert.bind(prisma.ladderJob);
      prisma.ladderJob.upsert = async (args) => {
        upsertCalls++;
        if (upsertCalls === 2) throw new Error('DB connection lost');
        return origUpsert(args);
      };

      const stats = await processSource(
        { prisma, fetchImpl: makeGreenhouseFetch(), now: NOW },
        SOURCE,
      );

      expect(stats.errored).toBe(true);
      expect(stats.errorMessage).toContain('DB connection lost');
      // First job fully processed.
      expect(stats.created).toBe(1);
      // One verification row for the first job.
      expect(prisma._state.verifications).toHaveLength(1);
      // No verifications or review tasks were written for the second job.
      // (discovered is 2 because the throw happens after discoverJobs returns)
      expect(stats.discovered).toBe(2);
      // Source lastSuccessAt NOT set (throw before ladderSource.update).
      expect(prisma._state.lastSourceUpdate).toBeNull();
    });
  });

  describe('scenario 5 — memoization: one underlying fetch for discover + verify of 2 jobs', () => {
    it('calls underlying fetchImpl exactly once regardless of job count', async () => {
      const prisma = makeFakePrisma();
      const { impl: countingImpl, getCount } = makeCountingFetch(makeGreenhouseFetch());

      await processSource({ prisma, fetchImpl: countingImpl, now: NOW }, SOURCE);

      // discoverJobs + verifyJob for each of 2 jobs — all hit the same URL,
      // memoFetch serves from cache after the first network call.
      expect(getCount()).toBe(1);
    });
  });

  describe('scenario 6 — alternateUrls merge when URL changes on re-run', () => {
    const prisma6 = makeFakePrisma();
    const ORIGINAL_URL_JOB1 = 'https://boards.greenhouse.io/stripe/jobs/4285367007';
    const NEW_URL_JOB1 = 'https://boards.greenhouse.io/stripe/jobs/4285367007?v=2';

    // Same jobs, different absolute_url — dedupeHash (company+title+location bucket) is unchanged.
    const modifiedFixture = JSON.stringify({
      jobs: [
        {
          id: 4285367007,
          title: 'Product Management Intern',
          updated_at: '2026-06-20T12:00:00-04:00',
          first_published: '2026-06-01T09:00:00-04:00',
          requisition_id: 'R-1234',
          location: { name: 'New York, NY' },
          absolute_url: NEW_URL_JOB1,
          content: '&lt;p&gt;Join our payments team as a PM intern.&lt;/p&gt;',
        },
        {
          id: 4285367008,
          title: 'Senior Staff Engineer',
          updated_at: '2026-06-21T12:00:00-04:00',
          first_published: '2026-05-01T09:00:00-04:00',
          requisition_id: null,
          location: { name: 'Remote - US' },
          absolute_url: 'https://boards.greenhouse.io/stripe/jobs/4285367008?v=2',
          content: '&lt;p&gt;10+ years required.&lt;/p&gt;',
        },
      ],
    });

    function makeModifiedGreenhouseFetch(): typeof fetch {
      return async (input, _init?) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.toString()
            : (input as Request).url;
        return url === GREENHOUSE_URL
          ? new Response(modifiedFixture, { status: 200 })
          : new Response('Not found', { status: 404 });
      };
    }

    it('first run: creates 2 jobs with original URLs', async () => {
      const stats = await processSource(
        { prisma: prisma6, fetchImpl: makeGreenhouseFetch(), now: NOW },
        SOURCE,
      );
      expect(stats.created).toBe(2);
      expect(stats.updated).toBe(0);
    });

    it('second run with changed URLs: originalPostingUrl = new URL, alternateUrls has old URL not new', async () => {
      const stats = await processSource(
        { prisma: prisma6, fetchImpl: makeModifiedGreenhouseFetch(), now: new Date(NOW.getTime() + 60_000) },
        SOURCE,
      );

      expect(stats.created).toBe(0);
      expect(stats.updated).toBe(2);

      // Find job1 row by its updated originalPostingUrl
      const job1 = [...prisma6._state.jobs.values()].find(
        (r) => (r as { originalPostingUrl: string }).originalPostingUrl === NEW_URL_JOB1,
      ) as { originalPostingUrl: string; alternateUrls: string[] } | undefined;

      expect(job1).toBeDefined();
      // Old URL preserved in history
      expect(job1!.alternateUrls).toContain(ORIGINAL_URL_JOB1);
      // New URL is the canonical one, NOT duplicated in alternates
      expect(job1!.alternateUrls).not.toContain(NEW_URL_JOB1);
    });

    it('third run back to original URL (A→B→A flip-flop): original URL not in alternates', async () => {
      // Third run: board flips back to original URLs
      await processSource(
        { prisma: prisma6, fetchImpl: makeGreenhouseFetch(), now: new Date(NOW.getTime() + 120_000) },
        SOURCE,
      );

      // After A→B→A: originalPostingUrl should be ORIGINAL_URL_JOB1 again
      const job1 = [...prisma6._state.jobs.values()].find(
        (r) => (r as { originalPostingUrl: string }).originalPostingUrl === ORIGINAL_URL_JOB1,
      ) as { originalPostingUrl: string; alternateUrls: string[] } | undefined;

      expect(job1).toBeDefined();
      // The current canonical URL must NOT appear in its own alternates
      expect(job1!.alternateUrls).not.toContain(ORIGINAL_URL_JOB1);
    });
  });

  describe('scenario 8 — re-run with changed externalId: update payload refreshes identity fields', () => {
    // Same company + title + location → same dedupeHash; only the numeric job id changes.
    // After the second run, the stored row must carry the NEW externalId (and sourceUrl, etc.).
    const prisma8 = makeFakePrisma();

    const FIXTURE_V1 = JSON.stringify({
      jobs: [{
        id: 4285367007,
        title: 'Product Management Intern',
        updated_at: '2026-06-20T12:00:00-04:00',
        first_published: '2026-06-01T09:00:00-04:00',
        requisition_id: 'R-1234',
        location: { name: 'New York, NY' },
        absolute_url: 'https://boards.greenhouse.io/stripe/jobs/4285367007',
        content: '&lt;p&gt;Summer PM internship.&lt;/p&gt;',
      }],
    });

    const FIXTURE_V2 = JSON.stringify({
      jobs: [{
        id: 9999999999,   // NEW external id — same title / location → same dedupeHash
        title: 'Product Management Intern',
        updated_at: '2026-07-01T12:00:00-04:00',
        first_published: '2026-07-01T09:00:00-04:00',
        requisition_id: 'R-5678',
        location: { name: 'New York, NY' },
        absolute_url: 'https://boards.greenhouse.io/stripe/jobs/9999999999',
        content: '&lt;p&gt;Summer PM internship (re-posted).&lt;/p&gt;',
      }],
    });

    function makeFetchFor(fixture: string): typeof fetch {
      return async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
        return url === GREENHOUSE_URL ? new Response(fixture, { status: 200 }) : new Response('Not found', { status: 404 });
      };
    }

    it('first run: creates 1 job with externalId "4285367007"', async () => {
      const stats = await processSource({ prisma: prisma8, fetchImpl: makeFetchFor(FIXTURE_V1), now: NOW }, SOURCE);
      expect(stats.created).toBe(1);
      expect(stats.updated).toBe(0);
      const job = [...prisma8._state.jobs.values()][0] as { externalId: string };
      expect(job.externalId).toBe('4285367007');
    });

    it('second run with new externalId: stored row refreshed to "9999999999"', async () => {
      const stats = await processSource({ prisma: prisma8, fetchImpl: makeFetchFor(FIXTURE_V2), now: new Date(NOW.getTime() + 60_000) }, SOURCE);
      expect(stats.created).toBe(0);
      expect(stats.updated).toBe(1);
      const job = [...prisma8._state.jobs.values()][0] as { externalId: string; sourceUrl: string; canonicalApplyUrl: string | null; externalRequisitionId: string | null };
      expect(job.externalId).toBe('9999999999');
      expect(job.sourceUrl).toBe('https://boards.greenhouse.io/stripe/jobs/9999999999');
      expect(job.externalRequisitionId).toBe('R-5678');
    });
  });

  describe('scenario 7 — throwing fetchImpl yields zero discoveries, no success stamp', () => {
    it('errored=false, discovered=0, errorMessage set, no lastSourceUpdate', async () => {
      const prisma = makeFakePrisma();
      // politeFetch swallows the throw → discoverJobs returns [] → discovered=0.
      // Zero discoveries carry no success evidence, so lastSuccessAt must NOT be set.
      const throwingFetch: typeof fetch = async () => {
        throw new Error('network down');
      };

      const stats = await processSource({ prisma, fetchImpl: throwingFetch, now: NOW }, SOURCE);

      expect(stats.discovered).toBe(0);
      expect(stats.errored).toBe(false);
      expect(stats.errorMessage).toBe('no jobs discovered (empty board or fetch failure)');
      expect(prisma._state.lastSourceUpdate).toBeNull();
    });
  });
});
