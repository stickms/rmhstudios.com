/* eslint-disable @typescript-eslint/no-explicit-any -- structural fake rows */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

/**
 * Own jobs are private (sprint 13, feature 08). A member's own job and company are `ladder_job` / `ladder_company` rows
 * with an owner, so every reader of the SHARED catalogue must add `catalogJobWhere` / `catalogCompanyWhere`, and every
 * member-facing reader `ownerOrCatalogJobWhere`. Two halves:
 *
 *  1. a source scan: every file under lib/, app/, server/, features/ and scripts/ that reads `ladderJob` or
 *     `ladderCompany` is in exactly one of CATALOG_JOB_READ_PATHS, OWNER_JOB_READ_PATHS, OWN_JOB_EXEMPT_PATHS, and the
 *     listed files use the fragment their list promises (a sixth forgotten reader fails here instead of leaking);
 *  2. behaviour: against a fake that filters on `ownerId` the way Postgres does, another member's own job is absent
 *     from search, the sitemap, the Open Graph card, company lists, interview reports, matching and expiry, and the
 *     writes that take a `jobId` refuse it.
 */

const ROOT = path.resolve(__dirname, '../../..');

/* ── the fake database ───────────────────────────────────────────────────── */

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  jobs: [] as Row[],
  companies: [] as Row[],
  reports: [] as Row[],
  events: [] as Row[],
}));

const KNOWN = new Set(['ownerId', 'id', 'status', 'earlyCareerClassification', 'enabled', 'normalizedName']);

/** Enough of Prisma's `where` for the fragments: equality (null included), `in`, `OR`, `AND`. Unknown keys pass. */
function ok(row: Row, where: Row | undefined): boolean {
  return Object.entries(where ?? {}).every(([key, want]) => {
    if (key === 'OR') return (want as Row[]).some((w) => ok(row, w));
    if (key === 'AND') return (want as Row[]).every((w) => ok(row, w));
    if (!KNOWN.has(key)) return true;
    if (want && typeof want === 'object' && 'in' in want) return (want.in as unknown[]).includes(row[key]);
    return row[key] === want;
  });
}

const company = (id: string) => db.companies.find((c) => c.id === id);
const withJob = (job: Row) => ({
  ...job,
  company: company(job.companyId),
  verifications: [{ status: 'verified_active', checkedAt: new Date(), evidence: 'ok' }],
  actions: [],
  applications: [],
});

const fakePrisma = vi.hoisted(() => {
  const empty = new Proxy(
    {},
    {
      get: (_t, method: string) => async () =>
        method === 'findUnique' || method === 'findFirst' ? null : method === 'count' ? 0 : [],
    },
  );
  const overrides: Record<string, unknown> = {};
  const prisma = new Proxy(overrides, {
    get: (t, key: string) => (key in t ? t[key] : empty),
  });
  return { prisma, overrides };
});

function install(prisma: Record<string, unknown>) {
  Object.assign(fakePrisma.overrides, prisma);
}

const finders = {
  ladderJob: {
    findMany: async ({ where }: Row) => db.jobs.filter((j) => ok(j, where)).map(withJob),
    findUnique: async ({ where }: Row) => {
      const job = db.jobs.find((j) => ok(j, where));
      return job ? withJob(job) : null;
    },
    findFirst: async ({ where }: Row) => {
      const job = db.jobs.find((j) => ok(j, where));
      return job ? { id: job.id } : null;
    },
    count: async ({ where }: Row) => db.jobs.filter((j) => ok(j, where)).length,
  },
  ladderCompany: {
    findMany: async ({ where, include }: Row) =>
      db.companies
        .filter((c) => ok(c, where))
        .map((c) => ({
          ...c,
          sources: [],
          _count: include?._count
            ? { jobs: db.jobs.filter((j) => j.companyId === c.id && ok(j, include._count.select.jobs.where)).length }
            : undefined,
        })),
    findFirst: async ({ where }: Row) => db.companies.find((c) => ok(c, where)) ?? null,
    findUnique: async ({ where }: Row) => db.companies.find((c) => ok(c, where)) ?? null,
  },
};

