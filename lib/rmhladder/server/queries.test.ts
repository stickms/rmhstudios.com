/* eslint-disable @typescript-eslint/no-explicit-any -- fake-prisma harness file */
import { describe, expect, it } from 'vitest';
import {
  listJobs,
  getJobDetail,
  getOverview,
  listReviewTasks,
  listCompanies,
  listRuns,
  listStaleSources,
  getSettings,
  listAlerts,
} from './queries';

type AnyRow = Record<string, any>;
type FakeArgs = any;

/** Fake Prisma implementing only the shapes used by queries.ts (returned as any). */
function makeFakePrisma() {
  const companies = new Map<string, AnyRow>();
  const jobs = new Map<string, AnyRow>();
  const verifications: AnyRow[] = [];
  const reviewTasks: AnyRow[] = [];
  const jobActions: AnyRow[] = [];
  const applications: AnyRow[] = [];
  const prefs = new Map<string, AnyRow>();
  const keywords: AnyRow[] = [];
  const watchlist: AnyRow[] = [];
  const sources: AnyRow[] = [];
  const runs: AnyRow[] = [];
  const sourceErrors: AnyRow[] = [];
  const alerts: AnyRow[] = [];

  let compSeq = 0, veriSeq = 0, taskSeq = 0, sourceSeq = 0, runSeq = 0;

  return {
    ladderCompany: {
      async findMany({ where, include, take }: FakeArgs) {
        let rows = Array.from(companies.values());
        if (where?.enabled) rows = rows.filter((r) => r.enabled === true);
        if (where?.OR) {
          rows = rows.filter((r) => {
            const q = (where.OR as any)[0].name?.contains;
            return !q || (r.name as string).toLowerCase().includes(q.toLowerCase());
          });
        }
        rows = rows.slice(0, take ?? rows.length);
        return rows.map((c) => ({
          ...c,
          sources: include?.sources ? [] : undefined,
          _count: include?._count ? { jobs: 0 } : undefined,
        }));
      },
      async create({ data }: FakeArgs) {
        const id = `c-${++compSeq}`;
        const row = { id, ...data } as AnyRow;
        companies.set(id, row);
        return row;
      },
    },
    ladderJob: {
      async findMany({ where, include, orderBy, take, skip }: FakeArgs) {
        let rows = Array.from(jobs.values());

        // WHERE filters: status only — the fake is DUMB; non-US display
        // filtering is queries.ts's job (latest-verification rule).
        if (where?.status) rows = rows.filter((r) => r.status === where.status);

        // Preset filters
        if (where?.discoveredAt?.gte) {
          rows = rows.filter((r) => new Date(r.discoveredAt as Date) >= new Date(where.discoveredAt!.gte as any));
        }
        if (where?.applicationDeadline?.lte) {
          rows = rows.filter((r) => r.applicationDeadline && new Date(r.applicationDeadline as Date) <= new Date(where.applicationDeadline!.lte as any));
        }
        if (where?.remoteStatus) {
          rows = rows.filter((r) => r.remoteStatus === where.remoteStatus);
        }
        if (where?.company?.industry?.in) {
          rows = rows.filter((r) => {
            const c = companies.get(r.companyId as string);
            return c && (where.company!.industry!.in as string[]).includes(c.industry);
          });
        }
        if (where?.city?.in) {
          rows = rows.filter((r) => r.city && (where.city!.in as string[]).includes(r.city));
        }
        if (where?.programType?.in) {
          rows = rows.filter((r) => (where.programType!.in as string[]).includes(r.programType));
        }
        if ((where as any)?.title?.contains) {
          rows = rows.filter((r) => (r.title as string).toLowerCase().includes((where as any).title.contains.toLowerCase()));
        }

        // Blocked keyword exclusion (for now, skip in fake)
        // Production will check user keywords

        // Order by (relevance computed in JS; default relevance desc)
        if (orderBy) {
          if (orderBy.length && orderBy[0].relevanceScoreBase) {
            rows.sort((a, b) => {
              const dir = orderBy[0].relevanceScoreBase === 'desc' ? -1 : 1;
              return dir * ((b.relevanceScoreBase as number) - (a.relevanceScoreBase as number));
            });
          } else if (orderBy.length && orderBy[0].discoveredAt) {
            rows.sort((a, b) => {
              const dir = orderBy[0].discoveredAt === 'desc' ? -1 : 1;
              return dir * (new Date(a.discoveredAt as Date).getTime() - new Date(b.discoveredAt as Date).getTime());
            });
          }
        }

        // Pagination
        if (skip) rows = rows.slice(skip);
        if (take) rows = rows.slice(0, take);

        return rows.map((j) => ({
          ...j,
          company: include?.company ? companies.get(j.companyId as string) : undefined,
          verifications: include?.verifications
            ? verifications
                .filter((v) => v.jobId === j.id)
                .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime())
                .slice(0, 1)
            : undefined,
        }));
      },
      async findUnique({ where, include }: FakeArgs) {
        const job = jobs.get(where.id);
        if (!job) return null;
        const latestVeri = verifications
          .filter((v) => v.jobId === job.id)
          .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime());
        return {
          ...job,
          company: include?.company ? companies.get(job.companyId as string) : undefined,
          verifications: include?.verifications ? latestVeri : undefined,
          actions: include?.actions ? jobActions.filter((a) => a.jobId === job.id) : undefined,
          applications: include?.applications ? applications.filter((a) => a.jobId === job.id) : undefined,
        };
      },
    },
    ladderVerification: {
      async findMany({ where }: FakeArgs) {
        return verifications.filter((v) => v.jobId === where.jobId);
      },
      async create({ data }: FakeArgs) {
        const id = `v-${++veriSeq}`;
        const row = { id, ...data } as AnyRow;
        verifications.push(row);
        return row;
      },
    },
    ladderReviewTask: {
      async findMany({ where, include }: FakeArgs) {
        let rows = reviewTasks;
        if (where?.status) rows = rows.filter((t) => t.status === where.status);
        return rows.map((t) => ({
          ...t,
          job: include?.job ? (t.jobId ? jobs.get(t.jobId) : null) : undefined,
          source: include?.source ? (t.sourceId ? sources.find((s) => s.id === t.sourceId) : null) : undefined,
        }));
      },
      async create({ data }: FakeArgs) {
        const id = `t-${++taskSeq}`;
        const row = { id, ...data } as AnyRow;
        reviewTasks.push(row);
        return row;
      },
    },
    ladderSource: {
      async findMany({ where }: FakeArgs) {
        let rows = sources;
        if (where?.status) rows = rows.filter((s) => s.status === where.status);
        if (where?.OR) {
          // Supports the real-prisma stale shape: OR [{lastSuccessAt: null}, {lastSuccessAt: {lt}}]
          const orClauses = where.OR as AnyRow[];
          rows = rows.filter((s) =>
            orClauses.some((clause) => {
              if (clause.lastSuccessAt === null) return s.lastSuccessAt == null;
              const lt = (clause.lastSuccessAt as AnyRow)?.lt;
              return lt != null && s.lastSuccessAt != null && new Date(s.lastSuccessAt as Date) < new Date(lt);
            }),
          );
        }
        return rows;
      },
      async create({ data }: FakeArgs) {
        const id = `s-${++sourceSeq}`;
        const row = { id, ...data } as AnyRow;
        sources.push(row);
        return row;
      },
    },
    ladderScrapeRun: {
      async findMany({ orderBy, take }: FakeArgs) {
        let rows = [...runs];
        if (orderBy?.length && orderBy[0].startedAt) {
          rows.sort((a, b) => {
            const dir = orderBy[0].startedAt === 'desc' ? -1 : 1;
            return dir * (new Date(a.startedAt as Date).getTime() - new Date(b.startedAt as Date).getTime());
          });
        }
        if (take) rows = rows.slice(0, take);
        return rows.map((r) => ({
          ...r,
          errors: sourceErrors.filter((e) => e.runId === r.id),
        }));
      },
      async create({ data }: FakeArgs) {
        const id = `r-${++runSeq}`;
        const row = { id, ...data } as AnyRow;
        runs.push(row);
        return row;
      },
    },
    ladderUserPrefs: {
      async findUnique({ where }: FakeArgs) {
        return prefs.get(where.userId) ?? null;
      },
      async upsert({ where, create, update }: FakeArgs) {
        let row = prefs.get(where.userId);
        if (!row) {
          row = { id: `p-${where.userId}`, userId: where.userId, ...create } as AnyRow;
          prefs.set(where.userId, row);
        } else {
          row = { ...row, ...(update as AnyRow) };
          prefs.set(where.userId, row);
        }
        return row;
      },
    },
    ladderKeyword: {
      async findMany({ where }: FakeArgs) {
        return keywords.filter(
          (k) => k.userId === where.userId,
        );
      },
    },
    ladderWatchlistEntry: {
      async findMany({ where }: FakeArgs) {
        return watchlist.filter((w) => w.userId === where.userId);
      },
    },
    ladderJobAction: {
      async findMany({ where }: FakeArgs) {
        return jobActions.filter((a) => a.userId === where.userId);
      },
    },
    ladderApplication: {
      async findMany({ where }: FakeArgs) {
        return applications.filter((a) => a.userId === where.userId);
      },
    },
    ladderAlert: {
      async findMany({ where }: FakeArgs) {
        return alerts
          .filter((a) => a.userId === where.userId)
          .sort((a, b) => new Date(b.sentAt as Date).getTime() - new Date(a.sentAt as Date).getTime());
      },
    },
    _state: {
      companies,
      jobs,
      verifications,
      reviewTasks,
      jobActions,
      applications,
      prefs,
      keywords,
      watchlist,
      sources,
      runs,
      sourceErrors,
      alerts,
    },
  } as any;
}

