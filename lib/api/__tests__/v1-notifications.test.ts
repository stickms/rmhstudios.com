/**
 * The notifications developer API (s15-10), driven through the real developer-API wrapper and the real inbox
 * functions on a schema-checked stand-in Prisma: `key` and `params` on a keyed notice and `null` on a plain one,
 * both cursor forms, no duplicate or gap across a page boundary at equal times, the `unread` filter, the count being
 * the site badge's own function, mark-read by ids (others' ids ignored) and by time, the explicit write scope, and an
 * idempotent repeat.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

/** Loose on purpose: the stand-in rows and JSON bodies are read field by field. */
type Row = Record<string, ReturnType<typeof JSON.parse>>;
const h = vi.hoisted(() => ({
  scopes: [] as string[],
  keyN: 0,
  rows: [] as Row[],
  idem: new Map<string, Row>(),
  wheres: [] as Row[],
  unread: vi.fn(async (_userId: string) => 7),
  adjust: vi.fn(async (_userId: string, _delta: number) => undefined),
}));

vi.mock('@/lib/api/developer-auth.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/developer-auth.server')>()),
  authenticateApiKey: async () => ({
    ok: true,
    userId: 'me',
    tier: 'enterprise',
    keyId: `key_${h.keyN}`,
    scopes: h.scopes,
    testMode: false,
    allowedCidrs: [],
    rateLimitPerMinute: null,
  }),
  touchApiKeyLastUsed: () => undefined,
}));
vi.mock('@/lib/redis.server', () => ({ redisRateLimit: async () => null, redisIncrBy: async () => null }));
vi.mock('@/lib/api/usage.server', () => ({ recordUsage: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/notifications.server', () => ({
  getUnreadNotificationCount: (userId: string) => h.unread(userId),
  adjustNotifUnread: (userId: string, delta: number) => h.adjust(userId, delta),
}));

interface Where {
  userId: string;
  read?: boolean;
  id?: { in: string[] };
  createdAt?: { lt?: Date; lte?: Date };
  OR?: [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: string } }];
  type?: { in: string[] };
}

const matches = (r: Row, w: Where): boolean => {
  if (r.userId !== w.userId) return false;
  if (w.read !== undefined && r.read !== w.read) return false;
  if (w.id && !w.id.in.includes(r.id)) return false;
  if (w.createdAt?.lt && !(r.createdAt.getTime() < w.createdAt.lt.getTime())) return false;
  if (w.createdAt?.lte && !(r.createdAt.getTime() <= w.createdAt.lte.getTime())) return false;
  if (w.OR) {
    const [before, tie] = w.OR;
    const ok =
      r.createdAt.getTime() < before.createdAt.lt.getTime() ||
      (r.createdAt.getTime() === tie.createdAt.getTime() && r.id < tie.id.lt);
    if (!ok) return false;
  }
  return true;
};

vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({
    notification: {
      findMany: vi.fn(async (a: { where: Where; take: number }) => {
        h.wheres.push(a.where as unknown as Row);
        return h.rows
          .filter((r) => matches(r, a.where))
          .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || (x.id < y.id ? 1 : -1))
          .slice(0, a.take);
      }),
      updateMany: vi.fn(async (a: { where: Where; data: { read: boolean } }) => {
        h.wheres.push(a.where as unknown as Row);
        const hit = h.rows.filter((r) => matches(r, a.where));
        for (const r of hit) r.read = a.data.read;
        return { count: hit.length };
      }),
      count: vi.fn(async (a: { where: Where }) => h.rows.filter((r) => matches(r, a.where)).length),
    },
    apiIdempotencyKey: {
      findUnique: vi.fn(
        async (a: { where: { keyId_idempotency: { idempotency: string } } }) =>
          h.idem.get(a.where.keyId_idempotency.idempotency) ?? null,
      ),
      create: vi.fn(async (a: { data: { idempotency: string } }) => {
        h.idem.set(a.data.idempotency, a.data as unknown as Row);
        return {};
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  }),
}));