vi.mock('@/lib/prisma.server', () => ({ prisma: fakePrisma.prisma }));
vi.mock('@/lib/redis.server', () => ({ redisEnabled: () => false }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/rate-limit.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit.server')>()),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/og/page-card.server', () => ({ renderPageCard: vi.fn(async () => Buffer.from('png')) }));
vi.mock('@/lib/storage/s3.server', () => ({ deleteObject: vi.fn(), getObject: vi.fn(), putObject: vi.fn() }));
vi.mock('@/lib/rmhladder/ai/provider.server', () => ({ configuredLadderAiProvider: vi.fn() }));
vi.mock('@/lib/rmhladder/ai/resume-review.server', () => ({ analyzeRedactedResume: vi.fn() }));
vi.mock('@/lib/rmhladder/resume/extract.server', () => ({ extractResumeText: vi.fn(), validateResumeFile: vi.fn() }));
vi.mock('@/lib/rmhladder/ai/job-profile.server', () => ({ ensureCachedJobProfile: vi.fn(async () => ({})) }));
vi.mock('@/lib/rmhladder/matching/score', () => ({
  scoreCandidateForJob: vi.fn(() => ({
    score: 80,
    confidence: 80,
    breakdown: {},
    matchedSkills: [],
    missingSkills: [],
    explanation: null,
  })),
}));

const catalogue = (over: Row = {}): Row => ({
  id: 'cat-job',
  ownerId: null,
  companyId: 'cat-co',
  title: 'Analyst intern',
  status: 'active',
  earlyCareerClassification: 'yes',
  programType: 'internship',
  relevanceScoreBase: 80,
  discoveredAt: new Date('2026-12-01T00:00:00Z'),
  lastSeenAt: new Date('2026-12-20T00:00:00Z'),
  lastVerifiedAt: new Date('2026-12-20T00:00:00Z'),
  payMinAnnual: null,
  ...over,
});
/** Another member's own job, built to pass every public filter except the owner one. */
const theirs = (over: Row = {}): Row =>
  catalogue({ id: 'their-job', ownerId: 'u2', companyId: 'their-co', title: 'Secret startup role', ...over });

beforeEach(() => {
  db.jobs.length = 0;
  db.companies.length = 0;
  db.reports.length = 0;
  db.events.length = 0;
  db.companies.push(
    { id: 'cat-co', name: 'Acme', normalizedName: 'acme', ownerId: null, enabled: true, industry: 'tech' },
    {
      id: 'their-co',
      name: 'Secret Startup',
      normalizedName: 'own:u2:secret startup',
      ownerId: 'u2',
      enabled: true, // even a forgotten `enabled` filter must not be what protects it
      industry: 'tech',
    },
  );
  db.jobs.push(catalogue(), theirs());
  install(finders);
  getSession.mockReset();
});

/* ── 1. the source scan ──────────────────────────────────────────────────── */

const { CATALOG_JOB_READ_PATHS, OWNER_JOB_READ_PATHS, OWN_JOB_EXEMPT_PATHS } = await import('@/lib/rmhladder/own-jobs');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === '.git') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|d)\.(ts|tsx)$/.test(name) && name !== 'routeTree.gen.ts') {
      out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return out;
}