describe('queries.ts', () => {
  describe('listJobs', () => {
    it('filters by preset: new (7 days)', async () => {
      const prisma = makeFakePrisma();
      const c1 = (await prisma.ladderCompany.create({
        data: { name: 'TestCo', normalizedName: 'testco', industry: 'finance', firmType: 'bank' },
      })) as AnyRow;
      const now = new Date();
      const old = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
      const fresh = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      prisma._state.jobs.set('old', {
        id: 'old',
        companyId: c1.id,
        title: 'Job',
        normalizedTitle: 'job',
        status: 'active',
        discoveredAt: old,
        remoteStatus: 'onsite',
        relevanceScoreBase: 50,
      });
      prisma._state.jobs.set('fresh', {
        id: 'fresh',
        companyId: c1.id,
        title: 'Job',
        normalizedTitle: 'job',
        status: 'active',
        discoveredAt: fresh,
        remoteStatus: 'onsite',
        relevanceScoreBase: 50,
      });

      const result = await listJobs(prisma, 'user1', { preset: 'new' });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].id).toBe('fresh');
    });

    it('excludes non-US by default, includes with includeNonUS', async () => {
      const prisma = makeFakePrisma();
      const c1 = (await prisma.ladderCompany.create({
        data: { name: 'TestCo', normalizedName: 'testco', industry: 'finance', firmType: 'bank' },
      })) as AnyRow;

      const jobId1 = 'job-us', jobId2 = 'job-non-us';
      prisma._state.jobs.set(jobId1, {
        id: jobId1,
        companyId: c1.id,
        title: 'US Job',
        normalizedTitle: 'us job',
        status: 'active',
        discoveredAt: new Date(),
        remoteStatus: 'onsite',
        relevanceScoreBase: 50,
      });
      prisma._state.jobs.set(jobId2, {
        id: jobId2,
        companyId: c1.id,
        title: 'Non-US Job',
        normalizedTitle: 'non-us job',
        status: 'active',
        discoveredAt: new Date(),
        remoteStatus: 'onsite',
        relevanceScoreBase: 50,
      });

      prisma._state.verifications.push(
        { id: 'v1', jobId: jobId1, status: 'verified_active', confidence: 100, checkedAt: new Date() },
        { id: 'v2', jobId: jobId2, status: 'non_us_role', confidence: 100, checkedAt: new Date() },
      );

      const resultDefault = await listJobs(prisma, 'user1', {});
      expect(resultDefault.rows.length).toBe(1);
      expect(resultDefault.rows[0].id).toBe(jobId1);

      const resultInclude = await listJobs(prisma, 'user1', { includeNonUS: true });
      expect(resultInclude.rows.length).toBe(2);
    });

    it('filters by preset: finance (company industry)', async () => {
      const prisma = makeFakePrisma();
      const fin = (await prisma.ladderCompany.create({
        data: { name: 'BankCo', normalizedName: 'bankco', industry: 'Investment Banking', firmType: 'bank' },
      })) as AnyRow;
      const tech = (await prisma.ladderCompany.create({
        data: { name: 'TechCo', normalizedName: 'techco', industry: 'Technology', firmType: 'technology' },
      })) as AnyRow;
      prisma._state.jobs.set('finjob', {
        id: 'finjob', companyId: fin.id, title: 'IB Analyst', normalizedTitle: 'ib analyst',
        status: 'active', discoveredAt: new Date(), remoteStatus: 'onsite', relevanceScoreBase: 50,
      });
      prisma._state.jobs.set('techjob', {
        id: 'techjob', companyId: tech.id, title: 'SWE Intern', normalizedTitle: 'swe intern',
        status: 'active', discoveredAt: new Date(), remoteStatus: 'onsite', relevanceScoreBase: 50,
      });

      const result = await listJobs(prisma, 'user1', { preset: 'finance' });
      expect(result.rows.map((r) => r.id)).toEqual(['finjob']);
    });

    it('excludes rows matching a user block keyword', async () => {
      const prisma = makeFakePrisma();
      const c1 = (await prisma.ladderCompany.create({
        data: { name: 'TestCo', normalizedName: 'testco', industry: 'finance', firmType: 'bank' },
      })) as AnyRow;
      prisma._state.jobs.set('ok', {
        id: 'ok', companyId: c1.id, title: 'Finance Analyst', normalizedTitle: 'finance analyst',
        status: 'active', discoveredAt: new Date(), remoteStatus: 'onsite', relevanceScoreBase: 50,
      });
      prisma._state.jobs.set('blocked', {
        id: 'blocked', companyId: c1.id, title: 'Crypto Trading Analyst', normalizedTitle: 'crypto trading analyst',
        status: 'active', discoveredAt: new Date(), remoteStatus: 'onsite', relevanceScoreBase: 90,
      });
      prisma._state.keywords.push({ id: 'k1', userId: 'user1', keyword: 'crypto', weight: 0, type: 'block' });

      const result = await listJobs(prisma, 'user1', {});
      expect(result.rows.map((r) => r.id)).toEqual(['ok']);
    });

    it('boost keyword flips relevance ordering', async () => {
      const prisma = makeFakePrisma();
      const c1 = (await prisma.ladderCompany.create({
        data: { name: 'TestCo', normalizedName: 'testco', industry: 'finance', firmType: 'bank', priorityLevel: 3 },
      })) as AnyRow;
      prisma._state.jobs.set('higherBase', {
        id: 'higherBase', companyId: c1.id, title: 'Operations Analyst', normalizedTitle: 'operations analyst',
        status: 'active', discoveredAt: new Date(), remoteStatus: 'onsite', relevanceScoreBase: 60,
      });
      prisma._state.jobs.set('boosted', {
        id: 'boosted', companyId: c1.id, title: 'Equity Research Analyst', normalizedTitle: 'equity research analyst',
        status: 'active', discoveredAt: new Date(), remoteStatus: 'onsite', relevanceScoreBase: 55,
      });
      prisma._state.keywords.push({ id: 'k1', userId: 'user1', keyword: 'equity research', weight: 20, type: 'boost' });

      const result = await listJobs(prisma, 'user1', {});
      expect(result.rows.map((r) => r.id)).toEqual(['boosted', 'higherBase']);
      expect(result.rows[0].finalRelevance).toBe(75);
    });

    it('paginates with cursor', async () => {
      const prisma = makeFakePrisma();
      const c1 = (await prisma.ladderCompany.create({
        data: { name: 'TestCo', normalizedName: 'testco', industry: 'finance', firmType: 'bank' },
      })) as AnyRow;

      for (let i = 0; i < 5; i++) {
        prisma._state.jobs.set(`job${i}`, {
          id: `job${i}`,
          companyId: c1.id,
          title: `Job ${i}`,
          normalizedTitle: `job ${i}`,
          status: 'active',
          discoveredAt: new Date(),
          remoteStatus: 'onsite',
          relevanceScoreBase: 50 - i,
        });
      }

      const result1 = await listJobs(prisma, 'user1', { take: 2 });
      expect(result1.rows.length).toBe(2);
      expect(result1.nextCursor).not.toBeNull();

      const result2 = await listJobs(prisma, 'user1', { take: 2, cursor: result1.nextCursor! });
      expect(result2.rows.length).toBe(2);
    });
  });

  describe('getJobDetail', () => {
    it('returns job with all verifications sorted desc by checkedAt', async () => {
      const prisma = makeFakePrisma();
      const c1 = (await prisma.ladderCompany.create({
        data: { name: 'TestCo', normalizedName: 'testco', industry: 'finance', firmType: 'bank' },
      })) as AnyRow;

      const jobId = 'job1';
      prisma._state.jobs.set(jobId, {
        id: jobId,
        companyId: c1.id,
        title: 'Test Job',
        normalizedTitle: 'test job',
        status: 'active',
        discoveredAt: new Date(),
        remoteStatus: 'onsite',
        relevanceScoreBase: 50,
      });

      const now = new Date();
      prisma._state.verifications.push(
        { id: 'v1', jobId, status: 'unverified', confidence: 0, checkedAt: new Date(now.getTime() - 1000) },
        { id: 'v2', jobId, status: 'verified_active', confidence: 100, checkedAt: new Date(now.getTime() + 1000) },
      );

      const result = await getJobDetail(prisma, 'user1', jobId);
      expect(result?.verifications).toHaveLength(2);
      expect(result?.verifications?.[0].id).toBe('v2'); // latest first
    });
  });

  describe('getOverview', () => {
    it('counts new, verified, expiring, review tasks, saved, applied', async () => {
      const prisma = makeFakePrisma();
      const c1 = (await prisma.ladderCompany.create({
        data: { name: 'TestCo', normalizedName: 'testco', industry: 'finance', firmType: 'bank' },
      })) as AnyRow;

      const now = new Date();
      // 6 days (not exactly 7): getOverview computes its own `now` a few ms
      // later, so an exact-boundary fixture would be flaky-by-construction.
      const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const tenDaysFromNow = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

      // New job
      prisma._state.jobs.set('j1', {
        id: 'j1',
        companyId: c1.id,
        title: 'Job',
        normalizedTitle: 'job',
        status: 'active',
        discoveredAt: sixDaysAgo,
        applicationDeadline: tenDaysFromNow,
        remoteStatus: 'onsite',
        relevanceScoreBase: 50,
      });

      prisma._state.verifications.push({
        id: 'v1',
        jobId: 'j1',
        status: 'verified_active',
        confidence: 100,
        checkedAt: now,
      });

      // Review task
      prisma._state.reviewTasks.push({
        id: 't1',
        jobId: 'j1',
        sourceId: null,
        reason: 'low_confidence',
        status: 'open',
      });

      // Job action (saved)
      prisma._state.jobActions.push({
        id: 'a1',
        userId: 'user1',
        jobId: 'j1',
        action: 'saved',
      });

      // Application (applied)
      prisma._state.applications.push({
        id: 'ap1',
        userId: 'user1',
        jobId: 'j1',
        status: 'applied',
      });

      const result = await getOverview(prisma, 'user1');
      expect(result.newThisWeek).toBe(1);
      expect(result.verifiedActive).toBe(1);
      expect(result.expiringSoon).toBe(1);
      expect(result.openReviewTasks).toBe(1);
      expect(result.savedCount).toBe(1);
      expect(result.appliedCount).toBe(1);
    });
  });

  describe('listStaleSources', () => {
    it('includes sources where lastSuccessAt is null or > 48h old', async () => {
      const prisma = makeFakePrisma();
      const now = new Date();
      const fortySevenHoursAgo = new Date(now.getTime() - 47 * 60 * 60 * 1000);
      const fortyNineHoursAgo = new Date(now.getTime() - 49 * 60 * 60 * 1000);

      await prisma.ladderSource.create({
        data: { companyId: 'c1', platform: 'greenhouse', status: 'active', lastSuccessAt: null },
      });
      await prisma.ladderSource.create({
        data: { companyId: 'c1', platform: 'lever', status: 'active', lastSuccessAt: fortyNineHoursAgo },
      });
      await prisma.ladderSource.create({
        data: { companyId: 'c1', platform: 'ashby', status: 'active', lastSuccessAt: fortySevenHoursAgo },
      });

      const result = await listStaleSources(prisma, now);
      expect(result.length).toBe(2); // null + 49h, not 47h
    });
  });

  describe('getSettings', () => {
    it('creates default prefs on miss', async () => {
      const prisma = makeFakePrisma();
      const result = await getSettings(prisma, 'new-user');
      expect(result.prefs).toBeDefined();
      expect(result.prefs.userId).toBe('new-user');
      expect(result.keywords).toEqual([]);
      expect(result.watchlistCompanyIds).toEqual([]);
    });

    it('returns existing prefs + keywords + watchlist', async () => {
      const prisma = makeFakePrisma();
      await prisma.ladderUserPrefs.upsert({
        where: { userId: 'user1' },
        create: { userId: 'user1', relevanceThreshold: 70, preferredCities: ['NYC'] },
        update: {},
      });
      prisma._state.keywords.push({
        id: 'k1',
        userId: 'user1',
        keyword: 'machine learning',
        weight: 15,
        type: 'boost',
      });
      prisma._state.watchlist.push({
        id: 'w1',
        userId: 'user1',
        companyId: 'c1',
        priority: 1,
      });

      const result = await getSettings(prisma, 'user1');
      expect(result.prefs.relevanceThreshold).toBe(70);
      expect(result.keywords.length).toBe(1);
      expect(result.watchlistCompanyIds.length).toBe(1);
    });
  });

  describe('listReviewTasks', () => {
    it('returns open tasks with job context by default', async () => {
      const prisma = makeFakePrisma();
      prisma._state.jobs.set('j1', { id: 'j1', companyId: 'c1', title: 'Job', status: 'active' });
      prisma._state.reviewTasks.push(
        { id: 't1', jobId: 'j1', reason: 'low_confidence', status: 'open' },
        { id: 't2', jobId: 'j1', reason: 'blocked', status: 'resolved' },
      );
      const result = await listReviewTasks(prisma, {});
      expect(result.map((t: AnyRow) => t.id)).toEqual(['t1']);
      expect((result[0] as AnyRow).job).toBeDefined();
    });
  });

  describe('listCompanies', () => {
    it('filters by name query and maps activeJobCount', async () => {
      const prisma = makeFakePrisma();
      await prisma.ladderCompany.create({ data: { name: 'Goldman Sachs', normalizedName: 'goldman sachs', industry: 'Investment Banking', firmType: 'bulge_bracket' } });
      await prisma.ladderCompany.create({ data: { name: 'Stripe', normalizedName: 'stripe', industry: 'Technology', firmType: 'technology' } });
      const result = await listCompanies(prisma, { q: 'gold' });
      expect(result).toHaveLength(1);
      expect((result[0] as AnyRow).name).toBe('Goldman Sachs');
      expect((result[0] as AnyRow).activeJobCount).toBe(0);
    });
  });

  describe('listRuns', () => {
    it('returns runs newest-first with error rows attached', async () => {
      const prisma = makeFakePrisma();
      const r1 = (await prisma.ladderScrapeRun.create({ data: { trigger: 'cron', startedAt: new Date(Date.now() - 1000) } })) as AnyRow;
      await prisma.ladderScrapeRun.create({ data: { trigger: 'manual', startedAt: new Date() } });
      prisma._state.sourceErrors.push({ id: 'e1', runId: r1.id, errorClass: 'process', message: 'boom' });
      const result = await listRuns(prisma, 10);
      expect(result).toHaveLength(2);
      expect((result[1] as AnyRow).errors).toHaveLength(1);
    });
  });

  describe('listAlerts', () => {
    it('returns the user alerts newest first', async () => {
      const prisma = makeFakePrisma();
      const now = Date.now();
      prisma._state.alerts.push(
        { id: 'al1', userId: 'user1', jobId: 'j1', type: 'immediate', sentAt: new Date(now - 1000) },
        { id: 'al2', userId: 'user1', jobId: 'j2', type: 'daily_digest', sentAt: new Date(now) },
        { id: 'al3', userId: 'other', jobId: 'j3', type: 'immediate', sentAt: new Date(now) },
      );
      const result = await listAlerts(prisma, 'user1');
      expect(result.map((a: AnyRow) => a.id)).toEqual(['al2', 'al1']);
    });
  });
});
