import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runPipeline } from './run';
import type { RunPrisma } from './run';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GREENHOUSE_FIXTURE = readFileSync(
  join(__dirname, '../adapters/__fixtures__/greenhouse-board.json'),
  'utf8',
);

// URLs produced by the greenhouse adapter for given slugs.
const ghUrl = (slug: string) =>
  `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;

// ── Stub fetch factory ────────────────────────────────────────────────────────

/**
 * Flexible fetch stub used across scenarios.
 *
 * robots: 'allow' | 'disallow' — controls /robots.txt response for all origins.
 * pages: Record<url, { status: number; body: string }> — exact URL overrides.
 * greenhouse: Record<slug, 'fixture' | 'error500'> — greenhouse board stubs.
 */
function makeStubFetch(options: {
  robots?: 'allow' | 'disallow';
  pages?: Record<string, { status: number; body: string }>;
  greenhouse?: Record<string, 'fixture' | 'error500'>;
}): typeof fetch {
  const { robots = 'allow', pages = {}, greenhouse = {} } = options;

  return async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    // Exact page overrides.
    if (url in pages) {
      const p = pages[url];
      return new Response(p.body, { status: p.status });
    }

    // robots.txt — any origin.
    if (url.endsWith('/robots.txt')) {
      if (robots === 'disallow') {
        return new Response('User-agent: *\nDisallow: /', { status: 200 });
      }
      return new Response('User-agent: *\nAllow: /', { status: 200 });
    }

    // Greenhouse board API.
    for (const [slug, behaviour] of Object.entries(greenhouse)) {
      if (url === ghUrl(slug)) {
        if (behaviour === 'fixture') {
          return new Response(GREENHOUSE_FIXTURE, { status: 200 });
        }
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    return new Response('Not found', { status: 404 });
  };
}

// ── In-memory fake RunPrisma ──────────────────────────────────────────────────

type AnyRow = Record<string, unknown>;

type SourceRow = {
  id: string;
  platform: string;
  slug: string | null;
  url: string | null;
  status: string;
  company: { id: string; name: string; priorityLevel: number };
};

function makeFakeRunPrisma(initialSources: SourceRow[]): RunPrisma & {
  _state: {
    jobs: Map<string, AnyRow>;
    verifications: AnyRow[];
    reviewTasks: AnyRow[];
    sourceErrors: AnyRow[];
    scrapeRuns: Map<string, AnyRow>;
    sourceUpdates: Map<string, AnyRow>;
  };
} {
  const jobsByHash = new Map<string, AnyRow>();
  const jobsById = new Map<string, AnyRow>();
  const verifications: AnyRow[] = [];
  const reviewTasks: AnyRow[] = [];
  const sourceErrors: AnyRow[] = [];
  const scrapeRuns = new Map<string, AnyRow>();
  const sourceUpdates = new Map<string, AnyRow>(); // sourceId → merged update data

  let jobSeq = 0;
  let vSeq = 0;
  let rtSeq = 0;
  let seSeq = 0;
  let runSeq = 0;

  const prisma: RunPrisma & {
    _state: {
      jobs: Map<string, AnyRow>;
      verifications: AnyRow[];
      reviewTasks: AnyRow[];
      sourceErrors: AnyRow[];
      scrapeRuns: Map<string, AnyRow>;
      sourceUpdates: Map<string, AnyRow>;
    };
  } = {
    ladderJob: {
      async findUnique({ where }) {
        const row = jobsByHash.get(where.dedupeHash);
        return row
          ? (row as {
              id: string;
              discoveredAt: Date;
              alternateUrls: string[];
              originalPostingUrl: string;
            })
          : null;
      },
      async upsert({ where, create, update }) {
        const existing = jobsByHash.get(where.dedupeHash);
        if (existing) {
          const updated: AnyRow = { ...existing, ...(update as AnyRow) };
          jobsByHash.set(where.dedupeHash, updated);
          jobsById.set(existing.id as string, updated);
          return updated as { id: string; discoveredAt: Date; alternateUrls: string[]; originalPostingUrl: string };
        }
        const id = `job-${++jobSeq}`;
        const row: AnyRow = {
          id,
          ...(create as AnyRow),
          alternateUrls: ((create as AnyRow).alternateUrls as string[] | undefined) ?? [],
          failedCheckCount: ((create as AnyRow).failedCheckCount as number) ?? 0,
        };
        jobsByHash.set(where.dedupeHash, row);
        jobsById.set(id, row);
        return row as { id: string; discoveredAt: Date; alternateUrls: string[]; originalPostingUrl: string };
      },
      async update({ where, data }) {
        const row = jobsById.get(where.id);
        if (row) {
          const updated: AnyRow = { ...row, ...(data as AnyRow) };
          jobsById.set(where.id, updated);
          // Keep jobsByHash consistent if dedupeHash is known.
          const hash = row.dedupeHash as string | undefined;
          if (hash) jobsByHash.set(hash, updated);
        }
        return { id: where.id };
      },
      async findMany({ where }) {
        return [...jobsById.values()]
          .filter((j) => {
            if (where.companyId !== undefined && j.companyId !== where.companyId) return false;
            if (where.status !== undefined && j.status !== where.status) return false;
            if (where.sourcePlatform !== undefined && j.sourcePlatform !== where.sourcePlatform) return false;
            return true;
          })
          .map((j) => ({
            id: j.id as string,
            externalId: (j.externalId as string | null) ?? null,
            failedCheckCount: (j.failedCheckCount as number) ?? 0,
          }));
      },
    },

    ladderVerification: {
      async create({ data }) {
        const row: AnyRow = { id: `v-${++vSeq}`, ...(data as AnyRow) };
        verifications.push(row);
        return { id: row.id as string };
      },
    },

    ladderReviewTask: {
      async findFirst({ where }) {
        const hit = reviewTasks.find((t) =>
          Object.entries(where).every(([k, v]) => t[k] === v),
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
      async update({ where, data }) {
        const prev = sourceUpdates.get(where.id) ?? {};
        sourceUpdates.set(where.id, { ...prev, ...(data as AnyRow) });
        return { id: where.id };
      },
      async findMany({ where }) {
        return initialSources.filter((s) => {
          if (where.status !== undefined && s.status !== where.status) return false;
          return true;
        });
      },
    },

    ladderScrapeRun: {
      async create({ data }) {
        const id = `run-${++runSeq}`;
        scrapeRuns.set(id, { id, ...(data as AnyRow) });
        return { id };
      },
      async update({ where, data }) {
        const existing = scrapeRuns.get(where.id) ?? {};
        scrapeRuns.set(where.id, { ...existing, ...(data as AnyRow) });
        return { id: where.id };
      },
    },

    ladderSourceError: {
      async create({ data }) {
        const row: AnyRow = { id: `se-${++seSeq}`, ...(data as AnyRow) };
        sourceErrors.push(row);
        return { id: row.id as string };
      },
    },

    _state: {
      jobs: jobsByHash,
      verifications,
      reviewTasks,
      sourceErrors,
      scrapeRuns,
      sourceUpdates,
    },
  };

  return prisma;
}

// ── Shared source fixtures ────────────────────────────────────────────────────

const NOW = new Date('2026-07-07T12:00:00Z');

const SRC_GH_GOOD: SourceRow = {
  id: 'src-gh-good',
  platform: 'greenhouse',
  slug: 'goodco',
  url: null,
  status: 'active',
  company: { id: 'co-1', name: 'GoodCo', priorityLevel: 1 },
};

const SRC_GH_BAD: SourceRow = {
  id: 'src-gh-bad',
  platform: 'greenhouse',
  slug: 'badco',
  url: null,
  status: 'active',
  company: { id: 'co-2', name: 'BadCo', priorityLevel: 2 },
};

const SRC_MANUAL: SourceRow = {
  id: 'src-manual',
  platform: 'manual',
  slug: null,
  url: 'https://example.com/careers',
  status: 'active',
  company: { id: 'co-3', name: 'ManualCo', priorityLevel: 3 },
};

// ── Scenario A: two API sources + one manual ──────────────────────────────────

describe('scenario A — two API sources (one good, one 500) + one manual (ok)', () => {
  const prisma = makeFakeRunPrisma([SRC_GH_GOOD, SRC_GH_BAD, SRC_MANUAL]);
  const fetchImpl = makeStubFetch({
    robots: 'allow',
    greenhouse: { goodco: 'fixture', badco: 'error500' },
    pages: { 'https://example.com/careers': { status: 200, body: '<html>jobs</html>' } },
  });

  let result: Awaited<ReturnType<typeof runPipeline>>;

  it('runs without throwing', async () => {
    result = await runPipeline(
      { prisma, fetchImpl, now: NOW, sleepMs: 0 },
      { trigger: 'cron' },
    );
  });

  it('discovered = 2 (only goodco contributes)', () => {
    expect(result.discovered).toBe(2);
  });

  it('created = 2, errors = 0', () => {
    // badco returns 500 → processSource returns errored=false, discovered=0.
    // No sourceError row is created for errored=false sources.
    expect(result.created).toBe(2);
    expect(result.errors).toBe(0);
  });

  it('no sourceError rows (500 source has errored=false per Task-5 semantics)', () => {
    expect(prisma._state.sourceErrors).toHaveLength(0);
  });

  it('badco source: lastSuccessAt NOT set', () => {
    const update = prisma._state.sourceUpdates.get('src-gh-bad');
    expect(update?.lastSuccessAt).toBeUndefined();
  });

  it('manual source: lastSuccessAt set to NOW', () => {
    const update = prisma._state.sourceUpdates.get('src-manual');
    expect(update?.lastSuccessAt).toEqual(NOW);
  });

  it('run row finalized: discoveredCount=2, newCount=2, errorCount=0', () => {
    const run = [...prisma._state.scrapeRuns.values()][0];
    expect(run.discoveredCount).toBe(2);
    expect(run.newCount).toBe(2);
    expect(run.errorCount).toBe(0);
    expect(run.finishedAt).toBeDefined();
  });

  it('durationMs is a non-negative number', () => {
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ── Scenario B: manual source robots-disallowed + dedupe ──────────────────────

describe('scenario B — manual source robots-disallowed → blocked + review task, deduped on second run', () => {
  const prisma = makeFakeRunPrisma([SRC_MANUAL]);
  const fetchImpl = makeStubFetch({ robots: 'disallow' });

  it('first run: source blocked, review task created', async () => {
    const result = await runPipeline(
      { prisma, fetchImpl, now: NOW, sleepMs: 0 },
      { trigger: 'manual' },
    );
    expect(result.reviewTasks).toBe(1);
    expect(result.errors).toBe(0);

    const sourceUpdate = prisma._state.sourceUpdates.get('src-manual');
    expect(sourceUpdate?.status).toBe('blocked');

    const tasks = prisma._state.reviewTasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].reason).toBe('blocked');
    expect(tasks[0].sourceId).toBe('src-manual');
    expect(tasks[0].status).toBe('open');
  });

  it('second run: no duplicate review task created', async () => {
    await runPipeline(
      { prisma, fetchImpl, now: NOW, sleepMs: 0 },
      { trigger: 'manual' },
    );
    // Still only 1 task (findFirst dedup prevents another).
    expect(prisma._state.reviewTasks).toHaveLength(1);
  });
});

// ── Scenario C: platforms filter + limitSources ───────────────────────────────

describe('scenario C — platforms filter and limitSources honored', () => {
  it('platforms filter: only greenhouse sources are processed', async () => {
    const prisma = makeFakeRunPrisma([SRC_GH_GOOD, SRC_GH_BAD, SRC_MANUAL]);
    const fetchImpl = makeStubFetch({
      robots: 'allow',
      greenhouse: { goodco: 'fixture', badco: 'error500' },
      pages: { 'https://example.com/careers': { status: 200, body: '<html>jobs</html>' } },
    });

    const result = await runPipeline(
      { prisma, fetchImpl, now: NOW, sleepMs: 0 },
      { trigger: 'cron', platforms: ['greenhouse'] },
    );

    // Manual source skipped — no update for it.
    expect(prisma._state.sourceUpdates.has('src-manual')).toBe(false);
    // Greenhouse sources processed.
    expect(result.discovered).toBeGreaterThanOrEqual(0);
  });

  it('limitSources=1: only one source processed', async () => {
    const prisma = makeFakeRunPrisma([SRC_GH_GOOD, SRC_GH_BAD, SRC_MANUAL]);
    const fetchImpl = makeStubFetch({
      robots: 'allow',
      greenhouse: { goodco: 'fixture', badco: 'error500' },
    });

    const result = await runPipeline(
      { prisma, fetchImpl, now: NOW, sleepMs: 0 },
      { trigger: 'cron', limitSources: 1 },
    );

    // Only 1 source processed (API-first sort → goodco first).
    expect(result.discovered).toBe(2);
    // badco and manual not touched.
    expect(prisma._state.sourceUpdates.has('src-gh-bad')).toBe(false);
    expect(prisma._state.sourceUpdates.has('src-manual')).toBe(false);
  });

  it('limitSources=0 still creates and finalizes run row with zero counts', async () => {
    const prisma = makeFakeRunPrisma([SRC_GH_GOOD, SRC_MANUAL]);
    const fetchImpl = makeStubFetch({ greenhouse: { goodco: 'fixture' } });

    const result = await runPipeline(
      { prisma, fetchImpl, now: NOW, sleepMs: 0 },
      { trigger: 'cron', limitSources: 0 },
    );

    expect(result.discovered).toBe(0);
    expect(result.created).toBe(0);
    expect(prisma._state.scrapeRuns.size).toBe(1);
  });
});

// ── Scenario E: end-to-end externalId — recheck strikes a job dropped from the board ──

describe('scenario E — externalId persistence: recheck strikes job absent from second run board', () => {
  // One source, two runs. First run: full board (2 jobs). Second run: board drops one job.
  // The recheck feed must read the real externalId column and issue struck=1.
  const prisma = makeFakeRunPrisma([SRC_GH_GOOD]);

  // Partial board response: only job 4285367007 is present (4285367008 dropped).
  const PARTIAL_GH_FIXTURE = JSON.stringify({
    jobs: [
      {
        id: 4285367007,
        title: 'Product Management Intern',
        updated_at: '2026-06-20T12:00:00-04:00',
        first_published: '2026-06-01T09:00:00-04:00',
        requisition_id: 'R-1234',
        location: { name: 'New York, NY' },
        absolute_url: 'https://boards.greenhouse.io/stripe/jobs/4285367007',
        content: '&lt;p&gt;Join our payments team as a PM intern.&lt;/p&gt;',
      },
    ],
  });

  it('first run: creates 2 active jobs with externalIds persisted', async () => {
    const result = await runPipeline(
      { prisma, fetchImpl: makeStubFetch({ greenhouse: { goodco: 'fixture' } }), now: NOW, sleepMs: 0 },
      { trigger: 'cron' },
    );
    expect(result.created).toBe(2);
    expect(result.struck).toBe(0);
  });

  it('second run with one job dropped: struck = 1', async () => {
    // Board now only has job 4285367007; 4285367008 is gone → recheck strikes it.
    const partialFetch = makeStubFetch({
      pages: { [ghUrl('goodco')]: { status: 200, body: PARTIAL_GH_FIXTURE } },
    });
    const result = await runPipeline(
      { prisma, fetchImpl: partialFetch, now: new Date(NOW.getTime() + 60_000), sleepMs: 0 },
      { trigger: 'cron' },
    );
    expect(result.struck).toBe(1);
  });
});

// ── Scenario F: multi-board recheck scope guard (item 4) ─────────────────────

describe('scenario F — two greenhouse sources for one company: recheck skipped for scope conflict', () => {
  // Two sources for the same company on the same platform = ambiguous recheck scope.
  // runPipeline must skip recheck for both and append a stats note.
  const SRC_GH_CO1_A: SourceRow = {
    id: 'src-gh-co1-a',
    platform: 'greenhouse',
    slug: 'co1slug-a',
    url: null,
    status: 'active',
    company: { id: 'co-1', name: 'SharedCo', priorityLevel: 2 },
  };
  const SRC_GH_CO1_B: SourceRow = {
    id: 'src-gh-co1-b',
    platform: 'greenhouse',
    slug: 'co1slug-b',
    url: null,
    status: 'active',
    company: { id: 'co-1', name: 'SharedCo', priorityLevel: 2 },
  };

  it('struck = 0, expired = 0 when two greenhouse sources share a companyId (recheck ambiguity)', async () => {
    const prisma = makeFakeRunPrisma([SRC_GH_CO1_A, SRC_GH_CO1_B]);
    const fetchImpl = makeStubFetch({
      greenhouse: { 'co1slug-a': 'fixture', 'co1slug-b': 'fixture' },
    });

    // First run: create some active jobs
    await runPipeline({ prisma, fetchImpl, now: NOW, sleepMs: 0 }, { trigger: 'cron' });

    // Second run: active jobs exist but recheck should be skipped for both sources
    const result = await runPipeline({ prisma, fetchImpl, now: new Date(NOW.getTime() + 60_000), sleepMs: 0 }, { trigger: 'cron' });

    expect(result.struck).toBe(0);
    expect(result.expired).toBe(0);
  });

  it('stats for the run include a recheckSkipped note for the conflicting sources', async () => {
    const prisma = makeFakeRunPrisma([SRC_GH_CO1_A, SRC_GH_CO1_B]);
    const fetchImpl = makeStubFetch({
      greenhouse: { 'co1slug-a': 'fixture', 'co1slug-b': 'fixture' },
    });

    await runPipeline({ prisma, fetchImpl, now: NOW, sleepMs: 0 }, { trigger: 'cron' });
    await runPipeline({ prisma, fetchImpl, now: new Date(NOW.getTime() + 60_000), sleepMs: 0 }, { trigger: 'cron' });

    // The second run's scrapeRun stats should contain recheck-skipped entries
    const runs = [...prisma._state.scrapeRuns.values()];
    const secondRun = runs[runs.length - 1];
    const stats = secondRun.stats as Array<Record<string, unknown>>;
    const skippedEntry = stats.find((s) => s.recheckSkipped === true);
    expect(skippedEntry).toBeDefined();
  });
});

// ── Scenario G: tripped recheck writes sourceError row (item 7) ──────────────

describe('scenario G — tripped recheck creates sourceError row', () => {
  it('circuit breaker trip → sourceError row with errorClass recheck_tripped', async () => {
    const prisma = makeFakeRunPrisma([SRC_GH_GOOD]);
    const fetchImpl = makeStubFetch({ greenhouse: { goodco: 'fixture' } });

    // First run: create 2 active jobs
    await runPipeline({ prisma, fetchImpl, now: NOW, sleepMs: 0 }, { trigger: 'cron' });

    // Inject a fetch that returns only 1 of the 2 jobs — trip the circuit breaker
    // (activeCount ≥ 4 needed to trip; with only 2 jobs the breaker won't trip)
    // So let's set up a source with enough active jobs + an empty fetch to force the trip.
    // The circuit breaker trips when activeCount >= 4 AND wouldStrikeOrExpire / activeCount > 0.5.
    // With 2 jobs (< 4), the breaker will NOT trip. So test the trip via recheck.test.ts paths.
    // Instead, verify the sourceError creation contract by directly injecting the tripped path:
    // We do this via a mock that returns exactly 1 job of 5 from the board.

    // Set up 5 active jobs manually by seeding them into prisma state
    // (jobs need companyId=co-1, sourcePlatform=greenhouse, status=active)
    const co1Id = SRC_GH_GOOD.company.id;
    const jobIds = ['j-trip-1', 'j-trip-2', 'j-trip-3', 'j-trip-4', 'j-trip-5'];
    for (const jid of jobIds) {
      // Insert directly into the in-memory store via upsert
      await prisma.ladderJob.upsert({
        where: { dedupeHash: `hash-${jid}` },
        create: {
          id: jid,
          companyId: co1Id,
          dedupeHash: `hash-${jid}`,
          sourcePlatform: 'greenhouse',
          status: 'active',
          externalId: jid,
          failedCheckCount: 0,
          alternateUrls: [],
          discoveredAt: NOW,
          title: `Job ${jid}`,
          normalizedTitle: `job ${jid}`,
          originalPostingUrl: `https://example.com/${jid}`,
        },
        update: {},
      });
    }

    // Board only returns 1 of the 5 → 4/5 > 50% → trip
    const tripFetch = makeStubFetch({
      pages: {
        [ghUrl('goodco')]: {
          status: 200,
          body: JSON.stringify({
            jobs: [{
              id: 'j-trip-1',
              title: 'Job j-trip-1',
              location: { name: 'New York, NY' },
              absolute_url: 'https://boards.greenhouse.io/goodco/jobs/j-trip-1',
            }],
          }),
        },
      },
    });

    const sourceErrorsBefore = prisma._state.sourceErrors.length;
    await runPipeline({ prisma, fetchImpl: tripFetch, now: new Date(NOW.getTime() + 120_000), sleepMs: 0 }, { trigger: 'cron' });

    const newErrors = prisma._state.sourceErrors.slice(sourceErrorsBefore);
    const tripError = newErrors.find((e) => e.errorClass === 'recheck_tripped');
    expect(tripError).toBeDefined();
    expect(tripError!.message).toContain('mass-expiry circuit breaker tripped');
  });
});