/** Source without comments (a mention in a comment is not a read, and a comment never satisfies a scan). */
function code(file: string): string {
  return readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const READS_JOB = /\bladderJob\b/;
const READS_COMPANY = /\bladderCompany\b/;

describe('the read-path registries', () => {
  const sources = ['lib', 'app', 'server', 'features', 'scripts'].flatMap((dir) => walk(path.join(ROOT, dir)));
  const readers = sources.filter((file) => {
    const text = code(file);
    return READS_JOB.test(text) || READS_COMPANY.test(text);
  });
  const lists = {
    catalogue: new Set<string>(CATALOG_JOB_READ_PATHS),
    owner: new Set<string>(OWNER_JOB_READ_PATHS),
    exempt: new Set<string>(Object.keys(OWN_JOB_EXEMPT_PATHS)),
  };

  it('finds the readers it should (the scan is not vacuous)', () => {
    expect(readers).toContain('lib/rmhladder/server/queries.ts');
    expect(readers).toContain('lib/sitemap.server.ts');
    expect(readers).toContain('scripts/ladder-status.ts');
    expect(readers.length).toBeGreaterThanOrEqual(15);
  });

  it('every file that reads ladderJob or ladderCompany is in exactly one list', () => {
    const unclassified = readers.filter(
      (file) => !lists.catalogue.has(file) && !lists.owner.has(file) && !lists.exempt.has(file),
    );
    expect(unclassified, 'a new reader of the job or company tables: classify it, and give it the fragment').toEqual(
      [],
    );
    for (const file of [...lists.catalogue, ...lists.owner, ...lists.exempt]) {
      const memberships = [lists.catalogue, lists.owner, lists.exempt].filter((list) => list.has(file)).length;
      expect(memberships, `${file} is in more than one list`).toBe(1);
      expect(() => statSync(path.join(ROOT, file)), `${file} does not exist`).not.toThrow();
    }
  });

  it('every exempt entry states a real reason', () => {
    for (const [file, reason] of Object.entries(OWN_JOB_EXEMPT_PATHS)) {
      expect(reason.trim().length, file).toBeGreaterThan(40);
    }
  });

  it('each catalogue reader uses the fragment for each table it reads', () => {
    for (const file of lists.catalogue) {
      const text = code(file);
      if (READS_JOB.test(text))
        expect(text, `${file} reads ladderJob without catalogJobWhere`).toMatch(/\bcatalogJobWhere\b/);
      if (READS_COMPANY.test(text)) {
        expect(text, `${file} reads ladderCompany without catalogCompanyWhere`).toMatch(/\bcatalogCompanyWhere\b/);
      }
      expect(text, `${file} uses no fragment at all`).toMatch(/\bcatalog(Job|Company)Where\b/);
    }
  });

  it('each owner reader uses ownerOrCatalogJobWhere or the write guard', () => {
    for (const file of lists.owner) {
      expect(code(file), `${file} must scope to the owner's rows`).toMatch(
        /\b(ownerOrCatalogJobWhere|assertJobUsable)\b/,
      );
    }
  });

  it('every write that takes a jobId from the client goes through the guard', () => {
    const actions = code('lib/rmhladder/server/actions.ts');
    for (const fn of ['setJobAction', 'updateApplication']) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`));
      expect(body.slice(0, body.indexOf('\nexport ', 10) > 0 ? body.indexOf('\nexport ', 10) : undefined)).toContain(
        'assertJobUsable',
      );
    }
    expect(code('lib/rmhladder/api/rmhladder.import.server.ts')).toContain('ownerOrCatalogJobWhere');
  });
});

/* ── 2. behaviour ────────────────────────────────────────────────────────── */

describe('the catalogue search and detail', () => {
  it('lists only catalogue jobs: no own job, the member’s own included, however well it matches', async () => {
    const { listJobs } = await import('@/lib/rmhladder/server/queries');
    db.jobs.push(theirs({ id: 'my-job', ownerId: 'u1', companyId: 'cat-co' }));
    const result = await listJobs(fakePrisma.prisma as any, 'u1', {});
    expect(result.rows.map((r) => r.id)).toEqual(['cat-job']);
    const anonymous = await listJobs(fakePrisma.prisma as any, null, {});
    expect(anonymous.rows.map((r) => r.id)).toEqual(['cat-job']);
  });

  it('shows an own job to its owner alone, and never to a viewer of null', async () => {
    const { getJobDetail } = await import('@/lib/rmhladder/server/queries');
    const prisma = fakePrisma.prisma as any;
    expect(await getJobDetail(prisma, null, 'their-job')).toBeNull();
    expect(await getJobDetail(prisma, 'u1', 'their-job')).toBeNull();
    expect(await getJobDetail(prisma, 'u2', 'their-job')).toMatchObject({
      id: 'their-job',
      title: 'Secret startup role',
    });
    // the catalogue job is still public
    expect(await getJobDetail(prisma, null, 'cat-job')).toMatchObject({ id: 'cat-job' });
    // with the catalogue fragment (the Open Graph path) not even the owner gets it
    const { catalogJobWhere } = await import('@/lib/rmhladder/own-jobs');
    expect(await getJobDetail(prisma, 'u2', 'their-job', { where: catalogJobWhere() })).toBeNull();
  });

  it('does not count an own job in the overview', async () => {
    const { getOverview } = await import('@/lib/rmhladder/server/queries');
    const overview = await getOverview(fakePrisma.prisma as any, 'u1');
    expect(overview.verifiedActive).toBe(1);
  });
});

describe('company lists', () => {
  it('listCompanies has no own company and counts no own job under a catalogue company', async () => {
    const { listCompanies } = await import('@/lib/rmhladder/server/queries');
    db.jobs.push(theirs({ id: 'on-catalogue', companyId: 'cat-co' }));
    const companies = await listCompanies(fakePrisma.prisma as any, {});
    expect(companies.map((c) => (c as { id?: string }).id)).toEqual(['cat-co']);
    expect(companies[0]!.activeJobCount).toBe(1);
  });

  it('the settings watchlist choices have no own company', async () => {
    const { listWatchlistCompanies } = await import('@/lib/rmhladder/server/queries');
    const choices = await listWatchlistCompanies(fakePrisma.prisma as any);
    expect(choices.map((c) => c.id)).toEqual(['cat-co']);
  });

  it('an own company cannot be watched or have interview reports', async () => {
    const { toggleWatchlist } = await import('@/lib/rmhladder/server/actions');
    const watch = {
      ladderCompany: { findUnique: finders.ladderCompany.findUnique },
      ladderWatchlistEntry: { findUnique: vi.fn(), create: vi.fn() },
    };
    await expect(toggleWatchlist(watch as any, 'u1', 'their-co', true)).rejects.toThrow('Company not found');
    expect(watch.ladderWatchlistEntry.create).not.toHaveBeenCalled();
    await expect(toggleWatchlist(watch as any, 'u1', 'cat-co', true)).resolves.toEqual({ isWatchlisted: true });

    const reportCreate = vi.fn(async () => ({ id: 'r1' }));
    install({
      ...finders,
      ladderInterviewReport: {
        count: async () => 0,
        create: reportCreate,
        findMany: async () => [],
        aggregate: async () => ({ _count: { _all: 0 }, _avg: { difficulty: null } }),
      },
    });
    const { createInterviewReport, listInterviewReports } = await import('@/lib/rmhladder/community.server');
    const input = { roleTitle: 'x', rounds: 1, questionTypes: [], outcome: 'offer', difficulty: 3, body: '' } as any;
    expect(await createInterviewReport('u1', { ...input, companyId: 'their-co' })).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(reportCreate).not.toHaveBeenCalled();
    expect(await createInterviewReport('u1', { ...input, companyId: 'cat-co' })).toMatchObject({ ok: true });
    // and the list is scoped to catalogue companies in its own query
    const findMany = vi.fn(async () => []);
    install({
      ladderInterviewReport: { findMany, aggregate: async () => ({ _count: { _all: 0 }, _avg: { difficulty: null } }) },
    });
    await listInterviewReports('their-co');
    expect((findMany.mock.calls[0] as any)[0].where).toMatchObject({ company: { ownerId: null } });
  });
});

describe('the sitemap and the Open Graph card', () => {
  it('the sitemap lists no own job', async () => {
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    const entries = await SITEMAP_SECTIONS.jobs.page(0, 50);
    expect(entries.map((e) => e.loc)).toEqual(['/rmhladder/jobs/cat-job']);
  });

  it('the card answers 404 for an own job whoever asks, and 200 for a catalogue job', async () => {
    const { route } = await import('@/lib/og/api/og.job.$jobId.server');
    const get = (jobId: string) =>
      handlersOf<any>(route).GET!({
        params: { jobId },
        request: new Request(`https://x.test/api/og/job/${jobId}`, { headers: { 'cf-connecting-ip': '1.2.3.4' } }),
      });
    expect((await get('their-job')).status).toBe(404);
    expect((await get('nope')).status).toBe(404);
    expect((await get('cat-job')).status).toBe(200);
  });
});

