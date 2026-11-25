/* eslint-disable @typescript-eslint/no-explicit-any -- structural fake rows */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Own jobs (sprint 13, feature 08): a member adds, edits and deletes a job they found elsewhere; only the owner can
 * touch it; at most 300, checked under the per-member lock; a typed company that is in the catalogue links to it; a link
 * that is not http(s) is refused. Prisma is an in-memory fake that serialises `lockKey` the way Postgres does.
 */

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  jobs: [] as Row[],
  companies: [] as Row[],
  applications: [] as Row[],
  events: [] as Row[],
  prefs: [] as Row[],
  locks: [] as string[],
  seq: 0,
}));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([key, want]) => {
    if (key === 'jobs' && want && typeof want === 'object' && 'none' in want) {
      return !db.jobs.some((job) => job.companyId === row.id);
    }
    return row[key] === want;
  });

const prismaMock = vi.hoisted(() => {
  // A transaction holds the per-key advisory locks it took until it ends.
  const held = new Map<string, Promise<void>>();
  const tx = (release: Array<() => void>) => {
    const company = (row: Row) => db.companies.find((c) => c.id === row.companyId)!;
    return {
      __release: release,
      ladderJob: {
        count: async ({ where }: { where: Row }) => db.jobs.filter((j) => matches(j, where)).length,
        create: async ({ data }: { data: Row }) => {
          const row = { discoveredAt: new Date('2026-12-20T00:00:00Z'), ...data };
          db.jobs.push(row);
          return { ...row, company: company(row) };
        },
        findFirst: async ({ where, include }: { where: Row; include?: Row }) => {
          const row = db.jobs.find((j) => matches(j, where));
          if (!row) return null;
          return include ? { ...row, company: company(row) } : { ...row };
        },
        updateMany: async ({ where, data }: { where: Row; data: Row }) => {
          const rows = db.jobs.filter((j) => matches(j, where));
          for (const row of rows) Object.assign(row, data);
          return { count: rows.length };
        },
        deleteMany: async ({ where }: { where: Row }) => {
          const rows = db.jobs.filter((j) => matches(j, where));
          for (const row of rows) {
            db.jobs.splice(db.jobs.indexOf(row), 1);
            // the database cascades the application (and from it the events and offer)
            const apps = db.applications.filter((a) => a.jobId === row.id);
            for (const app of apps) {
              db.applications.splice(db.applications.indexOf(app), 1);
              db.events = db.events.filter((e) => e.applicationId !== app.id);
            }
          }
          return { count: rows.length };
        },
      },
      ladderCompany: {
        findFirst: async ({ where }: { where: Row }) => db.companies.find((c) => matches(c, where)) ?? null,
        upsert: async ({ where, create }: { where: Row; create: Row }) => {
          const found = db.companies.find((c) => c.normalizedName === where.normalizedName);
          if (found) return found;
          const row = { id: `co-${++db.seq}`, ...create };
          db.companies.push(row);
          return row;
        },
        deleteMany: async ({ where }: { where: Row }) => {
          const rows = db.companies.filter((c) => matches(c, where));
          for (const row of rows) db.companies.splice(db.companies.indexOf(row), 1);
          return { count: rows.length };
        },
      },
      ladderUserPrefs: {
        upsert: async ({ where }: { where: Row }) => {
          if (!db.prefs.some((p) => p.userId === where.userId)) db.prefs.push({ userId: where.userId });
          return {};
        },
      },
      ladderApplication: {
        create: async ({ data }: { data: Row }) => {
          const row = { id: `app-${++db.seq}`, ...data };
          db.applications.push(row);
          return { id: row.id };
        },
        updateMany: async ({ where, data }: { where: Row; data: Row }) => {
          const rows = db.applications.filter((a) => a.jobId === where.jobId && a.userId === where.userId);
          for (const r of rows) Object.assign(r, data);
          return { count: rows.length };
        },
      },
      ladderApplicationEvent: {
        create: async ({ data }: { data: Row }) => {
          db.events.push(data);
          return data;
        },
      },
    };
  };
  return {
    held,
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => {
      const release: Array<() => void> = [];
      try {
        return await fn(tx(release));
      } finally {
        for (const r of release) r();
      }
    },
    ladderJob: {
      findMany: async ({ where }: { where: Row }) =>
        db.jobs
          .filter((j) => matches(j, where))
          .map((j) => ({ ...j, company: db.companies.find((c) => c.id === j.companyId) })),
    },
  };
});

vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (t: { __release: Array<() => void> }, key: string) => {
    db.locks.push(key);
    const held = prismaMock.held;
    while (held.has(key)) await held.get(key);
    let done!: () => void;
    held.set(
      key,
      new Promise<void>((resolve) => {
        done = resolve;
      }),
    );
    t.__release.push(() => {
      held.delete(key);
      done();
    });
  }),
}));

const server = await import('@/lib/rmhladder/own-jobs.server');
const { ownJobBody } = await import('@/lib/rmhladder/own-jobs-schema');
const pure = await import('@/lib/rmhladder/own-jobs');

const body = (over: Record<string, unknown> = {}) =>
  ownJobBody.parse({
    title: 'Data intern at a startup',
    company: 'Tiny Labs',
    link: 'https://example.com/jobs/1',
    ...over,
  });

beforeEach(() => {
  db.jobs.length = 0;
  db.companies.length = 0;
  db.applications.length = 0;
  db.events.length = 0;
  db.prefs.length = 0;
  db.locks.length = 0;
  db.seq = 0;
});

describe('creating an own job', () => {
  it('stores a manual, owned job under an own company and starts an application on it', async () => {
    const result = await server.createOwnJob('u1', body());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const job = db.jobs[0]!;
    expect(job).toMatchObject({
      ownerId: 'u1',
      sourcePlatform: 'manual',
      status: 'active',
      title: 'Data intern at a startup',
      sourceUrl: 'https://example.com/jobs/1',
      originalPostingUrl: 'https://example.com/jobs/1',
    });
    expect(job.dedupeHash).toBe(`own:${job.id}`);
    // never a catalogue row: not classified early-career, so no public filter would pick it up either
    expect(job.earlyCareerClassification).toBeUndefined();
    expect(db.companies[0]).toMatchObject({
      ownerId: 'u1',
      normalizedName: 'own:u1:tiny labs',
      enabled: false,
    });
    expect(db.applications).toEqual([expect.objectContaining({ userId: 'u1', jobId: job.id, status: 'not_applied' })]);
    expect(db.events[0]).toMatchObject({ userId: 'u1', type: 'application_updated' });
    expect(result.value.job).toMatchObject({ id: job.id, title: 'Data intern at a startup', ownCompany: true });
    expect(result.value.applicationId).toBe(db.applications[0]!.id);
  });

  it('puts a typed pay range on the annual axis the catalogue sorts by', async () => {
    await server.createOwnJob('u1', body({ payMin: 20, payMax: 25, payPeriod: 'hour', payCurrency: 'cad' }));
    expect(db.jobs[0]).toMatchObject({
      payMinAnnual: 41_600,
      payMaxAnnual: 52_000,
      payCurrency: 'CAD',
      payPeriod: 'hour',
      compensationMin: 20,
      compensationMax: 25,
    });
  });

  it('links to a catalogue company by name instead of making its own (read-only)', async () => {
    db.companies.push({ id: 'cat-1', name: 'Acme Corp', normalizedName: 'acme', ownerId: null, enabled: true });
    const result = await server.createOwnJob('u1', body({ company: 'ACME Inc.' }));
    expect(result.ok).toBe(true);
    expect(db.jobs[0]!.companyId).toBe('cat-1');
    expect(db.companies).toHaveLength(1);
    if (result.ok) expect(result.value.job.ownCompany).toBe(false);
  });

  it("never links to another member's own company, even with the same name", async () => {
    await server.createOwnJob('u1', body({ company: 'Tiny Labs' }));
    await server.createOwnJob('u2', body({ company: 'Tiny Labs' }));
    expect(db.companies.map((c) => c.normalizedName).sort()).toEqual(['own:u1:tiny labs', 'own:u2:tiny labs']);
    expect(db.jobs[0]!.companyId).not.toBe(db.jobs[1]!.companyId);
  });

  it('refuses a link that is not http(s), has credentials, or is not a URL', () => {
    for (const link of ['javascript:alert(1)', 'ftp://example.com/x', 'https://user:pw@example.com/', 'not a url']) {
      expect(ownJobBody.safeParse({ title: 'A', company: 'B', link }).success, link).toBe(false);
    }
    expect(ownJobBody.safeParse({ title: 'A', company: 'B', link: 'http://example.com/a' }).success).toBe(true);
    expect(ownJobBody.safeParse({ title: 'A', company: 'B' }).success).toBe(true);
  });

  it('bounds the text fields and the pay range', () => {
    expect(ownJobBody.safeParse({ title: 'x'.repeat(161), company: 'B' }).success).toBe(false);
    expect(ownJobBody.safeParse({ title: 'A', company: 'y'.repeat(121) }).success).toBe(false);
    expect(ownJobBody.safeParse({ title: '   ', company: 'B' }).success).toBe(false);
    expect(ownJobBody.safeParse({ title: 'A', company: 'B', payMin: 90, payMax: 80 }).success).toBe(false);
    expect(
      ownJobBody.safeParse({ title: 'A', company: 'B', payMin: 9_000_000, payMax: 9_000_000, payPeriod: 'hour' })
        .success,
    ).toBe(false);
    expect(ownJobBody.safeParse({ title: 'A', company: 'B', deadline: '2026-02-30' }).success).toBe(false);
    expect(ownJobBody.safeParse({ title: 'A', company: 'B', deadline: '2027-03-01' }).success).toBe(true);
  });

  it('keeps the link out of any fetch: it is stored as text and the module never calls fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await server.createOwnJob('u1', body({ link: 'https://169.254.169.254/latest/meta-data' }));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('the 300-job cap', () => {
  it('refuses the 301st with the cap and takes the member lock before counting', async () => {
    for (let i = 0; i < pure.LADDER_OWN_JOB_LIMIT; i++) db.jobs.push({ id: `j${i}`, ownerId: 'u1', companyId: 'x' });
    const result = await server.createOwnJob('u1', body());
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      body: { code: 'LADDER_OWN_JOB_LIMIT', max: 300 },
    });
    expect(db.locks).toEqual(['ladder-own-job:u1']);
    expect(db.jobs).toHaveLength(300);
  });

  it("counts only the member's own jobs: another member's 300 do not block this one", async () => {
    for (let i = 0; i < 300; i++) db.jobs.push({ id: `j${i}`, ownerId: 'u2', companyId: 'x' });
    expect((await server.createOwnJob('u1', body())).ok).toBe(true);
  });

  it('lets exactly one of two concurrent creates at 299 through', async () => {
    for (let i = 0; i < 299; i++) db.jobs.push({ id: `j${i}`, ownerId: 'u1', companyId: 'x' });
    const [a, b] = await Promise.all([
      server.createOwnJob('u1', body()),
      server.createOwnJob('u1', body({ title: 'Other' })),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(db.jobs.filter((j) => j.ownerId === 'u1')).toHaveLength(300);
  });
});

describe('editing and deleting', () => {
  it('lets only the owner edit; anyone else is told it does not exist', async () => {
    const created = await server.createOwnJob('u1', body());
    if (!created.ok) throw new Error('setup');
    const id = created.value.job.id;
    const intruder = await server.updateOwnJob('u2', id, body({ title: 'Hijacked' }));
    expect(intruder).toMatchObject({ ok: false, status: 404 });
    expect(db.jobs[0]!.title).toBe('Data intern at a startup');
    expect(db.applications[0]!.updatedAt).toBeUndefined();
    const mine = await server.updateOwnJob('u1', id, body({ title: 'Data analyst intern', company: 'Bigger Labs' }));
    expect(mine.ok).toBe(true);
    // the edit marks the member's application changed, which the calendar's deadline SEQUENCE follows (s13-09)
    expect(db.applications[0]!.updatedAt).toBeInstanceOf(Date);
    expect(db.jobs[0]!.title).toBe('Data analyst intern');
    // the company changed: the old own company, now empty, is gone with its name
    expect(db.companies.map((c) => c.normalizedName)).toEqual(['own:u1:bigger labs']);
  });

  it('lets only the owner delete, and deleting removes the application, its events and the empty own company', async () => {
    const created = await server.createOwnJob('u1', body());
    if (!created.ok) throw new Error('setup');
    const id = created.value.job.id;
    expect(await server.deleteOwnJob('u2', id)).toMatchObject({ ok: false, status: 404 });
    expect(db.jobs).toHaveLength(1);
    expect(await server.deleteOwnJob('u1', id)).toMatchObject({ ok: true });
    expect(db.jobs).toHaveLength(0);
    expect(db.applications).toHaveLength(0);
    expect(db.events).toHaveLength(0);
    expect(db.companies).toHaveLength(0);
    expect(await server.deleteOwnJob('u1', id)).toMatchObject({ ok: false, status: 404 });
  });

  it('keeps a catalogue company when an own job linked to it is deleted', async () => {
    db.companies.push({ id: 'cat-1', name: 'Acme', normalizedName: 'acme', ownerId: null, enabled: true });
    const created = await server.createOwnJob('u1', body({ company: 'Acme' }));
    if (!created.ok) throw new Error('setup');
    await server.deleteOwnJob('u1', created.value.job.id);
    expect(db.companies.map((c) => c.id)).toEqual(['cat-1']);
  });

  it('lists only the caller’s own jobs', async () => {
    await server.createOwnJob('u1', body());
    await server.createOwnJob('u2', body({ title: 'Theirs' }));
    expect((await server.listOwnJobs('u1')).map((j) => j.title)).toEqual(['Data intern at a startup']);
  });
});

describe('the write guard', () => {
  const guard = (rows: Record<string, Row>) => ({
    ladderJob: { findUnique: async ({ where }: { where: { id: string } }) => rows[where.id] ?? null },
  });

  it('accepts a catalogue job and the caller’s own job, refuses another member’s and a missing id alike', async () => {
    const prisma = guard({ cat: { ownerId: null }, mine: { ownerId: 'u1' }, theirs: { ownerId: 'u2' } });
    await expect(pure.assertJobUsable(prisma, 'u1', 'cat')).resolves.toBeUndefined();
    await expect(pure.assertJobUsable(prisma, 'u1', 'mine')).resolves.toBeUndefined();
    await expect(pure.assertJobUsable(prisma, 'u1', 'theirs')).rejects.toBeInstanceOf(pure.JobNotFoundError);
    await expect(pure.assertJobUsable(prisma, 'u1', 'gone')).rejects.toBeInstanceOf(pure.JobNotFoundError);
  });
});

describe('the fragments and the view', () => {
  it('are the shapes every reader relies on', () => {
    expect(pure.catalogJobWhere()).toEqual({ ownerId: null });
    expect(pure.catalogCompanyWhere()).toEqual({ ownerId: null });
    expect(pure.ownerOrCatalogJobWhere('u1')).toEqual({ OR: [{ ownerId: null }, { ownerId: 'u1' }] });
  });

  it('maps a job row back to the editable view', () => {
    const view = pure.ownJobViewOf({
      id: 'j1',
      title: 'T',
      company: { name: 'C', ownerId: 'u1' },
      originalPostingUrl: '',
      locationRaw: 'Remote-ish',
      remoteStatus: 'hybrid',
      employmentType: 'full_time',
      applicationDeadline: new Date('2027-03-01T12:00:00Z'),
      compensationMin: 20,
      compensationMax: 30,
      payPeriod: 'hour',
      payCurrency: 'EUR',
      discoveredAt: new Date('2026-12-20T00:00:00Z'),
    });
    expect(view).toMatchObject({
      link: null,
      location: 'Remote-ish',
      deadline: '2027-03-01',
      payMin: 20,
      payPeriod: 'hour',
      payCurrency: 'EUR',
      ownCompany: true,
    });
  });

  it('builds the own-company key from the member and the normalised name', () => {
    expect(server.ownCompanyKey('u1', 'The Tiny Labs, LLC')).toBe('own:u1:the tiny labs');
  });
});
