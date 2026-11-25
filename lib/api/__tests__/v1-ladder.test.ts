/**
 * `/api/v1/me/ladder/*`, driven through the real developer-API wrapper, the real `updateApplication` and 08's real
 * `createOwnJob` over an in-memory RMHLadder database: the explicit scopes (and that no wildcard or default grant
 * reaches them), the key owner's own rows only, one timeline event per PATCH and idempotent replay, the own-job cap
 * in the API's error envelope, and no offer, pay, resume or contact field in any response or any `select`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- structural rows

const h = vi.hoisted(() => ({
  keyRow: { current: null as Record<string, unknown> | null },
  apps: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  jobs: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  events: [] as Record<string, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
  idem: new Map<string, Record<string, unknown>>(),
  selects: [] as unknown[],
  nextId: 1,
  clock: 0,
}));

const stamp = () => new Date(Date.UTC(2026, 10, 20, 12, 0, 0) + ++h.clock * 60_000);

function jobOk(job: Row | undefined, filter: Row | undefined): boolean {
  if (!job) return false;
  if (!filter) return true;
  if (Array.isArray(filter.OR)) return filter.OR.some((f: Row) => jobOk(job, f));
  return Object.entries(filter).every(([k, v]) => job[k] === v);
}

function appOk(a: Row, where: Row): boolean {
  if (where.id !== undefined && a.id !== where.id) return false;
  if (where.userId !== undefined && a.userId !== where.userId) return false;
  if (where.status?.in && !where.status.in.includes(a.status)) return false;
  if (
    where.job &&
    !jobOk(
      h.jobs.find((j) => j.id === a.jobId),
      where.job,
    )
  )
    return false;
  if (Array.isArray(where.OR)) {
    const ok = where.OR.some((c: Row) => {
      if (c.updatedAt?.lt) return a.updatedAt < c.updatedAt.lt;
      return a.updatedAt.getTime() === c.updatedAt.getTime() && a.id < c.id.lt;
    });
    if (!ok) return false;
  }
  return true;
}

const shapeApp = (a: Row) => {
  const job = h.jobs.find((j) => j.id === a.jobId);
  return { ...a, job: { ...job, company: { name: job?.companyName } } };
};

vi.mock('@/lib/prisma.server', () => {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    ladderJob: {
      count: async ({ where }: { where: Row }) => h.jobs.filter((j) => j.ownerId === where.ownerId).length,
      create: async ({ data }: { data: Row }) => {
        const row = {
          ...data,
          companyName: 'Initech',
          discoveredAt: stamp(),
          company: { id: 'co1', name: 'Initech', ownerId: data.ownerId },
        };
        h.jobs.push(row);
        return row;
      },
    },
    ladderCompany: {
      findFirst: async () => null,
      upsert: async () => ({ id: 'co1' }),
    },
    ladderUserPrefs: { upsert: async () => ({}) },
    ladderApplication: {
      create: async ({ data }: { data: Row }) => {
        const row = {
          id: `app${h.nextId++}`,
          ...data,
          interviewDates: [],
          appliedDate: null,
          followUpDate: null,
          notes: null,
          updatedAt: stamp(),
        };
        h.apps.push(row);
        return { id: row.id };
      },
    },
    ladderApplicationEvent: {
      create: async ({ data }: { data: Row }) => {
        h.events.push({ id: `evt${h.nextId++}`, createdAt: stamp(), ...data });
        return {};
      },
    },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      ladderJob: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const j = h.jobs.find((x) => x.id === where.id);
          return j ? { ownerId: j.ownerId } : null;
        },
      },
      ladderUserPrefs: tx.ladderUserPrefs,
      ladderApplication: {
        findMany: async (args: { where: Row; take: number; select: unknown }) => {
          h.selects.push(args.select);
          return h.apps
            .filter((a) => appOk(a, args.where))
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1))
            .slice(0, args.take)
            .map(shapeApp);
        },
        findFirst: async (args: { where: Row; select: unknown }) => {
          h.selects.push(args.select);
          const a = h.apps.find((x) => appOk(x, args.where));
          return a ? shapeApp(a) : null;
        },
        findUnique: async ({ where }: { where: { userId_jobId: { userId: string; jobId: string } } }) =>
          // a copy, as a database returns: the row read before the update must keep the old status
          ((a) => (a ? { ...a } : null))(
            h.apps.find((x) => x.userId === where.userId_jobId.userId && x.jobId === where.userId_jobId.jobId),
          ),
        upsert: async ({ where, create, update }: { where: { userId_jobId: Row }; create: Row; update: Row }) => {
          let a = h.apps.find((x) => x.userId === where.userId_jobId.userId && x.jobId === where.userId_jobId.jobId);
          if (a) Object.assign(a, update, { updatedAt: stamp() });
          else {
            a = {
              id: `app${h.nextId++}`,
              interviewDates: [],
              appliedDate: null,
              followUpDate: null,
              notes: null,
              ...create,
              updatedAt: stamp(),
            };
            h.apps.push(a);
          }
          return a;
        },
      },
      ladderApplicationEvent: {
        ...tx.ladderApplicationEvent,
        findMany: async (args: { where: Row; take: number; select: unknown }) => {
          h.selects.push(args.select);
          return h.events
            .filter((e) => e.applicationId === args.where.applicationId && e.userId === args.where.userId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, args.take);
        },
      },
      developerApiKey: { findUnique: vi.fn(async () => h.keyRow.current), update: vi.fn(async () => ({})) },
      apiKeyRefusalDaily: { upsert: vi.fn(async () => ({})) },
      apiIdempotencyKey: {
        findUnique: vi.fn(
          async ({ where }: { where: { keyId_idempotency: { keyId: string; idempotency: string } } }) =>
            h.idem.get(where.keyId_idempotency.idempotency) ?? null,
        ),
        create: vi.fn(async ({ data }: { data: { idempotency: string } }) => {
          h.idem.set(data.idempotency, data);
          return {};
        }),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
    },
  };
});
vi.mock('@/lib/entitlements', () => ({ getUserTier: vi.fn(async () => 'starter'), hasApiAccess: () => true }));
vi.mock('@/lib/admin-audit.server', () => ({ getActiveBan: vi.fn(async () => null) }));
vi.mock('@/lib/redis.server', () => ({
  redisRateLimit: vi.fn(async () => null),
  redisIncrBy: vi.fn(async () => null),
}));
vi.mock('@/lib/api/usage.server', () => ({ recordUsage: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

const routes = {
  list: handlersOf<TestHandler>((await import('../../../app/routes/api/v1/me/ladder/applications')).Route),
  one: handlersOf<TestHandler>((await import('../../../app/routes/api/v1/me/ladder/applications/$id')).Route),
  own: handlersOf<TestHandler>((await import('../../../app/routes/api/v1/me/ladder/own-jobs')).Route),
};
const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');
const { DEFAULT_SCOPES } = await import('@/lib/api/scopes');
const { LADDER_OWN_JOB_LIMIT } = await import('@/lib/rmhladder/own-jobs');

const OWNER = 'owner_1';
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;
const BASE = '/api/v1/me/ladder';

function key(scopes: string[]) {
  return {
    id: 'key_1',
    userId: OWNER,
    revokedAt: null,
    expiresAt: null,
    scopes,
    testMode: false,
    allowedCidrs: [] as string[],
    rateLimitPerMinute: null,
  };
}

async function call(
  handler: TestHandler | undefined,
  method: string,
  path: string,
  opts: { params?: Record<string, string>; body?: unknown; idem?: string } = {},
) {
  if (!handler) throw new Error(`no ${method} handler`);
  const res = await handler({
    request: new Request(`https://rmhstudios.com${path}`, {
      method,
      headers: {
        authorization: BEARER,
        'cf-connecting-ip': '203.0.113.9',
        ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(opts.idem ? { 'idempotency-key': opts.idem } : {}),
      },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    }),
    params: opts.params ?? {},
  });
  const json = await res
    .clone()
    .json()
    .catch(() => null);
  return { res, json };
}

const listApps = (q = '') => call(routes.list.GET, 'GET', `${BASE}/applications${q}`);
const getApp = (id: string) => call(routes.one.GET, 'GET', `${BASE}/applications/${id}`, { params: { id } });
const patchApp = (id: string, body: unknown, idem?: string) =>
  call(routes.one.PATCH, 'PATCH', `${BASE}/applications/${id}`, { params: { id }, body, ...(idem ? { idem } : {}) });
const addJob = (body: unknown, idem?: string) =>
  call(routes.own.POST, 'POST', `${BASE}/own-jobs`, { body, ...(idem ? { idem } : {}) });

function seed() {
  h.jobs.push(
    {
      id: 'jobA',
      ownerId: null,
      title: 'Software Engineer Intern',
      companyName: 'Acme',
      locationRaw: 'Rochester, NY',
      remoteStatus: 'hybrid',
      originalPostingUrl: 'https://acme.example/i',
      applicationDeadline: new Date('2026-12-15T12:00:00Z'),
    },
    {
      id: 'jobMine',
      ownerId: OWNER,
      title: 'Own role',
      companyName: 'Initech',
      locationRaw: null,
      remoteStatus: 'onsite',
      originalPostingUrl: '',
      applicationDeadline: null,
    },
    {
      id: 'jobTheirs',
      ownerId: 'other',
      title: 'Secret startup role',
      companyName: 'Secret Startup',
      locationRaw: null,
      remoteStatus: 'onsite',
      originalPostingUrl: '',
      applicationDeadline: null,
    },
  );
  const base = {
    interviewDates: [] as Date[],
    appliedDate: null,
    followUpDate: null,
    notes: null,
    resumeVersion: 'secret-resume',
    contactEmail: 'recruiter@example.test',
    referralName: 'Pat',
    coverLetter: 'dear',
    outcome: 'x',
  };
  h.apps.push(
    {
      id: 'appA',
      userId: OWNER,
      jobId: 'jobA',
      status: 'applied',
      ...base,
      notes: 'my note',
      updatedAt: new Date('2026-11-20T10:00:00Z'),
    },
    {
      id: 'appMine',
      userId: OWNER,
      jobId: 'jobMine',
      status: 'planning',
      ...base,
      updatedAt: new Date('2026-11-21T10:00:00Z'),
    },
    {
      id: 'appOther',
      userId: 'other',
      jobId: 'jobTheirs',
      status: 'applied',
      ...base,
      updatedAt: new Date('2026-11-22T10:00:00Z'),
    },
    // a row that should never exist: this member's application on another member's own job
    {
      id: 'appStray',
      userId: OWNER,
      jobId: 'jobTheirs',
      status: 'applied',
      ...base,
      updatedAt: new Date('2026-11-23T10:00:00Z'),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.apps.length = 0;
  h.jobs.length = 0;
  h.events.length = 0;
  h.idem.clear();
  h.selects.length = 0;
  h.nextId = 1;
  h.clock = 0;
  seed();
  h.keyRow.current = key(['read:ladder', 'write:ladder']);
});

const FORBIDDEN = /offer|pay|compensation|salary|resume|contact|referral|cover|outcome|email|phone/i;
function keysOf(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      keysOf(x, out);
    }
  return out;
}

describe('scopes', () => {
  const calls = [
    () => listApps(),
    () => getApp('appA'),
    () => patchApp('appA', { notes: 'x' }),
    () => addJob({ title: 'T', company: 'C' }),
  ];

  it.each([['*'], ['read:*'], ['write:*'], ['read:*', 'write:*', 'manage:*'], DEFAULT_SCOPES])(
    'a key with only %s cannot reach RMHLadder (403 insufficient_scope) and nothing is written',
    async (...scopes) => {
      h.keyRow.current = key(scopes.flat());
      for (const run of calls) {
        const { res, json } = await run();
        expect(res.status).toBe(403);
        expect(json?.error.code).toBe('insufficient_scope');
      }
      expect(h.events).toHaveLength(0);
      expect(h.apps).toHaveLength(4);
    },
  );

  it('read:ladder reads and cannot write; write:ladder writes and cannot read', async () => {
    h.keyRow.current = key(['read:ladder']);
    expect((await listApps()).res.status).toBe(200);
    expect((await getApp('appA')).res.status).toBe(200);
    expect((await patchApp('appA', { status: 'interviewing' })).res.status).toBe(403);
    expect((await addJob({ title: 'T', company: 'C' })).res.status).toBe(403);
    h.keyRow.current = key(['write:ladder']);
    expect((await listApps()).res.status).toBe(403);
    expect((await getApp('appA')).res.status).toBe(403);
    expect((await patchApp('appA', { status: 'interviewing' })).res.status).toBe(200);
  });
});

describe('reads', () => {
  it('lists the key owner’s applications with their jobs’ titles and companies, newest change first', async () => {
    const { res, json } = await listApps();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(json?.data.map((a: Row) => a.id)).toEqual(['appMine', 'appA']);
    expect(json?.data[1]).toMatchObject({
      status: 'applied',
      notes: 'my note',
      job: { title: 'Software Engineer Intern', company: 'Acme', remote: 'hybrid', deadline: '2026-12-15', own: false },
    });
    expect(json?.data[0].job).toMatchObject({ title: 'Own role', company: 'Initech', own: true, url: null });
  });

  it('never returns another member’s application, own job or id (404, the same as a missing one)', async () => {
    const { json } = await listApps();
    const text = JSON.stringify(json);
    expect(text).not.toContain('appOther');
    expect(text).not.toContain('Secret');
    expect((await getApp('appOther')).res.status).toBe(404);
    expect((await getApp('appStray')).res.status).toBe(404);
    expect((await getApp('nope')).res.status).toBe(404);
  });

  it('filters by status (one, or a comma-separated list) and refuses an unknown one', async () => {
    expect((await listApps('?status=planning')).json?.data.map((a: Row) => a.id)).toEqual(['appMine']);
    expect((await listApps('?status=planning,applied')).json?.data).toHaveLength(2);
    expect((await listApps('?status=hired')).res.status).toBe(400);
  });

  it('pages with an opaque cursor and refuses a bad one', async () => {
    const first = await listApps('?limit=1');
    expect(first.json?.data.map((a: Row) => a.id)).toEqual(['appMine']);
    expect(first.json?.nextCursor).toEqual(expect.any(String));
    const second = await listApps(`?limit=1&cursor=${first.json?.nextCursor}`);
    expect(second.json?.data.map((a: Row) => a.id)).toEqual(['appA']);
    expect(second.json?.nextCursor).toBeNull();
    expect((await listApps('?cursor=***')).res.status).toBe(400);
    expect((await listApps('?limit=500')).res.status).toBe(400);
  });

  it('a detail carries its timeline, newest first, as field names only', async () => {
    await patchApp('appA', { status: 'interviewing', notes: 'secret value' });
    const { json } = await getApp('appA');
    expect(json?.data.events).toHaveLength(1);
    expect(json?.data.events[0]).toMatchObject({
      type: 'status_changed',
      fromStatus: 'applied',
      toStatus: 'interviewing',
      fields: ['status', 'notes'],
    });
    expect(JSON.stringify(json?.data.events)).not.toContain('secret value');
  });
});

describe('PATCH', () => {
  it('moves an application to interviewing and records exactly one event the site timeline shows', async () => {
    const { res, json } = await patchApp('appA', { status: 'interviewing', interviewDates: ['2026-12-02T15:00:00Z'] });
    expect(res.status).toBe(200);
    expect(json?.data).toMatchObject({
      id: 'appA',
      status: 'interviewing',
      interviewDates: ['2026-12-02T15:00:00.000Z'],
    });
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({
      applicationId: 'appA',
      userId: OWNER,
      type: 'status_changed',
      fromStatus: 'applied',
      toStatus: 'interviewing',
    });
  });

  it('a change that is not a status change records one application_updated event; null clears notes', async () => {
    const { json } = await patchApp('appA', { notes: null, followUpDate: '2026-12-03' });
    expect(json?.data).toMatchObject({ notes: null, followUpDate: '2026-12-03T00:00:00.000Z' });
    expect(h.events.map((e) => e.type)).toEqual(['application_updated']);
  });

  it('is idempotent: a retry with the same Idempotency-Key replays and records no second event', async () => {
    const first = await patchApp('appA', { status: 'interviewing' }, 'idem-1');
    const again = await patchApp('appA', { status: 'interviewing' }, 'idem-1');
    expect(first.res.status).toBe(200);
    expect(again.res.headers.get('idempotency-replayed')).toBe('true');
    expect(again.json).toEqual(first.json);
    expect(h.events).toHaveLength(1);
    const clash = await patchApp('appA', { status: 'rejected' }, 'idem-1');
    expect(clash.res.status).toBe(409);
    expect(clash.json?.error.code).toBe('idempotency_conflict');
  });

  it('refuses another member’s application and writes nothing', async () => {
    for (const id of ['appOther', 'appStray', 'nope']) {
      expect((await patchApp(id, { status: 'rejected' })).res.status).toBe(404);
    }
    expect(h.events).toHaveLength(0);
    expect(h.apps.find((a) => a.id === 'appOther')?.status).toBe('applied');
  });

  it.each([
    [{ payMin: 1 }],
    [{ resumeVersionId: 'r1' }],
    [{ contactEmail: 'a@b.test' }],
    [{ referralName: 'Pat' }],
    [{ coverLetter: 'x' }],
    [{ outcome: 'x' }],
    [{ jobId: 'jobTheirs' }],
    [{}],
    [{ status: 'hired' }],
    [{ followUpDate: 'tomorrow' }],
    [{ notes: 'x'.repeat(2001) }],
  ])('rejects %j with 400 and writes nothing', async (body) => {
    const { res } = await patchApp('appA', body);
    expect(res.status).toBe(400);
    expect(h.events).toHaveLength(0);
    expect(h.apps.find((a) => a.id === 'appA')?.resumeVersion).toBe('secret-resume');
  });
});

describe('POST own-jobs', () => {
  it('adds an own job through the site’s create and answers 201 with the application it opens', async () => {
    const { res, json } = await addJob({ title: 'Platform Intern', company: 'Initech', remoteStatus: 'hybrid' });
    expect(res.status).toBe(201);
    expect(json?.data).toMatchObject({
      status: 'not_applied',
      job: { title: 'Platform Intern', own: true, remote: 'hybrid' },
    });
    expect(h.jobs.filter((j) => j.ownerId === OWNER)).toHaveLength(2);
    expect(h.events.map((e) => e.data)).toEqual([{ fields: ['created'], source: 'own_job' }]);
  });

  it('is idempotent under the same Idempotency-Key', async () => {
    await addJob({ title: 'Platform Intern', company: 'Initech' }, 'idem-job');
    const again = await addJob({ title: 'Platform Intern', company: 'Initech' }, 'idem-job');
    expect(again.res.headers.get('idempotency-replayed')).toBe('true');
    expect(h.jobs.filter((j) => j.ownerId === OWNER)).toHaveLength(2);
  });

  it('refuses the 301st own job with the site’s refusal in the API’s envelope (409 conflict)', async () => {
    for (let i = 0; i < LADDER_OWN_JOB_LIMIT - 2; i++) h.jobs.push({ id: `fill${i}`, ownerId: OWNER });
    expect((await addJob({ title: 'Last one', company: 'Initech' })).res.status).toBe(201);
    const { res, json } = await addJob({ title: 'One too many', company: 'Initech' });
    expect(res.status).toBe(409);
    expect(json?.error).toMatchObject({ type: 'conflict_error', code: 'conflict', request_id: expect.any(String) });
    expect(json?.error.message).toContain(String(LADDER_OWN_JOB_LIMIT));
    expect(h.jobs.filter((j) => j.ownerId === OWNER)).toHaveLength(LADDER_OWN_JOB_LIMIT);
  });

  it.each([
    [{ title: 'T' }],
    [{ title: '', company: 'C' }],
    [{ title: 'T', company: 'C', payMin: 100 }],
    [{ title: 'T', company: 'C', payCurrency: 'USD' }],
    [{ title: 'T', company: 'C', link: 'javascript:alert(1)' }],
    [{ title: 'T', company: 'C', deadline: 'soon' }],
    [{ title: 'T', company: 'C', remoteStatus: 'moon' }],
  ])('rejects %j with 400 and adds nothing', async (body) => {
    const { res } = await addJob(body);
    expect(res.status).toBe(400);
    expect(h.jobs.filter((j) => j.ownerId === OWNER)).toHaveLength(1);
  });
});

describe('what never leaves', () => {
  it('no response carries an offer, pay, resume, contact, referral, cover letter or outcome field', async () => {
    const bodies = [
      (await listApps()).json,
      (await getApp('appA')).json,
      (await patchApp('appA', { status: 'interviewing' })).json,
      (await addJob({ title: 'Platform Intern', company: 'Initech' })).json,
    ];
    for (const body of bodies) {
      expect(body).not.toBeNull();
      expect(keysOf(body).filter((k) => FORBIDDEN.test(k))).toEqual([]);
      const text = JSON.stringify(body);
      for (const secret of ['secret-resume', 'recruiter@example.test', 'dear', 'Pat']) {
        expect(text).not.toContain(`"${secret}"`);
      }
    }
  });

  it('no select the module sends to the database names one of those columns', () => {
    return Promise.all([listApps(), getApp('appA')]).then(() => {
      expect(h.selects.length).toBeGreaterThan(0);
      for (const select of h.selects) {
        expect(keysOf(select).filter((k) => FORBIDDEN.test(k))).toEqual([]);
      }
    });
  });
});