describe('matching, expiry and the pipeline', () => {
  it('a resume is never matched to an own job', async () => {
    const { refreshConfirmedResumeMatches } = await import('@/lib/rmhladder/resume/service.server');
    const upsert = vi.fn(async ({ create }: Row) => ({ id: `m-${create.jobId}`, jobId: create.jobId, score: 80 }));
    const prisma = {
      ladderJob: finders.ladderJob,
      ladderUserPrefs: { findFirst: async () => null },
      ladderKeyword: { findMany: async () => [] },
      ladderJobMatch: { upsert, deleteMany: async () => ({}) },
      ladderResumeVersion: { update: async () => ({}) },
    };
    const matches = await refreshConfirmedResumeMatches(prisma as any, {
      userId: 'u1',
      versionId: 'v1',
      profile: { skills: [] } as any,
    }).catch(() => null);
    // whether or not the profile parses, no match row may name the own job
    const matched = upsert.mock.calls.map((call: any) => call[0].create.jobId);
    expect(matched).not.toContain('their-job');
    if (matches) expect(matches.map((m: Row) => m.jobId)).not.toContain('their-job');
  });

  it('age expiry never touches an own job', async () => {
    const { expireStaleJobs } = await import('@/lib/rmhladder/pipeline/expire-stale');
    const old = new Date('2026-01-01T00:00:00Z');
    db.jobs.length = 0;
    db.jobs.push(
      catalogue({ id: 'stale-cat', lastSeenAt: old, discoveredAt: old }),
      theirs({ id: 'stale-own', lastSeenAt: old, discoveredAt: old }),
    );
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const createMany = vi.fn(async () => ({ count: 1 }));
    const result = await expireStaleJobs(
      {
        ladderJob: { findMany: finders.ladderJob.findMany as any, updateMany },
        ladderVerification: { createMany },
      } as any,
      { now: new Date('2026-12-25T00:00:00Z'), maxAgeMs: 30 * 86_400_000 },
    );
    expect(result.expired).toBe(1);
    expect((updateMany.mock.calls[0] as any)[0].where.id.in).toEqual(['stale-cat']);
  });

  it('a recheck skips an own job', async () => {
    const { recheckSource } = await import('@/lib/rmhladder/pipeline/recheck');
    const result = await recheckSource(
      { prisma: {} as any },
      { id: 's', platform: 'unknown-platform', slug: null, company: { name: 'x' } },
      [{ id: 'j', externalId: 'e', failedCheckCount: 0, ownerId: 'u2' }],
    );
    expect(result.skipped).toBe(1);
  });
});

