/* eslint-disable @typescript-eslint/no-explicit-any -- fake-prisma harness file */
import { describe, expect, it } from 'vitest';
import {
  setJobAction,
  updateApplication,
  resolveReviewTask,
  setCompanyEnabled,
  setCompanyPriority,
  upsertKeyword,
  deleteKeyword,
  updatePrefs,
  toggleWatchlist,
  markAlertsRead,
} from './actions';

type AnyRow = Record<string, any>;
type FakeArgs = any;

/** Fake Prisma implementing only the shapes used by actions.ts (returned as any). */
function makeFakePrisma() {
  const companies = new Map<string, AnyRow>();
  const jobs = new Map<string, AnyRow>();
  const jobActions: AnyRow[] = [];
  const applications: AnyRow[] = [];
  const reviewTasks: AnyRow[] = [];
  const verifications: AnyRow[] = [];
  const keywords: AnyRow[] = [];
  const watchlist: AnyRow[] = [];
  const prefs = new Map<string, AnyRow>();
  const alerts: AnyRow[] = [];

  let actSeq = 0, appSeq = 0, veriSeq = 0, kwSeq = 0;

  return {
    ladderJobAction: {
      async findUnique({ where }: FakeArgs) {
        return jobActions.find((a) => a.userId === where.userId_jobId.userId && a.jobId === where.userId_jobId.jobId) ?? null;
      },
      async upsert({ where, create, update }: FakeArgs) {
        const existing = jobActions.find((a) => a.userId === where.userId_jobId.userId && a.jobId === where.userId_jobId.jobId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `a-${++actSeq}`, ...create } as AnyRow;
        jobActions.push(row);
        return row;
      },
      async delete({ where }: FakeArgs) {
        const idx = jobActions.findIndex((a) => a.userId === where.userId_jobId.userId && a.jobId === where.userId_jobId.jobId);
        if (idx >= 0) jobActions.splice(idx, 1);
      },
    },
    ladderApplication: {
      async findUnique({ where }: FakeArgs) {
        return applications.find((a) => a.userId === where.userId_jobId.userId && a.jobId === where.userId_jobId.jobId) ?? null;
      },
      async upsert({ where, create, update }: FakeArgs) {
        const existing = applications.find((a) => a.userId === where.userId_jobId.userId && a.jobId === where.userId_jobId.jobId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `ap-${++appSeq}`, ...create } as AnyRow;
        applications.push(row);
        return row;
      },
    },
    ladderReviewTask: {
      async findUnique({ where }: FakeArgs) {
        return reviewTasks.find((t) => t.id === where.id) ?? null;
      },
      async update({ where, data }: FakeArgs) {
        const task = reviewTasks.find((t) => t.id === where.id);
        if (task) Object.assign(task, data);
        return task;
      },
    },
    ladderJob: {
      async findUnique({ where }: FakeArgs) {
        return jobs.get(where.id) ?? null;
      },
      async update({ where, data }: FakeArgs) {
        const job = jobs.get(where.id);
        if (job) Object.assign(job, data);
        return job;
      },
    },
    ladderVerification: {
      async create({ data }: FakeArgs) {
        const row = { id: `v-${++veriSeq}`, ...data } as AnyRow;
        verifications.push(row);
        return row;
      },
    },
    ladderCompany: {
      async update({ where, data }: FakeArgs) {
        const comp = companies.get(where.id);
        if (comp) Object.assign(comp, data);
        return comp;
      },
    },
    ladderKeyword: {
      async findUnique({ where }: FakeArgs) {
        return keywords.find((k) => k.userId === where.userId_keyword_type.userId && k.keyword === where.userId_keyword_type.keyword && k.type === where.userId_keyword_type.type) ?? null;
      },
      async upsert({ where, create, update }: FakeArgs) {
        const idx = keywords.findIndex((k) => k.userId === where.userId_keyword_type.userId && k.keyword === where.userId_keyword_type.keyword && k.type === where.userId_keyword_type.type);
        if (idx >= 0) {
          Object.assign(keywords[idx], update);
          return keywords[idx];
        }
        const row = { id: `k-${++kwSeq}`, ...create } as AnyRow;
        keywords.push(row);
        return row;
      },
      async delete({ where }: FakeArgs) {
        const idx = keywords.findIndex((k) => k.userId === where.userId_keyword_type.userId && k.keyword === where.userId_keyword_type.keyword && k.type === where.userId_keyword_type.type);
        if (idx >= 0) keywords.splice(idx, 1);
      },
    },
    ladderUserPrefs: {
      async upsert({ where, create, update }: FakeArgs) {
        let row = prefs.get(where.userId);
        if (!row) {
          row = { id: `p-${where.userId}`, userId: where.userId, ...create } as AnyRow;
          prefs.set(where.userId, row);
        } else {
          Object.assign(row, update);
        }
        return row;
      },
    },
    ladderWatchlistEntry: {
      async findUnique({ where }: FakeArgs) {
        return watchlist.find((w) => w.userId === where.userId_companyId.userId && w.companyId === where.userId_companyId.companyId) ?? null;
      },
      async create({ data }: FakeArgs) {
        const row = { id: `w-${Math.random()}`, ...data } as AnyRow;
        watchlist.push(row);
        return row;
      },
      async delete({ where }: FakeArgs) {
        const idx = watchlist.findIndex((w) => w.userId === where.userId_companyId.userId && w.companyId === where.userId_companyId.companyId);
        if (idx >= 0) watchlist.splice(idx, 1);
      },
    },
    ladderAlert: {
      async updateMany({ where, data }: FakeArgs) {
        const targets = alerts.filter(
          (a) => a.userId === where.userId && (where.readAt !== null || a.readAt == null),
        );
        for (const a of targets) Object.assign(a, data);
        return { count: targets.length };
      },
    },
    ladderAlertEvent: {
      async updateMany({ where, data }: FakeArgs) {
        const targets = alerts.filter(
          (a) => a.userId === where.userId &&
            (!where.id || a.id === where.id) &&
            (where.readAt !== null || a.readAt == null),
        );
        for (const a of targets) Object.assign(a, data);
        return { count: targets.length };
      },
    },
    _state: { companies, jobs, jobActions, applications, reviewTasks, verifications, keywords, watchlist, prefs, alerts },
  } as any;
}

