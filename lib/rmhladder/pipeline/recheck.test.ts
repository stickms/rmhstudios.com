import { describe, expect, it } from 'vitest';
import { circuitBreaker, decideRecheck, recheckSource } from './recheck';
import type { RecheckPrismaLike } from './recheck';

// ── decideRecheck ─────────────────────────────────────────────────────────────

describe('decideRecheck', () => {
  it('returns skip when fetchSucceeded is false, regardless of other params', () => {
    expect(decideRecheck({ fetchSucceeded: false, presentOnBoard: false, failedCheckCount: 0 }).action).toBe('skip');
    expect(decideRecheck({ fetchSucceeded: false, presentOnBoard: true, failedCheckCount: 5 }).action).toBe('skip');
    expect(decideRecheck({ fetchSucceeded: false, presentOnBoard: false, failedCheckCount: 2 }).action).toBe('skip');
  });

  it('returns reset when job is present on board (fetch succeeded)', () => {
    expect(decideRecheck({ fetchSucceeded: true, presentOnBoard: true, failedCheckCount: 0 }).action).toBe('reset');
    expect(decideRecheck({ fetchSucceeded: true, presentOnBoard: true, failedCheckCount: 5 }).action).toBe('reset');
  });

  it('returns strike when absent and failedCheckCount+1 < 3', () => {
    expect(decideRecheck({ fetchSucceeded: true, presentOnBoard: false, failedCheckCount: 0 }).action).toBe('strike');
    expect(decideRecheck({ fetchSucceeded: true, presentOnBoard: false, failedCheckCount: 1 }).action).toBe('strike');
  });

  it('returns expire when absent and failedCheckCount+1 >= 3 (boundary: failedCheckCount 2)', () => {
    expect(decideRecheck({ fetchSucceeded: true, presentOnBoard: false, failedCheckCount: 2 }).action).toBe('expire');
    expect(decideRecheck({ fetchSucceeded: true, presentOnBoard: false, failedCheckCount: 5 }).action).toBe('expire');
  });
});

// ── circuitBreaker ────────────────────────────────────────────────────────────

describe('circuitBreaker', () => {
  it('never trips with fewer than 4 active decisions', () => {
    expect(circuitBreaker({ activeCount: 3, wouldStrikeOrExpire: 3 })).toBe(false);
    expect(circuitBreaker({ activeCount: 0, wouldStrikeOrExpire: 0 })).toBe(false);
    expect(circuitBreaker({ activeCount: 1, wouldStrikeOrExpire: 1 })).toBe(false);
  });

  it('does not trip when ratio is exactly 50%', () => {
    expect(circuitBreaker({ activeCount: 4, wouldStrikeOrExpire: 2 })).toBe(false);
    expect(circuitBreaker({ activeCount: 6, wouldStrikeOrExpire: 3 })).toBe(false);
  });

  it('trips when activeCount >= 4 and wouldStrikeOrExpire / activeCount > 0.5', () => {
    expect(circuitBreaker({ activeCount: 4, wouldStrikeOrExpire: 3 })).toBe(true);
    expect(circuitBreaker({ activeCount: 5, wouldStrikeOrExpire: 4 })).toBe(true);
    expect(circuitBreaker({ activeCount: 10, wouldStrikeOrExpire: 6 })).toBe(true);
  });
});

// ── recheckSource helpers ─────────────────────────────────────────────────────

type AnyRow = Record<string, unknown>;

function makeFakePrisma(): RecheckPrismaLike & {
  _state: {
    jobUpdates: AnyRow[];
    verifications: AnyRow[];
    reviewTasks: AnyRow[];
    sourceUpdate: AnyRow | null;
  };
} {
  const jobUpdates: AnyRow[] = [];
  const verifications: AnyRow[] = [];
  const reviewTasks: AnyRow[] = [];
  let sourceUpdate: AnyRow | null = null;
  let rtSeq = 0;

  return {
    ladderJob: {
      async update({ where, data }) {
        jobUpdates.push({ id: where.id, ...data });
        return { id: where.id };
      },
    },
    ladderVerification: {
      async create({ data }) {
        verifications.push({ ...data });
        return { id: `v${verifications.length}` };
      },
    },
    ladderReviewTask: {
      async findFirst({ where }) {
        const found = reviewTasks.find((t) =>
          Object.entries(where).every(([k, v]) => t[k] === v),
        );
        return found ? { id: found['id'] as string } : null;
      },
      async create({ data }) {
        const task: AnyRow = { ...data, id: `rt${++rtSeq}` };
        reviewTasks.push(task);
        return { id: task['id'] as string };
      },
    },
    ladderSource: {
      async update({ where, data }) {
        sourceUpdate = { id: where.id, ...data };
        return { id: where.id };
      },
    },
    _state: {
      jobUpdates,
      verifications,
      reviewTasks,
      get sourceUpdate() {
        return sourceUpdate;
      },
    },
  };
}