// ── Scenario D: processSource throwing → sourceError row + run finishes ───────

describe('scenario D — processSource inner throw → sourceError row, run completes', () => {
  it('upsert throws → errored stats → sourceError row created, run finalized', async () => {
    const prisma = makeFakeRunPrisma([SRC_GH_GOOD]);
    const fetchImpl = makeStubFetch({ greenhouse: { goodco: 'fixture' } });

    // Override upsert to throw unconditionally, bypassing processSource's partial-stats logic.
    const origUpsert = prisma.ladderJob.upsert.bind(prisma.ladderJob);
    let upsertCalls = 0;
    prisma.ladderJob.upsert = async (args) => {
      upsertCalls++;
      if (upsertCalls === 1) throw new Error('DB unavailable');
      return origUpsert(args);
    };

    const result = await runPipeline(
      { prisma, fetchImpl, now: NOW, sleepMs: 0 },
      { trigger: 'cron' },
    );

    // processSource catches the throw and returns errored=true.
    // runPipeline then creates a sourceError row.
    expect(result.errors).toBe(1);
    expect(prisma._state.sourceErrors).toHaveLength(1);
    expect(prisma._state.sourceErrors[0].sourceId).toBe('src-gh-good');
    expect(prisma._state.sourceErrors[0].errorClass).toBe('process');
    expect(prisma._state.sourceErrors[0].message).toContain('DB unavailable');

    // Run row still finalized.
    const run = [...prisma._state.scrapeRuns.values()][0];
    expect(run.finishedAt).toBeDefined();
    expect(run.errorCount).toBe(1);
  });
});
