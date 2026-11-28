/**
 * s12-15 /admin/homes, through the real endpoint wrapper with Prisma, pg-boss and DNS stood in for: admins only; the
 * status change is a compare-and-set on the status the admin saw (a stale one is a conflict); an `http:` or
 * private-address feed is refused before it is stored; a feed already stored (by key) is refused; run now sends one job
 * with trigger MANUAL and refuses while one is queued; every action is audited in its transaction; no row carries a
 * feed's query string.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; isAdmin: boolean } } | null,
  sources: [] as Row[],
  listings: [] as Row[],
  runs: [] as Row[],
  audits: [] as { adminId: string; action: string; opts: Record<string, unknown> }[],
  auditInTx: [] as boolean[],
  txDepth: 0,
  failAudit: false,
  boss: null as null | {
    sent: { queue: string; data: unknown }[];
    queued: boolean;
    queueExists: boolean;
    throwOnSend: Error | null;
  },
  dns: new Map<string, string>(),
  nextId: 1,
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/admin-audit.server', () => ({
  recordAdminActionIn: vi.fn(async (_tx: unknown, adminId: string, action: string, opts: Record<string, unknown>) => {
    h.auditInTx.push(h.txDepth > 0);
    if (h.failAudit) throw new Error('audit down');
    h.audits.push({ adminId, action, opts });
  }),
}));
vi.mock('@/lib/jobs/boss.server', () => ({
  PGBOSS_SCHEMA: 'pgboss',
  getBoss: vi.fn(async () => {
    const b = h.boss;
    if (!b) return null;
    return {
      getQueue: vi.fn(async () => (b.queueExists ? { name: 'homes.scrape' } : null)),
      send: vi.fn(async (queue: string, data: unknown) => {
        if (b.throwOnSend) throw b.throwOnSend;
        // The queue is exclusive: a second send while one is queued or active makes no job.
        if (b.queued) return null;
        b.queued = true;
        b.sent.push({ queue, data });
        return 'job-1';
      }),
    };
  }),
}));
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => {
    const address = h.dns.get(host);
    if (!address) throw new Error('ENOTFOUND');
    return [{ address, family: address.includes(':') ? 6 : 4 }];
  }),
}));

const matchStatus = (row: Row, cond: unknown): boolean => {
  if (cond === undefined) return true;
  if (typeof cond === 'string') return row.status === cond;
  const c = cond as { not?: string; in?: string[] };
  if (c.not !== undefined) return row.status !== c.not;
  if (c.in) return c.in.includes(row.status as string);
  return true;
};
const matchWhere = (row: Row, where: Row | undefined): boolean => {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'status') {
      if (!matchStatus(row, v)) return false;
    } else if (typeof v === 'object' && v !== null && 'in' in v) {
      if (!(v as { in: unknown[] }).in.includes(row[k])) return false;
    } else if (row[k] !== v) return false;
  }
  return true;
};

vi.mock('@/lib/prisma.server', async () => {
  const { Prisma } = await import('@prisma/client');
  const homeSource = {
    findMany: vi.fn(async () => h.sources.map((s) => ({ ...s }))),
    findUnique: vi.fn(async (a: Row) => {
      const w = a.where as Row;
      const r = h.sources.find((s) => (w.id ? s.id === w.id : s.key === w.key));
      return r ? { ...r } : null;
    }),
    updateMany: vi.fn(async (a: Row) => {
      const hit = h.sources.filter((s) => matchWhere(s, a.where as Row));
      for (const s of hit) Object.assign(s, a.data);
      return { count: hit.length };
    }),
    create: vi.fn(async (a: Row) => {
      const data = a.data as Row;
      if (h.sources.some((s) => s.key === data.key))
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      const row: Row = {
        id: `src-new-${h.nextId++}`,
        status: 'ACTIVE',
        lastError: null,
        lastRunAt: null,
        lastSuccessAt: null,
        ...data,
      };
      h.sources.push(row);
      return { ...row };
    }),
  };
  const homeListing = {
    groupBy: vi.fn(async (a: { where: Row }) => {
      const counts = new Map<string, number>();
      for (const l of h.listings) {
        if (l.source !== a.where.source || l.status !== a.where.status) continue;
        const ids = (a.where.sourceRefId as { in: string[] }).in;
        if (!ids.includes(l.sourceRefId as string)) continue;
        counts.set(l.sourceRefId as string, (counts.get(l.sourceRefId as string) ?? 0) + 1);
      }
      return [...counts].map(([sourceRefId, n]) => ({ sourceRefId, _count: { _all: n } }));
    }),
  };
  const homeScrapeRun = {
    findMany: vi.fn(async (a: { take: number }) => h.runs.slice(0, a.take).map((r) => ({ ...r }))),
  };
  const prisma = {
    homeSource,
    homeListing,
    homeScrapeRun,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const sources = h.sources.map((s) => ({ ...s }));
      const audits = h.audits.length;
      h.txDepth++;
      try {
        return await fn(prisma);
      } catch (e) {
        h.sources = sources;
        h.audits.length = audits;
        throw e;
      } finally {
        h.txDepth--;
      }
    },
  };
  return { prisma };
});

const source = (over: Row = {}): Row => ({
  id: 's1',
  key: 'rss:feeds.example.com/rochester/rentals',
  provider: 'RSS',
  label: 'Rochester Rentals',
  listingType: 'RENT',
  url: 'https://feeds.example.com/rochester/rentals',
  status: 'ACTIVE',
  lastError: null,
  lastRunAt: null,
  lastSuccessAt: null,
  ...over,
});

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const MODULES = {
  list: () => import('@/lib/admin/api/admin.homes.server'),
  status: () => import('@/lib/admin/api/admin.homes.sources.$id.status.server'),
  scrape: () => import('@/lib/admin/api/admin.homes.scrape.server'),
};

async function call(
  which: keyof typeof MODULES,
  method: 'GET' | 'POST',
  opts: { params?: Record<string, string>; body?: unknown } = {},
) {
  const mod = await MODULES[which]();
  const handlers = mod.route.handlers as unknown as Record<string, Handler>;
  const res = await handlers[method]!({
    request: new Request('https://rmhstudios.com/api/admin/homes', {
      method,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    }),
    params: opts.params ?? {},
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const admin = () => {
  h.session = { user: { id: 'admin-1', isAdmin: true } };
};

const NEW_FEED = {
  label: 'Buffalo rentals',
  url: 'https://feeds.example.com/buffalo/rentals/?key=sekret-1',
  listingType: 'RENT',
  defaultCity: 'Buffalo',
  defaultState: 'NY',
  defaultLat: 42.8864,
  defaultLng: -78.8784,
};

beforeEach(() => {
  h.session = null;
  h.sources = [source()];
  h.listings = [];
  h.runs = [];
  h.audits = [];
  h.auditInTx = [];
  h.txDepth = 0;
  h.failAudit = false;
  h.boss = { sent: [], queued: false, queueExists: true, throwOnSend: null };
  h.dns = new Map([
    ['feeds.example.com', '93.184.216.34'],
    ['internal.example.com', '10.0.0.5'],
  ]);
  h.nextId = 1;
});

describe('admin only', () => {
  it('refuses a signed-out caller and a member on every endpoint', async () => {
    const attempts: [keyof typeof MODULES, 'GET' | 'POST', Record<string, unknown>][] = [
      ['list', 'GET', {}],
      ['list', 'POST', { body: NEW_FEED }],
      ['status', 'POST', { params: { id: 's1' }, body: { action: 'pause', seen: 'ACTIVE' } }],
      ['scrape', 'POST', {}],
    ];
    for (const [which, method, opts] of attempts) {
      expect((await call(which, method, opts)).status).toBe(401);
    }
    h.session = { user: { id: 'u9', isAdmin: false } };
    for (const [which, method, opts] of attempts) {
      expect((await call(which, method, opts)).status).toBe(403);
    }
    expect(h.sources).toEqual([source()]);
    expect(h.audits).toEqual([]);
    expect(h.boss!.sent).toEqual([]);
  });
});

describe('the list', () => {
  it('puts ERROR and BLOCKED first, counts active external listings, and never shows a feed query', async () => {
    admin();
    h.sources = [
      source({ id: 'a', label: 'Active feed' }),
      source({ id: 'p', label: 'Paused feed', status: 'DISABLED' }),
      source({
        id: 'r',
        label: 'Rss feed',
        provider: 'RSS',
        status: 'ERROR',
        key: 'rss:feeds.example.com/x',
        url: 'https://feeds.example.com/x?key=sekret-2',
        lastError: 'HTTP 500 '.repeat(60),
      }),
      source({ id: 'b', label: 'Blocked feed', status: 'BLOCKED', lastError: 'robots.txt disallows this feed' }),
    ];
    h.listings = [
      { sourceRefId: 'a', source: 'EXTERNAL', status: 'ACTIVE' },
      { sourceRefId: 'a', source: 'EXTERNAL', status: 'ACTIVE' },
      { sourceRefId: 'a', source: 'EXTERNAL', status: 'REMOVED' },
      { sourceRefId: 'r', source: 'COMMUNITY', status: 'ACTIVE' },
    ];
    h.runs = [
      {
        id: 'run1',
        trigger: 'MANUAL',
        startedAt: new Date('2026-12-01T10:00:00Z'),
        finishedAt: new Date('2026-12-01T10:00:42Z'),
        discoveredCount: 9,
        createdCount: 3,
        updatedCount: 5,
        expiredCount: 1,
        errorCount: 0,
      },
    ];
    const { status, json } = await call('list', 'GET');
    expect(status).toBe(200);
    const sources = json!.sources as {
      id: string;
      activeListings: number;
      lastError: string | null;
      feed: string | null;
    }[];
    expect(sources.map((s) => s.id)).toEqual(['r', 'b', 'a', 'p']);
    expect(sources.find((s) => s.id === 'a')!.activeListings).toBe(2);
    expect(sources.find((s) => s.id === 'r')!.activeListings).toBe(0);
    expect(sources.find((s) => s.id === 'r')!.lastError!.length).toBeLessThanOrEqual(200);
    expect(sources.find((s) => s.id === 'r')!.feed).toBe('feeds.example.com/x');
    expect(JSON.stringify(json)).not.toContain('sekret-2');
    expect(json!.runs).toEqual([
      expect.objectContaining({ id: 'run1', trigger: 'MANUAL', durationMs: 42_000, discovered: 9, created: 3 }),
    ]);
  });

  it('shows at most 20 runs', async () => {
    admin();
    h.runs = Array.from({ length: 30 }, (_, i) => ({
      id: `r${i}`,
      trigger: 'CRON',
      startedAt: new Date(2026, 11, 1, 0, i),
      finishedAt: null,
      discoveredCount: 0,
      createdCount: 0,
      updatedCount: 0,
      expiredCount: 0,
      errorCount: 0,
    }));
    const { json } = await call('list', 'GET');
    expect(json!.runs).toHaveLength(20);
    expect((json!.runs as { durationMs: number | null }[])[0]!.durationMs).toBeNull();
  });
});

describe('pause and resume are a compare-and-set, audited', () => {
  it('pauses an active source, writing once with the status the admin saw in the where', async () => {
    admin();
    const { status, json } = await call('status', 'POST', {
      params: { id: 's1' },
      body: { action: 'pause', seen: 'ACTIVE' },
    });
    expect(status).toBe(200);
    expect((json!.source as { status: string }).status).toBe('DISABLED');
    expect(h.sources[0]!.status).toBe('DISABLED');
    expect(h.audits).toEqual([
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'homes.source.pause',
        opts: expect.objectContaining({ targetType: 'home_source', targetId: 's1' }),
      }),
    ]);
    expect(h.auditInTx).toEqual([true]);
    const { prisma } = await import('@/lib/prisma.server');
    expect(prisma.homeSource.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1', status: 'ACTIVE' } }),
    );
  });

  it.each(['ERROR', 'BLOCKED'])('pauses a source the admin saw in %s', async (seen) => {
    admin();
    h.sources = [source({ status: seen, lastError: 'boom' })];
    const { status } = await call('status', 'POST', { params: { id: 's1' }, body: { action: 'pause', seen } });
    expect(status).toBe(200);
    expect(h.sources[0]!.status).toBe('DISABLED');
  });

  it('resumes a paused source and clears its last error', async () => {
    admin();
    h.sources = [source({ status: 'DISABLED', lastError: 'old problem' })];
    const { status, json } = await call('status', 'POST', {
      params: { id: 's1' },
      body: { action: 'resume', seen: 'DISABLED' },
    });
    expect(status).toBe(200);
    expect(h.sources[0]).toMatchObject({ status: 'ACTIVE', lastError: null });
    expect((json!.source as { status: string }).status).toBe('ACTIVE');
    expect(h.audits.map((a) => a.action)).toEqual(['homes.source.resume']);
  });

  it('answers CONFLICT for a stale status, writes nothing and does not audit', async () => {
    admin();
    // The admin saw ACTIVE; a run has since set it to ERROR.
    h.sources = [source({ status: 'ERROR', lastError: 'boom' })];
    const { status, json } = await call('status', 'POST', {
      params: { id: 's1' },
      body: { action: 'pause', seen: 'ACTIVE' },
    });
    expect(status).toBe(409);
    expect(json).toMatchObject({ code: 'CONFLICT' });
    expect(h.sources[0]!.status).toBe('ERROR');
    expect(h.audits).toEqual([]);
  });

  it('two admins pausing from the same view: one wins, the other gets CONFLICT', async () => {
    admin();
    const body = { action: 'pause', seen: 'ACTIVE' };
    const first = await call('status', 'POST', { params: { id: 's1' }, body });
    const second = await call('status', 'POST', { params: { id: 's1' }, body });
    expect([first.status, second.status]).toEqual([200, 409]);
    expect(h.audits).toHaveLength(1);
  });

  it('refuses an action that does not fit the status, and a source that does not exist', async () => {
    admin();
    expect(
      (await call('status', 'POST', { params: { id: 's1' }, body: { action: 'resume', seen: 'ACTIVE' } })).status,
    ).toBe(400);
    expect(
      (await call('status', 'POST', { params: { id: 's1' }, body: { action: 'pause', seen: 'DISABLED' } })).status,
    ).toBe(400);
    const missing = await call('status', 'POST', { params: { id: 'nope' }, body: { action: 'pause', seen: 'ACTIVE' } });
    expect(missing.status).toBe(404);
    expect(h.audits).toEqual([]);
  });

  it('rolls the change back when the audit row cannot be written', async () => {
    admin();
    h.failAudit = true;
    const { status } = await call('status', 'POST', {
      params: { id: 's1' },
      body: { action: 'pause', seen: 'ACTIVE' },
    }).catch(() => ({ status: 500 }));
    expect(status).toBe(500);
    expect(h.sources[0]!.status).toBe('ACTIVE');
  });
});

describe('add an RSS feed', () => {
  it('stores a public https feed under rss:<host><path>, audited, and never answers with the query', async () => {
    admin();
    const { status, json } = await call('list', 'POST', { body: NEW_FEED });
    expect(status).toBe(200);
    const created = h.sources.find((s) => s.key === 'rss:feeds.example.com/buffalo/rentals')!;
    expect(created).toMatchObject({
      key: 'rss:feeds.example.com/buffalo/rentals',
      provider: 'RSS',
      label: 'Buffalo rentals',
      listingType: 'RENT',
      defaultCity: 'Buffalo',
      defaultState: 'NY',
      defaultLat: 42.8864,
      defaultLng: -78.8784,
      status: 'ACTIVE',
    });
    expect(created.url).toBe('https://feeds.example.com/buffalo/rentals/?key=sekret-1');
    expect(JSON.stringify(json)).not.toContain('sekret-1');
    expect(h.audits.map((a) => a.action)).toEqual(['homes.source.add']);
    expect(h.auditInTx).toEqual([true]);
  });

  it('refuses an http: address, credentials, a private literal, a private resolution and a host that does not resolve', async () => {
    admin();
    const bad = [
      'http://feeds.example.com/a',
      'https://user:pass@feeds.example.com/a',
      'https://10.0.0.5/feed',
      'https://127.0.0.1/feed',
      'https://169.254.169.254/latest',
      'https://internal.example.com/feed',
      'https://nowhere.example.com/feed',
      'ftp://feeds.example.com/a',
      'not a url',
    ];
    for (const url of bad) {
      const { status, json } = await call('list', 'POST', { body: { ...NEW_FEED, url } });
      expect([status, json?.code]).toEqual([400, 'HOME_SOURCE_URL_UNSAFE']);
    }
    expect(h.sources).toEqual([source()]);
    expect(h.audits).toEqual([]);
  });

  it('refuses a feed whose key is already a source, whatever the case, trailing slash or query', async () => {
    admin();
    expect((await call('list', 'POST', { body: NEW_FEED })).status).toBe(200);
    for (const url of [
      'https://feeds.example.com/buffalo/rentals',
      'https://FEEDS.example.com/buffalo/rentals/',
      'https://feeds.example.com/buffalo/rentals?other=1',
    ]) {
      const { status, json } = await call('list', 'POST', { body: { ...NEW_FEED, url } });
      expect([status, json?.code]).toEqual([409, 'HOME_SOURCE_EXISTS']);
    }
    expect(h.sources.filter((s) => s.key === 'rss:feeds.example.com/buffalo/rentals')).toHaveLength(1);
    expect(h.audits).toHaveLength(1);
  });

  it('answers HOME_SOURCE_EXISTS when the unique key is hit between the check and the insert', async () => {
    admin();
    const { prisma } = await import('@/lib/prisma.server');
    vi.mocked(prisma.homeSource.findUnique).mockResolvedValueOnce(null as never);
    h.sources.push(source({ id: 'dup', key: 'rss:feeds.example.com/buffalo/rentals', provider: 'RSS' }));
    const { status, json } = await call('list', 'POST', { body: NEW_FEED });
    expect([status, json?.code]).toEqual([409, 'HOME_SOURCE_EXISTS']);
  });

  it('validates the body: a name, a coordinate pair, ranges', async () => {
    admin();
    expect((await call('list', 'POST', { body: { ...NEW_FEED, label: '  ' } })).status).toBe(400);
    expect((await call('list', 'POST', { body: { ...NEW_FEED, defaultLng: undefined } })).status).toBe(400);
    expect((await call('list', 'POST', { body: { ...NEW_FEED, defaultLat: 91 } })).status).toBe(400);
    expect((await call('list', 'POST', { body: { ...NEW_FEED, listingType: 'LEASE' } })).status).toBe(400);
    const noPlace = { label: 'Plain', url: 'https://feeds.example.com/plain', listingType: 'SALE' };
    expect((await call('list', 'POST', { body: noPlace })).status).toBe(200);
  });
});

describe('run now', () => {
  it('sends one homes.scrape job with trigger MANUAL and the admin, and audits it', async () => {
    admin();
    const { status, json } = await call('scrape', 'POST');
    expect([status, json]).toEqual([200, { queued: true }]);
    expect(h.boss!.sent).toEqual([{ queue: 'homes.scrape', data: { trigger: 'MANUAL', by: 'admin-1' } }]);
    expect(h.audits).toEqual([expect.objectContaining({ adminId: 'admin-1', action: 'homes.scrape.run' })]);
  });

  it('refuses a second press while one is queued: one job, HOME_SCRAPE_QUEUED', async () => {
    admin();
    expect((await call('scrape', 'POST')).status).toBe(200);
    const second = await call('scrape', 'POST');
    expect([second.status, second.json?.code]).toEqual([409, 'HOME_SCRAPE_QUEUED']);
    expect(h.boss!.sent).toHaveLength(1);
    expect(h.audits).toHaveLength(1);
  });

  it("treats a queue-policy error from pg-boss as 'already queued'", async () => {
    admin();
    h.boss!.throwOnSend = new Error('one or more jobs could not be created. rejected by a queue policy (exclusive)');
    const { status, json } = await call('scrape', 'POST');
    expect([status, json?.code]).toEqual([409, 'HOME_SCRAPE_QUEUED']);
    expect(h.audits).toEqual([]);
  });

  it('answers 503 when the queue is unavailable or the worker has not created it', async () => {
    admin();
    h.boss = null;
    expect((await call('scrape', 'POST')).status).toBe(503);
    h.boss = { sent: [], queued: false, queueExists: false, throwOnSend: null };
    expect((await call('scrape', 'POST')).status).toBe(503);
    expect(h.audits).toEqual([]);
  });
});

describe('the new refusal codes', () => {
  it('carry the specified English and statuses', async () => {
    const { ERROR_CODES } = await import('@/lib/errors/codes');
    expect(ERROR_CODES.HOME_SOURCE_URL_UNSAFE).toMatchObject({
      http: 400,
      text: 'Use a public https address for the feed',
    });
    expect(ERROR_CODES.HOME_SOURCE_EXISTS).toMatchObject({ http: 409, text: 'That feed is already a source' });
    expect(ERROR_CODES.HOME_SCRAPE_QUEUED).toMatchObject({ http: 409, text: 'A scrape is already queued' });
  });
});

describe('the page and its endpoints stay admin only', () => {
  it('uses auth admin on every handler (no hand-rolled check, no raw fetch)', () => {
    for (const f of [
      'admin.homes.server.ts',
      'admin.homes.sources.$id.status.server.ts',
      'admin.homes.scrape.server.ts',
    ]) {
      const src = readFileSync(join(__dirname, '..', 'api', f), 'utf8');
      const methods = (src.match(/(GET|POST):\s*implement\(/g) ?? []).length;
      expect((src.match(/auth:\s*'admin'/g) ?? []).length).toBe(methods);
    }
  });
});