/**
 * Returns a fake fetch that serves a greenhouse-format board response for any
 * boards-api.greenhouse.io URL. The `presentIds` array controls which job ids
 * appear in the board (externalId = String(numericId)).
 */
function makeGreenhouseFetch(presentIds: string[]): typeof fetch {
  return async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url.includes('boards-api.greenhouse.io')) {
      const jobs = presentIds.map((id) => ({
        id: Number(id),
        title: `Job ${id}`,
        location: { name: 'New York, NY' },
        absolute_url: `https://boards.greenhouse.io/testco/jobs/${id}`,
      }));
      return new Response(JSON.stringify({ jobs }), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };
}

const BASE_SOURCE = {
  id: 's1',
  platform: 'greenhouse' as const,
  slug: 'testco',
  company: { name: 'Test Co' },
};

// ── recheckSource tests ───────────────────────────────────────────────────────

describe('recheckSource', () => {
  it('normal mix: resets present jobs, strikes / expires absent jobs, skips null-externalId', async () => {
    const prisma = makeFakePrisma();
    const activeJobs = [
      { id: 'j1', externalId: '111', failedCheckCount: 0 },  // present → reset
      { id: 'j2', externalId: '222', failedCheckCount: 2 },  // absent → expire (2+1=3)
      { id: 'j3', externalId: '333', failedCheckCount: 1 },  // present → reset
      { id: 'j4', externalId: '444', failedCheckCount: 0 },  // absent → strike (0+1=1)
      { id: 'j5', externalId: null, failedCheckCount: 0 },   // null → skip
    ];

    // Board returns 111 and 333; 222 and 444 are absent
    const result = await recheckSource(
      { prisma, fetchImpl: makeGreenhouseFetch(['111', '333']), now: new Date('2026-07-01') },
      BASE_SOURCE,
      activeJobs,
    );

    expect(result).toEqual({ reset: 2, struck: 1, expired: 1, skipped: 1, tripped: false });

    // j1 reset: failedCheckCount=0, lastCheckedAt set
    const j1Update = prisma._state.jobUpdates.find((u) => u['id'] === 'j1');
    expect(j1Update).toMatchObject({ failedCheckCount: 0, lastCheckedAt: new Date('2026-07-01') });

    // j2 expired: status='expired', failedCheckCount=3, verification row created
    const j2Update = prisma._state.jobUpdates.find((u) => u['id'] === 'j2');
    expect(j2Update).toMatchObject({ status: 'expired', failedCheckCount: 3 });
    expect(prisma._state.verifications).toHaveLength(1);
    expect(prisma._state.verifications[0]).toMatchObject({
      jobId: 'j2',
      status: 'expired',
      confidence: 90,
      evidence: '3 consecutive checks found the posting absent from the greenhouse board.',
    });

    // j4 struck: failedCheckCount=1, lastCheckedAt set
    const j4Update = prisma._state.jobUpdates.find((u) => u['id'] === 'j4');
    expect(j4Update).toMatchObject({ failedCheckCount: 1, lastCheckedAt: new Date('2026-07-01') });

    // j5 skipped: no update
    expect(prisma._state.jobUpdates.find((u) => u['id'] === 'j5')).toBeUndefined();
  });

  it('trip scenario: 5 active jobs, 4 absent → circuit trips, zero job updates, source errored, review task created', async () => {
    const prisma = makeFakePrisma();
    const activeJobs = [
      { id: 'j1', externalId: '1', failedCheckCount: 0 }, // present → reset
      { id: 'j2', externalId: '2', failedCheckCount: 0 }, // absent → strike
      { id: 'j3', externalId: '3', failedCheckCount: 0 }, // absent → strike
      { id: 'j4', externalId: '4', failedCheckCount: 0 }, // absent → strike
      { id: 'j5', externalId: '5', failedCheckCount: 0 }, // absent → strike
    ];
    // activeCount=5, wouldStrikeOrExpire=4 → 4/5=80% > 50% AND 5>=4 → trip

    const result = await recheckSource(
      { prisma, fetchImpl: makeGreenhouseFetch(['1']), now: new Date('2026-07-01') },
      BASE_SOURCE,
      activeJobs,
    );

    expect(result).toEqual({ reset: 0, struck: 0, expired: 0, skipped: 5, tripped: true });
    expect(prisma._state.jobUpdates).toHaveLength(0);
    expect(prisma._state.verifications).toHaveLength(0);
    expect(prisma._state.sourceUpdate).toMatchObject({ id: 's1', status: 'error' });
    expect(prisma._state.reviewTasks).toHaveLength(1);
    expect(prisma._state.reviewTasks[0]).toMatchObject({
      sourceId: 's1',
      reason: 'mass_expiry_suspected',
      status: 'open',
      jobId: null,
    });
  });

  it('trip scenario re-run: does NOT create a duplicate review task', async () => {
    const prisma = makeFakePrisma();
    // Pre-seed an existing open task for this source
    await prisma.ladderReviewTask.create({
      data: { sourceId: 's1', reason: 'mass_expiry_suspected', status: 'open', jobId: null },
    });

    const activeJobs = [
      { id: 'j1', externalId: '1', failedCheckCount: 0 },
      { id: 'j2', externalId: '2', failedCheckCount: 0 },
      { id: 'j3', externalId: '3', failedCheckCount: 0 },
      { id: 'j4', externalId: '4', failedCheckCount: 0 },
      { id: 'j5', externalId: '5', failedCheckCount: 0 },
    ];

    await recheckSource(
      { prisma, fetchImpl: makeGreenhouseFetch(['1']), now: new Date('2026-07-01') },
      BASE_SOURCE,
      activeJobs,
    );

    // Still only 1 task (the pre-seeded one, no duplicate)
    expect(prisma._state.reviewTasks).toHaveLength(1);
  });

  it('all null externalId → all skipped, no DB writes', async () => {
    const prisma = makeFakePrisma();
    const activeJobs = [
      { id: 'j1', externalId: null, failedCheckCount: 0 },
      { id: 'j2', externalId: null, failedCheckCount: 2 },
    ];

    const result = await recheckSource(
      { prisma, fetchImpl: makeGreenhouseFetch(['111', '222']), now: new Date('2026-07-01') },
      BASE_SOURCE,
      activeJobs,
    );

    expect(result).toEqual({ reset: 0, struck: 0, expired: 0, skipped: 2, tripped: false });
    expect(prisma._state.jobUpdates).toHaveLength(0);
  });

  it('fetch failure (HTTP 500) → fetchSucceeded=false → all skipped, no strikes', async () => {
    const prisma = makeFakePrisma();
    const activeJobs = [
      { id: 'j1', externalId: '111', failedCheckCount: 2 }, // would expire if fetchSucceeded
      { id: 'j2', externalId: '222', failedCheckCount: 0 },
    ];

    // HTTP 500 → fetchSucceeded=false → all skipped
    const failFetch: typeof fetch = async () => new Response('error', { status: 500 });
    const result = await recheckSource(
      { prisma, fetchImpl: failFetch, now: new Date('2026-07-01') },
      BASE_SOURCE,
      activeJobs,
    );

    expect(result).toEqual({ reset: 0, struck: 0, expired: 0, skipped: 2, tripped: false });
    expect(prisma._state.jobUpdates).toHaveLength(0);
  });

  it('successful empty board (HTTP 200, jobs=[]) → fetchSucceeded=true → absent jobs get struck/expired', async () => {
    const prisma = makeFakePrisma();
    const activeJobs = [
      { id: 'j1', externalId: '111', failedCheckCount: 2 }, // absent → expire (2+1=3)
      { id: 'j2', externalId: '222', failedCheckCount: 0 }, // absent → strike
    ];

    // Empty board → fetchSucceeded=true, jobs genuinely absent
    const result = await recheckSource(
      { prisma, fetchImpl: makeGreenhouseFetch([]), now: new Date('2026-07-01') },
      BASE_SOURCE,
      activeJobs,
    );

    expect(result.struck).toBe(1);
    expect(result.expired).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.tripped).toBe(false);
  });

  it('unknown platform → all skipped, no DB writes', async () => {
    const prisma = makeFakePrisma();
    const activeJobs = [{ id: 'j1', externalId: '111', failedCheckCount: 0 }];

    const result = await recheckSource(
      { prisma, fetchImpl: makeGreenhouseFetch(['111']), now: new Date('2026-07-01') },
      { ...BASE_SOURCE, platform: 'unknown_platform' },
      activeJobs,
    );

    expect(result).toEqual({ reset: 0, struck: 0, expired: 0, skipped: 1, tripped: false });
    expect(prisma._state.jobUpdates).toHaveLength(0);
  });

  it('null slug → all skipped, no DB writes', async () => {
    const prisma = makeFakePrisma();
    const activeJobs = [{ id: 'j1', externalId: '111', failedCheckCount: 0 }];

    const result = await recheckSource(
      { prisma, fetchImpl: makeGreenhouseFetch(['111']), now: new Date('2026-07-01') },
      { ...BASE_SOURCE, slug: null },
      activeJobs,
    );

    expect(result).toEqual({ reset: 0, struck: 0, expired: 0, skipped: 1, tripped: false });
    expect(prisma._state.jobUpdates).toHaveLength(0);
  });
});