const listMod = await import('@/app/routes/api/v1/me/notifications');
const countMod = await import('@/app/routes/api/v1/me/notifications/unread-count');
const readMod = await import('@/app/routes/api/v1/me/notifications/read');
const LIST = handlersOf<TestHandler>(listMod.Route).GET!;
const COUNT = handlersOf<TestHandler>(countMod.Route).GET!;
const READ = handlersOf<TestHandler>(readMod.Route).POST!;

const base = 'https://rmhstudios.com/api/v1/me/notifications';
const getList = (query = '') => LIST({ request: new Request(`${base}${query}`), params: {} });
const getCount = () => COUNT({ request: new Request(`${base}/unread-count`), params: {} });
const postRead = (body: unknown, idem?: string) =>
  READ({
    request: new Request(`${base}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(idem ? { 'idempotency-key': idem } : {}) },
      body: JSON.stringify(body),
    }),
    params: {},
  });
const bodyOf = async (res: Response): Promise<Row> => {
  const body = (await res.json()) as Row;
  assertJsonSafe(body);
  return body;
};

const T0 = Date.UTC(2026, 10, 1);
const note = (id: string, userId: string, minute: number, over: Row = {}): Row => ({
  id,
  userId,
  actorId: null,
  type: 'SYSTEM',
  entityType: null,
  entityId: null,
  preview: `Notice ${id}`,
  previewKey: null,
  previewParams: null,
  link: null,
  read: false,
  createdAt: new Date(T0 + minute * 60_000),
  actor: null,
  ...over,
});

beforeEach(() => {
  h.scopes = ['read:notifications', 'write:notifications'];
  h.keyN += 1;
  h.rows = [];
  h.idem.clear();
  h.wheres = [];
  h.unread.mockClear();
  h.adjust.mockClear();
});

describe('GET /api/v1/me/notifications', () => {
  it('carries key and params for a keyed notice and null for a plain one, and caches nothing', async () => {
    h.rows = [
      note('n2', 'me', 2, {
        preview: 'Achievement unlocked: First post',
        previewKey: 'achievement-unlocked',
        previewParams: { name: 'First post' },
      }),
      note('n1', 'me', 1, { type: 'FOLLOW', preview: null }),
    ];
    const res = await getList();
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = await bodyOf(res);
    expect(body.data[0]).toMatchObject({
      id: 'n2',
      key: 'achievement-unlocked',
      params: { name: 'First post' },
      preview: 'Achievement unlocked: First post',
    });
    expect(body.data[1]).toMatchObject({ id: 'n1', key: null, params: null, preview: null });
  });

  it('answers a keyed notice with no params as an empty object, never null', async () => {
    h.rows = [note('n1', 'me', 1, { previewKey: 'appeal-accepted', previewParams: {} })];
    const body = await bodyOf(await getList());
    expect(body.data[0]).toMatchObject({ key: 'appeal-accepted', params: {} });
  });

  it('drops a stored param that is not a string or a number', async () => {
    h.rows = [
      note('n1', 'me', 1, {
        previewKey: 'achievement-unlocked',
        previewParams: { name: 'X', n: 2, nested: { a: 1 }, flag: true, list: [1] },
      }),
    ];
    const body = await bodyOf(await getList());
    expect(body.data[0].params).toEqual({ name: 'X', n: 2 });
  });

  it('keeps every field an old client reads, with the same values, and only adds key and params', async () => {
    h.rows = [
      note('n1', 'me', 1, {
        type: 'FOLLOW',
        entityType: 'user',
        entityId: 'u1',
        preview: null,
        link: '/u/ada',
        read: true,
        actor: { id: 'ada-id', name: 'Ada', image: null, username: 'ada', handle: 'ada', profile: null },
      }),
    ];
    const body = await bodyOf(await getList());
    expect(Object.keys(body).sort()).toEqual(['data', 'nextCursor']);
    const item = body.data[0] as Row;
    expect(Object.keys(item).sort()).toEqual(
      ['actor', 'createdAt', 'entityId', 'entityType', 'id', 'key', 'link', 'params', 'preview', 'read', 'type'].sort(),
    );
    expect(item).toMatchObject({
      id: 'n1',
      type: 'FOLLOW',
      entityType: 'user',
      entityId: 'u1',
      preview: null,
      link: '/u/ada',
      read: true,
      createdAt: new Date(T0 + 60_000).toISOString(),
    });
    expect(Object.keys(item.actor).sort()).toEqual(['handle', 'id', 'image', 'name']);
    expect(item.actor).toMatchObject({ id: 'ada-id', handle: 'ada' });
  });

  it('lists only the key owner’s notifications', async () => {
    h.rows = [note('mine', 'me', 1), note('theirs', 'them', 2)];
    const body = await bodyOf(await getList());
    expect(body.data.map((n: Row) => n.id)).toEqual(['mine']);
    expect(h.wheres.every((w) => w.userId === 'me')).toBe(true);
  });

  it('walks every page without a duplicate or a gap when notifications share a millisecond', async () => {
    // Six at one instant, two earlier, two later: pages of three split the equal-time group.
    h.rows = [
      ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => note(`t-${id}`, 'me', 5)),
      note('old-1', 'me', 1),
      note('old-2', 'me', 2),
      note('new-1', 'me', 9),
      note('new-2', 'me', 8),
    ];
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const body: Row = await bodyOf(await getList(`?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
      seen.push(...body.data.map((n: Row) => n.id));
      cursor = body.nextCursor;
      if (cursor) expect(cursor).toContain('|');
      else break;
    }
    expect(seen).toHaveLength(10);
    expect(new Set(seen).size).toBe(10);
    expect(seen).toEqual(
      [...h.rows].sort((x, y) => y.createdAt - x.createdAt || (x.id < y.id ? 1 : -1)).map((r) => r.id),
    );
  });

  it('always hands out the new <ISO>|<id> cursor', async () => {
    h.rows = [note('n1', 'me', 1), note('n2', 'me', 2)];
    const body = await bodyOf(await getList('?limit=2'));
    expect(body.nextCursor).toBe(`${new Date(T0 + 60_000).toISOString()}|n1`);
  });

  it('still accepts the old bare-ISO cursor, read as createdAt < the time', async () => {
    h.rows = [note('same-a', 'me', 5), note('same-b', 'me', 5), note('older', 'me', 4), note('newer', 'me', 6)];
    const bare = new Date(T0 + 5 * 60_000).toISOString();
    const body = await bodyOf(await getList(`?cursor=${encodeURIComponent(bare)}`));
    expect(body.data.map((n: Row) => n.id)).toEqual(['older']);
  });

  it('writes the tuple cursor as OR of createdAt < and the equal-time id <', async () => {
    h.rows = [note('n1', 'me', 1)];
    const at = new Date(T0 + 60_000);
    await getList(`?cursor=${encodeURIComponent(`${at.toISOString()}|n9`)}`);
    expect(h.wheres[0]!.OR).toEqual([{ createdAt: { lt: at } }, { createdAt: at, id: { lt: 'n9' } }]);
  });

  it('refuses a malformed cursor with a 400', async () => {
    for (const bad of ['nonsense', 'nonsense|n1', `${new Date(T0).toISOString()}|`]) {
      const res = await getList(`?cursor=${encodeURIComponent(bad)}`);
      expect(res.status, bad).toBe(400);
      expect(((await bodyOf(res)) as Row).error.code).toBe('invalid_request');
    }
  });

  it('filters to unread with unread=true, and refuses another value', async () => {
    h.rows = [note('r', 'me', 1, { read: true }), note('u', 'me', 2)];
    const only = await bodyOf(await getList('?unread=true'));
    expect(only.data.map((n: Row) => n.id)).toEqual(['u']);
    expect(h.wheres[0]!.read).toBe(false);
    const all = await bodyOf(await getList('?unread=false'));
    expect(all.data.map((n: Row) => n.id)).toEqual(['u', 'r']);
    expect((await getList('?unread=maybe')).status).toBe(400);
  });

  it('keeps limit forgiving as before: a bad value is the default and a large one is the cap', async () => {
    h.rows = Array.from({ length: 60 }, (_, i) => note(`n${String(i).padStart(2, '0')}`, 'me', i));
    expect((await bodyOf(await getList('?limit=abc'))).data).toHaveLength(20);
    expect((await bodyOf(await getList('?limit=500'))).data).toHaveLength(50);
  });

  it('needs read:notifications', async () => {
    h.scopes = ['write:notifications'];
    expect((await getList()).status).toBe(403);
  });
});

