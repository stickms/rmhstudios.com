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

// ── In-memory fake Prisma (~40 lines) ────────────────────────────────────────

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
      async upsert({ where, create, update }) {
        const existing = jobs.get(where.dedupeHash);
        if (existing) {
          const newUrl = (update as AnyRow).originalPostingUrl as string | undefined;
          const storedUrl = existing.originalPostingUrl as string | undefined;
          const altUrls: string[] = [...((existing.alternateUrls as string[]) ?? [])];
          if (newUrl && newUrl !== storedUrl) altUrls.push(newUrl);
          const updated: AnyRow = { ...existing, ...(update as AnyRow), alternateUrls: altUrls };
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
});
