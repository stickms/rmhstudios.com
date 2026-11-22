/**
 * s10-17 community oversight, through the real endpoint wrapper with Prisma stood in for by a small in-memory fake:
 * admins only; the figures for a page come from grouped queries, one call each, never one per row; taking a community
 * out of discovery writes the audit row in the same transaction, tells its moderators through a `notice()` key and
 * touches no member; returning it clears the three columns; a second delist is a conflict, not a second audit row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; isAdmin: boolean } } | null,
  communities: [] as Record<string, unknown>[],
  mods: [] as Record<string, unknown>[],
  audits: [] as { adminId: string; action: string; opts: Record<string, unknown> }[],
  auditInTx: [] as boolean[],
  notices: [] as Record<string, unknown>[],
  failAudit: false,
  rawRows: [] as Record<string, unknown>[],
  rawSql: [] as { text: string; values: unknown[] }[],
  calls: [] as { model: string; op: string; args: Record<string, unknown> }[],
  txDepth: 0,
  locks: [] as string[],
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/admin-audit.server', () => ({
  recordAdminActionIn: vi.fn(async (_tx: unknown, adminId: string, action: string, opts: Record<string, unknown>) => {
    h.auditInTx.push(h.txDepth > 0);
    if (h.failAudit) throw new Error('audit down');
    h.audits.push({ adminId, action, opts });
  }),
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (n: Record<string, unknown>) => {
    h.notices.push(n);
  }),
}));
vi.mock('@/lib/cached.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cached.server')>()),
  invalidateCached: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    h.locks.push(key);
  }),
}));

const rec = (model: string, op: string, args: Record<string, unknown>) => h.calls.push({ model, op, args });
const callsOf = (model: string, op: string) => h.calls.filter((c) => c.model === model && c.op === op);

vi.mock('@/lib/prisma.server', () => {
  const prisma = {
    community: {
      findUnique: vi.fn(async (a: Row) => {
        rec('community', 'findUnique', a);
        const where = a.where as { slug?: string; id?: string };
        const c = h.communities.find((x) => (where.slug ? x.slug === where.slug : x.id === where.id));
        return c ? { ...c } : null;
      }),
      findMany: vi.fn(async (a: Row) => {
        rec('community', 'findMany', a);
        return h.communities.map((c) => ({ ...c }));
      }),
      updateMany: vi.fn(async (a: Row) => {
        rec('community', 'updateMany', a);
        const where = a.where as { id: string; delistedAt: null | { not: null } };
        const hit = h.communities.filter(
          (c) => c.id === where.id && (where.delistedAt === null ? c.delistedAt === null : c.delistedAt !== null),
        );
        for (const c of hit) Object.assign(c, a.data);
        return { count: hit.length };
      }),
    },
    rMHark: {
      groupBy: vi.fn(async (a: Row) => {
        rec('rMHark', 'groupBy', a);
        return [{ communityId: 'c1', _count: { _all: 12 } }];
      }),
    },
    communityModItem: {
      groupBy: vi.fn(async (a: Row) => {
        rec('communityModItem', 'groupBy', a);
        return [{ communityId: 'c1', _count: { _all: 2 } }];
      }),
    },
    communityModAction: {
      groupBy: vi.fn(async (a: Row) => {
        rec('communityModAction', 'groupBy', a);
        return (a.by as string[]).includes('actorId')
          ? [{ actorId: 'm1', _max: { createdAt: new Date('2026-11-20T00:00:00Z') } }]
          : [{ communityId: 'c1', _max: { createdAt: new Date('2026-11-20T00:00:00Z') } }];
      }),
      findMany: vi.fn(async (a: Row) => {
        rec('communityModAction', 'findMany', a);
        return [
          {
            id: BigInt(7),
            action: 'ban',
            actorId: 'm1',
            targetType: 'user',
            reason: 'spam',
            createdAt: new Date('2026-11-20T00:00:00Z'),
          },
        ];
      }),
    },
    communityMemberEvent: {
      groupBy: vi.fn(async (a: Row) => {
        rec('communityMemberEvent', 'groupBy', a);
        const w = a.where as { createdAt: { lt?: Date } };
        return [{ communityId: 'c2', _count: { _all: w.createdAt.lt ? 10 : 60 } }];
      }),
    },
    communityMember: {
      findMany: vi.fn(async (a: Row) => {
        rec('communityMember', 'findMany', a);
        return h.mods.map((m) => ({ ...m }));
      }),
    },
    communitySister: { findMany: vi.fn(async () => [{ communityId: 'c9' }]) },
    user: { findMany: vi.fn(async () => [{ id: 'm1', name: 'Mod One', handle: 'modone' }]) },
    $queryRaw: vi.fn(async (q: { text?: string; sql?: string; values: unknown[] }) => {
      h.rawSql.push({ text: q.text ?? q.sql ?? '', values: q.values });
      return h.rawRows;
    }),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = h.communities.map((c) => ({ ...c }));
      const audits = h.audits.length;
      h.txDepth++;
      try {
        return await fn(prisma);
      } catch (e) {
        h.communities = snapshot;
        h.audits.length = audits;
        throw e;
      } finally {
        h.txDepth--;
      }
    },
  };
  return { prisma };
});

const community = (over: Row = {}): Row => ({
  id: 'c1',
  slug: 'one',
  name: 'One',
  isPrivate: false,
  memberCount: 100,
  delistedAt: null,
  delistedReason: null,
  ...over,
});

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const ROUTES = {
  list: () => import('@/lib/admin/api/admin.communities.server'),
  detail: () => import('@/lib/admin/api/admin.communities.$slug.server'),
  delist: () => import('@/lib/admin/api/admin.communities.$slug.delist.server'),
  relist: () => import('@/lib/admin/api/admin.communities.$slug.relist.server'),
};

async function call(
  which: keyof typeof ROUTES,
  method: 'GET' | 'POST',
  params: Record<string, string> = {},
  opts: { query?: string; body?: unknown } = {},
) {
  const mod = await ROUTES[which]();
  const handlers = mod.route.handlers as Record<string, Handler>;
  const res = await handlers[method]!({
    request: new Request(`https://rmhstudios.com/api/admin/communities${opts.query ?? ''}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    }),
    params,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Row | null };
}

const admin = () => {
  h.session = { user: { id: 'admin-1', isAdmin: true } };
};

beforeEach(() => {
  h.session = null;
  h.communities = [community(), community({ id: 'c2', slug: 'two', name: 'Two', memberCount: 50 })];
  h.mods = [
    { userId: 'm1', role: 'ADMIN', user: { name: 'Mod One', handle: 'modone' } },
    { userId: 'm2', role: 'MOD', user: { name: 'Mod Two', handle: 'modtwo' } },
  ];
  h.audits = [];
  h.auditInTx = [];
  h.notices = [];
  h.failAudit = false;
  h.rawRows = [];
  h.rawSql = [];
  h.calls = [];
  h.txDepth = 0;
  h.locks = [];
});

describe('admin only', () => {
  it('refuses a signed-out caller and a member on every endpoint, and changes nothing', async () => {
    const all = [
      () => call('list', 'GET'),
      () => call('detail', 'GET', { slug: 'one' }),
      () => call('delist', 'POST', { slug: 'one' }, { body: { reason: 'spam raids' } }),
      () => call('relist', 'POST', { slug: 'one' }),
    ];
    for (const run of all) expect((await run()).status).toBe(401);
    h.session = { user: { id: 'u9', isAdmin: false } };
    for (const run of all) expect((await run()).status).toBe(403);
    expect(h.communities[0]!.delistedAt).toBeNull();
    expect(h.audits).toEqual([]);
    expect(h.notices).toEqual([]);
  });
});

describe('the list and its figures', () => {
  it('asks each grouped question once for the whole page, whatever the page size', async () => {
    admin();
    h.rawRows = [{ communityId: 'c1', n: 4 }];
    const res = await call('list', 'GET');
    expect(res.status).toBe(200);
    expect(callsOf('rMHark', 'groupBy')).toHaveLength(1);
    expect(callsOf('communityModItem', 'groupBy')).toHaveLength(1);
    expect(callsOf('communityModAction', 'groupBy')).toHaveLength(1);
    // Joins this week and the week before: two windows, one grouped call each.
    expect(callsOf('communityMemberEvent', 'groupBy')).toHaveLength(2);
    expect(h.rawSql).toHaveLength(1);
    expect(callsOf('community', 'findMany')).toHaveLength(1);

    const rows = (res.json as { communities: Row[] }).communities;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      slug: 'one',
      postsThisWeek: 12,
      openReports: 4,
      openModItems: 2,
      growingFast: false,
      delistedAt: null,
    });
    expect(rows[1]).toMatchObject({ slug: 'two', joinsThisWeek: 60, joinsPreviousWeek: 10, growingFast: true });
    // No moderator action ever recorded for c2: quiet.
    expect(rows[1]!.quiet).toBe(true);
  });

  it('is a keyset page of 50 with a cursor for the next', async () => {
    admin();
    h.communities = Array.from({ length: 51 }, (_, i) =>
      community({ id: `c${i + 100}`, slug: `s${i}`, memberCount: 500 - i }),
    );
    const res = await call('list', 'GET');
    const body = res.json as { communities: Row[]; nextCursor: string | null };
    expect(body.communities).toHaveLength(50);
    expect(body.nextCursor).toBe('451:c149');
    const args = callsOf('community', 'findMany')[0]!.args;
    expect(args.take).toBe(51);
    expect(args.orderBy).toEqual([{ memberCount: 'desc' }, { id: 'desc' }]);
  });

  it('the reports filter lists the communities with an open report, found in one grouped query', async () => {
    admin();
    h.rawRows = [{ communityId: 'c1' }];
    await call('list', 'GET', {}, { query: '?filter=reports' });
    const where = (callsOf('community', 'findMany')[0]!.args.where as { AND: Row[] }).AND;
    expect(where).toContainEqual({ id: { in: ['c1'] } });
  });

  it('the growing filter needs joins doubled and at least 50', async () => {
    admin();
    h.rawRows = [
      { communityId: 'c1', cur: 80, prev: 41 },
      { communityId: 'c2', cur: 80, prev: 40 },
    ];
    await call('list', 'GET', {}, { query: '?filter=growing' });
    const where = (callsOf('community', 'findMany')[0]!.args.where as { AND: Row[] }).AND;
    expect(where).toContainEqual({ id: { in: ['c2'] } });
  });

  it('rejects an unknown filter and an over-long search', async () => {
    admin();
    expect((await call('list', 'GET', {}, { query: '?filter=everything' })).status).toBe(400);
    expect((await call('list', 'GET', {}, { query: `?q=${'x'.repeat(61)}` })).status).toBe(400);
  });

  it('the raw SQL uses the schema’s real table and column names', async () => {
    admin();
    h.rawRows = [];
    await call('list', 'GET');
    await call('list', 'GET', {}, { query: '?filter=growing' });
    const text = h.rawSql.map((s) => s.text).join('\n');
    for (const name of [
      'content_report',
      'rmheet',
      'community_member_event',
      '"entityType"',
      '"entityId"',
      '"communityId"',
      '"createdAt"',
    ]) {
      expect(text, name).toContain(name);
    }
    const { readFileSync } = await import('node:fs');
    const schema = ['moderation', 'communities', 'social']
      .map((f) => readFileSync(`${process.cwd()}/prisma/schema/${f}.prisma`, 'utf8'))
      .join('\n');
    for (const table of ['content_report', 'rmheet', 'community_member_event']) {
      expect(schema).toContain(`@@map("${table}")`);
    }
  });
});

describe('taking a community out of discovery', () => {
  it('writes the audit row in the same transaction and tells each moderator once', async () => {
    admin();
    const res = await call('delist', 'POST', { slug: 'one' }, { body: { reason: '  Spam raids from here  ' } });
    expect(res.status).toBe(200);
    expect(h.communities[0]).toMatchObject({
      delistedReason: 'Spam raids from here',
      delistedById: 'admin-1',
    });
    expect(h.communities[0]!.delistedAt).toBeInstanceOf(Date);
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      adminId: 'admin-1',
      action: 'community.delist',
      opts: { targetType: 'community', targetId: 'c1' },
    });
    expect(h.auditInTx).toEqual([true]);
    expect(h.locks).toEqual(['admin-communities:c1']);

    expect(h.notices).toHaveLength(2);
    expect(h.notices.map((n) => n.userId).sort()).toEqual(['m1', 'm2']);
    expect(h.notices[0]).toMatchObject({
      type: 'SYSTEM',
      entityType: 'community-delisted',
      link: '/c/one',
      preview: { key: 'community-delisted', params: { community: 'One', reason: 'Spam raids from here' } },
    });
    // The moderators are read from the membership table, never written to.
    expect(callsOf('communityMember', 'findMany').length).toBeGreaterThan(0);
    expect(h.calls.filter((c) => c.model === 'communityMember' && c.op !== 'findMany')).toEqual([]);
    expect(h.calls.some((c) => c.model === 'rMHark' && c.op !== 'groupBy')).toBe(false);
  });

  it('refuses a missing, short or over-long reason', async () => {
    admin();
    for (const reason of [undefined, '', '   ', 'no', 'x'.repeat(301)]) {
      const res = await call('delist', 'POST', { slug: 'one' }, { body: reason === undefined ? {} : { reason } });
      expect(res.status, String(reason)).toBe(400);
    }
    expect(h.communities[0]!.delistedAt).toBeNull();
    expect(h.audits).toEqual([]);
  });

  it('a second delist is a conflict with no second audit row or notice', async () => {
    admin();
    await call('delist', 'POST', { slug: 'one' }, { body: { reason: 'Spam raids from here' } });
    h.notices.length = 0;
    const again = await call('delist', 'POST', { slug: 'one' }, { body: { reason: 'Another reason' } });
    expect(again.status).toBe(409);
    expect(again.json).toMatchObject({ reason: 'already-out' });
    expect(h.audits).toHaveLength(1);
    expect(h.notices).toEqual([]);
    expect(h.communities[0]!.delistedReason).toBe('Spam raids from here');
  });

  it('rolls back, and notifies nobody, when the audit row cannot be written', async () => {
    admin();
    h.failAudit = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await call('delist', 'POST', { slug: 'one' }, { body: { reason: 'Spam raids from here' } });
    expect(res.status).toBe(500);
    expect(h.communities[0]!.delistedAt).toBeNull();
    expect(h.notices).toEqual([]);
  });

  it('answers 404 for an unknown community', async () => {
    admin();
    expect((await call('delist', 'POST', { slug: 'nope' }, { body: { reason: 'Spam raids from here' } })).status).toBe(
      404,
    );
  });
});

describe('returning a community to discovery', () => {
  it('clears the three columns and audits the return', async () => {
    admin();
    await call('delist', 'POST', { slug: 'one' }, { body: { reason: 'Spam raids from here' } });
    h.audits.length = 0;
    h.auditInTx.length = 0;
    const res = await call('relist', 'POST', { slug: 'one' });
    expect(res.status).toBe(200);
    expect(h.communities[0]).toMatchObject({ delistedAt: null, delistedReason: null, delistedById: null });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({ action: 'community.relist', opts: { targetId: 'c1' } });
    expect(h.auditInTx).toEqual([true]);
  });

  it('is a conflict when the community is not out of discovery', async () => {
    admin();
    const res = await call('relist', 'POST', { slug: 'one' });
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ reason: 'not-out' });
    expect(h.audits).toEqual([]);
  });
});

describe('the detail', () => {
  it('lists the moderators with their last action, the last 20 log entries and the open reports', async () => {
    admin();
    h.rawRows = [{ id: 'r1', reason: 'SPAM', entityId: 'p1', createdAt: new Date('2026-11-21T00:00:00Z') }];
    const res = await call('detail', 'GET', { slug: 'one' });
    expect(res.status).toBe(200);
    const body = res.json as {
      moderators: Row[];
      log: Row[];
      reports: Row[];
    };
    expect(body.moderators.map((m) => m.userId)).toEqual(['m1', 'm2']);
    expect(body.moderators[0]).toMatchObject({ role: 'ADMIN', lastActionAt: '2026-11-20T00:00:00.000Z' });
    expect(body.moderators[1]!.lastActionAt).toBeNull();
    expect(callsOf('communityModAction', 'findMany')[0]!.args.take).toBe(20);
    expect(body.log[0]).toMatchObject({ action: 'ban', actorName: 'Mod One' });
    expect(body.reports).toEqual([{ id: 'r1', reason: 'SPAM', entityId: 'p1', createdAt: '2026-11-21T00:00:00.000Z' }]);
  });

  it('answers 404 for an unknown community', async () => {
    admin();
    expect((await call('detail', 'GET', { slug: 'nope' })).status).toBe(404);
  });
});