describe('GET /api/v1/me/notifications/unread-count', () => {
  it('answers the count from the site badge’s own function, uncapped', async () => {
    h.unread.mockResolvedValueOnce(1234);
    const res = await getCount();
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await bodyOf(res)).toEqual({ count: 1234 });
    expect(h.unread).toHaveBeenCalledWith('me');
  });

  it('needs read:notifications', async () => {
    h.scopes = [];
    expect((await getCount()).status).toBe(403);
  });
});

describe('POST /api/v1/me/notifications/read', () => {
  it('marks your own ids read, ignores other people’s ids, and moves the badge counter by what changed', async () => {
    h.rows = [note('a', 'me', 1), note('b', 'me', 2), note('c', 'me', 3, { read: true }), note('x', 'them', 4)];
    const res = await postRead({ ids: ['a', 'c', 'x', 'missing'] });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ updated: 1 });
    expect(h.rows.map((r) => [r.id, r.read])).toEqual([
      ['a', true],
      ['b', false],
      ['c', true],
      ['x', false],
    ]);
    expect(h.adjust).toHaveBeenCalledWith('me', -1);
  });

  it('marks everything unread at or before a time read, and nothing later', async () => {
    h.rows = [note('a', 'me', 1), note('b', 'me', 2), note('c', 'me', 3), note('x', 'them', 1)];
    const before = new Date(T0 + 2 * 60_000).toISOString();
    expect(await bodyOf(await postRead({ before }))).toEqual({ updated: 2 });
    expect(h.rows.map((r) => [r.id, r.read])).toEqual([
      ['a', true],
      ['b', true],
      ['c', false],
      ['x', false],
    ]);
    expect(h.adjust).toHaveBeenCalledWith('me', -2);
  });

  it('is idempotent: marking read notifications read again changes nothing', async () => {
    h.rows = [note('a', 'me', 1)];
    expect(await bodyOf(await postRead({ ids: ['a'] }))).toEqual({ updated: 1 });
    expect(await bodyOf(await postRead({ ids: ['a'] }))).toEqual({ updated: 0 });
    expect(await bodyOf(await postRead({ before: new Date(T0 + 9 * 60_000).toISOString() }))).toEqual({ updated: 0 });
  });

  it('replays the first answer for the same Idempotency-Key', async () => {
    h.rows = [note('a', 'me', 1)];
    const first = await postRead({ ids: ['a'] }, 'idem-1');
    expect(await bodyOf(first)).toEqual({ updated: 1 });
    const again = await postRead({ ids: ['a'] }, 'idem-1');
    expect(again.headers.get('idempotency-replayed')).toBe('true');
    expect(await bodyOf(again)).toEqual({ updated: 1 });
  });

  it('refuses a body that is neither ids nor before, both, empty, or too long', async () => {
    h.rows = [note('a', 'me', 1)];
    const bodies: unknown[] = [
      {},
      { ids: [] },
      { ids: Array.from({ length: 101 }, (_, i) => `id${i}`) },
      { ids: ['a'], before: new Date(T0).toISOString() },
      { ids: [''] },
      { ids: 'a' },
      { before: 'yesterday' },
      { ids: ['a'], extra: true },
      null,
    ];
    for (const b of bodies) expect((await postRead(b)).status, JSON.stringify(b)).toBe(400);
    expect(h.rows[0]!.read).toBe(false);
    expect((await postRead({ ids: Array.from({ length: 100 }, (_, i) => `id${i}`) })).status).toBe(200);
  });

  it('is refused with 403 without write:notifications, and changes nothing', async () => {
    h.scopes = ['read:notifications'];
    h.rows = [note('a', 'me', 1)];
    const res = await postRead({ ids: ['a'] });
    expect(res.status).toBe(403);
    expect(h.rows[0]!.read).toBe(false);
  });

  it('is not granted by the * or write:* wildcards (the scope is explicit)', async () => {
    h.rows = [note('a', 'me', 1)];
    for (const scopes of [['*'], ['read:*', 'write:*']]) {
      h.scopes = scopes;
      expect((await postRead({ ids: ['a'] })).status, scopes.join()).toBe(403);
    }
  });
});