describe('actions.ts', () => {
  describe('setJobAction', () => {
    it('upserts saved/applied/ignored action', async () => {
      const prisma = makeFakePrisma();
      await setJobAction(prisma, 'user1', 'job1', 'saved');
      expect(prisma._state.jobActions.length).toBe(1);
      expect(prisma._state.jobActions[0].action).toBe('saved');
    });

    it('deletes action when passed null', async () => {
      const prisma = makeFakePrisma();
      await setJobAction(prisma, 'user1', 'job1', 'saved');
      await setJobAction(prisma, 'user1', 'job1', null);
      expect(prisma._state.jobActions.length).toBe(0);
    });

    it('applied creates LadderApplication with appliedDate', async () => {
      const prisma = makeFakePrisma();
      const before = new Date();
      await setJobAction(prisma, 'user1', 'job1', 'applied');
      expect(prisma._state.applications.length).toBe(1);
      expect(prisma._state.applications[0].status).toBe('applied');
      expect(prisma._state.applications[0].appliedDate).not.toBeUndefined();
      const appDate = new Date(prisma._state.applications[0].appliedDate);
      expect(appDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('applied does not downgrade existing application status', async () => {
      const prisma = makeFakePrisma();
      prisma._state.applications.push({
        id: 'ap1',
        userId: 'user1',
        jobId: 'job1',
        status: 'interviewing',
        appliedDate: new Date(),
      });
      await setJobAction(prisma, 'user1', 'job1', 'applied');
      expect(prisma._state.applications[0].status).toBe('interviewing');
    });
  });

  describe('resolveReviewTask', () => {
    it('verify: sets job active + creates verification row', async () => {
      const prisma = makeFakePrisma();
      prisma._state.jobs.set('job1', { id: 'job1', status: 'unknown' });
      prisma._state.reviewTasks.push({ id: 't1', jobId: 'job1', status: 'open' });

      await resolveReviewTask(prisma, 'user1', 't1', 'verify');
      expect(prisma._state.jobs.get('job1')?.status).toBe('active');
      expect(prisma._state.verifications.some((v: AnyRow) => v.jobId === 'job1' && v.status === 'verified_probable')).toBe(true);
      expect(prisma._state.reviewTasks[0].status).toBe('resolved');
    });

    it('expire: sets job expired + creates verification row', async () => {
      const prisma = makeFakePrisma();
      prisma._state.jobs.set('job1', { id: 'job1', status: 'active' });
      prisma._state.reviewTasks.push({ id: 't1', jobId: 'job1', status: 'open' });

      await resolveReviewTask(prisma, 'user1', 't1', 'expire');
      expect(prisma._state.jobs.get('job1')?.status).toBe('expired');
      expect(prisma._state.verifications.some((v: AnyRow) => v.jobId === 'job1' && v.status === 'expired')).toBe(true);
    });

    it('non_us: creates verification row only, no job mutation', async () => {
      const prisma = makeFakePrisma();
      prisma._state.jobs.set('job1', { id: 'job1', status: 'active' });
      prisma._state.reviewTasks.push({ id: 't1', jobId: 'job1', status: 'open' });

      await resolveReviewTask(prisma, 'user1', 't1', 'non_us');
      expect(prisma._state.jobs.get('job1')?.status).toBe('active');
      expect(prisma._state.verifications.some((v: AnyRow) => v.jobId === 'job1' && v.status === 'non_us_role')).toBe(true);
    });

    it('duplicate: expires the duplicate job and records verification', async () => {
      const prisma = makeFakePrisma();
      prisma._state.jobs.set('job1', { id: 'job1', status: 'active' });
      prisma._state.reviewTasks.push({ id: 't1', jobId: 'job1', status: 'open' });

      await resolveReviewTask(prisma, 'user1', 't1', 'duplicate');
      expect(prisma._state.jobs.get('job1')?.status).toBe('expired');
      expect(prisma._state.verifications.some((v: AnyRow) => v.jobId === 'job1' && v.status === 'expired')).toBe(true);
      expect(prisma._state.reviewTasks[0].status).toBe('resolved');
    });

    it('null jobId: returns error without throwing', async () => {
      const prisma = makeFakePrisma();
      prisma._state.reviewTasks.push({ id: 't1', jobId: null, status: 'open' });

      const result = await resolveReviewTask(prisma, 'user1', 't1', 'verify');
      expect(result).toEqual({ ok: false, error: 'task has no job' });
    });
  });

  describe('updateApplication', () => {
    it('accepts valid patch', async () => {
      const prisma = makeFakePrisma();
      prisma._state.applications.push({
        id: 'ap1',
        userId: 'user1',
        jobId: 'job1',
        status: 'applied',
      });

      const result = await updateApplication(prisma, 'user1', 'job1', { status: 'interviewing' });
      expect(result.status).toBe('interviewing');
    });

    it('rejects invalid status via zod', async () => {
      const prisma = makeFakePrisma();
      try {
        await updateApplication(prisma, 'user1', 'job1', { status: 'invalid_status' as any });
        expect.fail('should throw');
      } catch (e) {
        expect((e as any).message).toContain('Invalid');
      }
    });

    it('rejects string > 2000 chars via zod', async () => {
      const prisma = makeFakePrisma();
      const longStr = 'x'.repeat(2001);
      try {
        await updateApplication(prisma, 'user1', 'job1', { notes: longStr });
        expect.fail('should throw');
      } catch (e) {
        expect((e as any).message).toContain('Maximum');
      }
    });
  });

  describe('upsertKeyword & deleteKeyword', () => {
    it('upsert creates or updates keyword', async () => {
      const prisma = makeFakePrisma();
      await upsertKeyword(prisma, 'user1', 'machine learning', 'boost', 15);
      expect(prisma._state.keywords.length).toBe(1);
      expect(prisma._state.keywords[0].keyword).toBe('machine learning');

      await upsertKeyword(prisma, 'user1', 'machine learning', 'boost', 20);
      expect(prisma._state.keywords.length).toBe(1);
      expect(prisma._state.keywords[0].weight).toBe(20);
    });

    it('delete removes keyword', async () => {
      const prisma = makeFakePrisma();
      await upsertKeyword(prisma, 'user1', 'machine learning', 'boost', 15);
      await deleteKeyword(prisma, 'user1', 'machine learning', 'boost');
      expect(prisma._state.keywords.length).toBe(0);
    });
  });

  describe('updatePrefs', () => {
    it('updates preferences with zod validation', async () => {
      const prisma = makeFakePrisma();
      const result = await updatePrefs(prisma, 'user1', {
        relevanceThreshold: 75,
        preferredCities: ['NYC', 'SF'],
      });
      expect(result.relevanceThreshold).toBe(75);
      expect(result.preferredCities).toEqual(['NYC', 'SF']);
    });

    it('rejects threshold > 100 via zod', async () => {
      const prisma = makeFakePrisma();
      try {
        await updatePrefs(prisma, 'user1', { relevanceThreshold: 101 });
        expect.fail('should throw');
      } catch (e) {
        expect((e as any).message).toContain('Maximum');
      }
    });
  });

  describe('toggleWatchlist', () => {
    it('adds company to watchlist if not present', async () => {
      const prisma = makeFakePrisma();
      const result = await toggleWatchlist(prisma, 'user1', 'company1', true);
      expect(result.isWatchlisted).toBe(true);
      expect(prisma._state.watchlist.length).toBe(1);
    });

    it('removes from watchlist if present and toggle false', async () => {
      const prisma = makeFakePrisma();
      await toggleWatchlist(prisma, 'user1', 'company1', true);
      const result = await toggleWatchlist(prisma, 'user1', 'company1', false);
      expect(result.isWatchlisted).toBe(false);
      expect(prisma._state.watchlist.length).toBe(0);
    });
  });

  describe('markAlertsRead', () => {
    it('stamps readAt on the user’s unread alerts only', async () => {
      const prisma = makeFakePrisma();
      const alreadyRead = new Date('2026-01-01');
      prisma._state.alerts.push(
        { id: 'a1', userId: 'user1', readAt: null },
        { id: 'a2', userId: 'user1', readAt: alreadyRead },
        { id: 'a3', userId: 'other', readAt: null },
      );
      await markAlertsRead(prisma, 'user1');
      expect(prisma._state.alerts[0].readAt).not.toBeNull();
      expect(prisma._state.alerts[1].readAt).toBe(alreadyRead); // untouched
      expect(prisma._state.alerts[2].readAt).toBeNull();
    });

    it('can mark one alert read without changing the rest', async () => {
      const prisma = makeFakePrisma();
      prisma._state.alerts.push(
        { id: 'a1', userId: 'user1', readAt: null },
        { id: 'a2', userId: 'user1', readAt: null },
      );
      await markAlertsRead(prisma, 'user1', 'a2');
      expect(prisma._state.alerts[0].readAt).toBeNull();
      expect(prisma._state.alerts[1].readAt).not.toBeNull();
    });
  });

  describe('setCompanyEnabled & setCompanyPriority', () => {
    it('setCompanyEnabled sets enabled flag', async () => {
      const prisma = makeFakePrisma();
      prisma._state.companies.set('c1', { id: 'c1', name: 'Test', enabled: true });
      const result = await setCompanyEnabled(prisma, 'c1', false);
      expect(result?.enabled).toBe(false);
    });

    it('setCompanyPriority sets priority level', async () => {
      const prisma = makeFakePrisma();
      prisma._state.companies.set('c1', { id: 'c1', name: 'Test', priorityLevel: 3 });
      const result = await setCompanyPriority(prisma, 'c1', 1);
      expect(result?.priorityLevel).toBe(1);
    });
  });
});