describe('writes that take a jobId from the client', () => {
  const actionsFake = () => ({
    ladderJob: { findUnique: finders.ladderJob.findUnique },
    ladderUserPrefs: { upsert: vi.fn(async () => ({})) },
    ladderApplication: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({ id: 'a1' })) },
    ladderApplicationEvent: { create: vi.fn() },
    ladderJobAction: { upsert: vi.fn(async () => ({})), delete: vi.fn() },
  });

  it('updateApplication and the job actions refuse another member’s own job and write nothing', async () => {
    const { updateApplication, setJobAction } = await import('@/lib/rmhladder/server/actions');
    const { JobNotFoundError } = await import('@/lib/rmhladder/own-jobs');
    const fake = actionsFake();
    await expect(updateApplication(fake as any, 'u1', 'their-job', { status: 'applied' })).rejects.toBeInstanceOf(
      JobNotFoundError,
    );
    for (const action of ['saved', 'ignored', 'applied', null] as const) {
      await expect(setJobAction(fake as any, 'u1', 'their-job', action)).rejects.toBeInstanceOf(JobNotFoundError);
    }
    expect(fake.ladderApplication.upsert).not.toHaveBeenCalled();
    expect(fake.ladderJobAction.upsert).not.toHaveBeenCalled();
  });

  it('the same writes work for a catalogue job and for the owner’s own job', async () => {
    const { updateApplication, setJobAction } = await import('@/lib/rmhladder/server/actions');
    const fake = actionsFake();
    await updateApplication(fake as any, 'u1', 'cat-job', { status: 'applied' });
    await updateApplication(fake as any, 'u2', 'their-job', { status: 'interviewing' });
    await setJobAction(fake as any, 'u2', 'their-job', 'applied');
    expect(fake.ladderApplication.upsert).toHaveBeenCalledTimes(3);
  });

  it('the CSV import reports another member’s own job as not existing', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' }, session: { id: 's' } });
    const { route } = await import('@/lib/rmhladder/api/rmhladder.import.server');
    const csv = 'jobId,status\ncat-job,applied\ntheir-job,applied\n';
    const res = await handlersOf<any>(route).POST!({
      params: {},
      request: new Request('https://x.test/api/rmhladder/import', {
        method: 'POST',
        headers: {
          cookie: 'better-auth.session_token=abc',
          'cf-connecting-ip': '1.2.3.4',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ csv, dryRun: true }),
      }),
    });
    const body = (await res.json()) as { valid: number; errors: Array<{ row: number; error: string }> };
    expect(body.valid).toBe(1);
    expect(body.errors).toEqual([{ row: 3, error: 'Job does not exist' }]);
  });

  it('an analytics event may not name another member’s own job', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' }, session: { id: 's' } });
    const tx = { $executeRaw: vi.fn(), ladderProductEvent: { count: async () => 0, create: vi.fn(async () => ({})) } };
    install({ $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) });
    const { Route } = await import('@/app/routes/api/rmhladder/events');
    const post = (jobId: string) =>
      handlersOf<any>(Route).POST!({
        params: {},
        request: new Request('https://x.test/api/rmhladder/events', {
          method: 'POST',
          headers: {
            cookie: 'better-auth.session_token=abc',
            'content-type': 'application/json',
            'cf-connecting-ip': '1.2.3.4',
          },
          body: JSON.stringify({ type: 'apply_click', jobId }),
        }),
      });
    expect((await post('their-job')).status).toBe(404);
    expect((await post('cat-job')).status).toBe(204);
  });
});
