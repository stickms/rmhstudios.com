/**
 * `/api/v1/me/rmhtube/*` and `/api/v1/rmhtube/parties*` (s10-14), driven through the real developer-API wrapper, the
 * real adapters and the site's real Watch later functions on a stand-in Prisma. The party and statistics functions are
 * the site's; they are stubbed here so the test checks what the adapter adds (visibility, blocks, shape, refusals).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  scopes: [] as string[],
  later: [] as Record<string, unknown>[],
  parties: [] as Record<string, unknown>[],
  blocked: new Set<string>(),
  going: [] as [string, string, boolean][],
  nextId: 1,
}));

vi.mock('@/lib/api/developer-auth.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/developer-auth.server')>()),
  authenticateApiKey: async () => ({
    ok: true,
    userId: 'owner_1',
    tier: 'starter',
    keyId: 'key_1',
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

const pick = (r: Row) => ({ id: r.id, url: r.url, title: r.title, createdAt: r.createdAt });
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rmhTubeWatchLater: {
      findMany: vi.fn(async (args: { where: Row; take: number }) => {
        const w = args.where as { userId: string; OR?: { createdAt: unknown; id?: { gt: string } }[] };
        let rows = h.later.filter((r) => r.userId === w.userId);
        if (w.OR) {
          const [a, b] = w.OR as unknown as [{ createdAt: { gt: Date } }, { createdAt: Date; id: { gt: string } }];
          rows = rows.filter(
            (r) =>
              (r.createdAt as Date) > a.createdAt.gt ||
              ((r.createdAt as Date).getTime() === b.createdAt.getTime() && (r.id as string) > b.id.gt),
          );
        }
        rows.sort(
          (x, y) =>
            (x.createdAt as Date).getTime() - (y.createdAt as Date).getTime() ||
            (x.id as string).localeCompare(y.id as string),
        );
        return rows.slice(0, args.take).map(pick);
      }),
      findUnique: vi.fn(async (args: { where: { userId_url: { userId: string; url: string } } }) => {
        const { userId, url } = args.where.userId_url;
        const r = h.later.find((x) => x.userId === userId && x.url === url);
        return r ? pick(r) : null;
      }),
      upsert: vi.fn(async (args: { create: Row }) => {
        const row = { id: `wl${h.nextId++}`, createdAt: new Date('2026-11-22T10:00:00Z'), ...args.create };
        h.later.push(row);
        return pick(row);
      }),
      deleteMany: vi.fn(async (args: { where: Row }) => {
        const before = h.later.length;
        h.later = h.later.filter((r) => !(r.id === args.where.id && r.userId === args.where.userId));
        return { count: before - h.later.length };
      }),
    },
  },
}));

vi.mock('@/lib/social/follow-list-privacy.server', () => ({
  filterBlocked: async (_v: string, ids: string[]) => ids.filter((i) => !h.blocked.has(i)),
}));
vi.mock('@/lib/rmhtube/stats.server', () => ({
  getMyStats: async (userId: string) => ({
    counters: {
      totalWatchTimeMinutes: userId === 'owner_1' ? 12 : 999,
      videosWatched: 1,
      roomsCreated: 0,
      roomsJoined: 0,
      messagesSent: 0,
      reactionsUsed: 0,
    },
    paused: true,
    days: [{ day: '2026-11-22', minutes: 5 }],
  }),
}));
vi.mock('@/lib/rmhtube/parties.server', async () => {
  const dto = (r: Row, viewer: string | null) => ({
    roomId: r.roomId,
    name: r.name,
    description: (r.description as string | null) ?? null,
    scheduledFor: '2026-11-27T19:00:00.000Z',
    isPublic: r.isPublic,
    maxMembers: 20,
    host: { id: r.hostId, name: 'Ada', image: null },
    goingCount: 3,
    firstGoing: [{ id: 'secret_attendee', name: 'Eve', image: null }],
    viewerGoing: (r.going as string[]).includes(viewer ?? ''),
    viewerIsHost: r.hostId === viewer,
    closed: r.closed === true,
  });
  return {
    roomIdFromParams: (p: Record<string, string>) => (/^[A-Z0-9]{6}$/.test(p.roomId ?? '') ? p.roomId : null),
    getParty: async (id: string, v: string | null) => {
      const r = h.parties.find((p) => p.roomId === id);
      return r ? dto(r, v) : null;
    },
    listUpcoming: async (v: string | null) => h.parties.map((r) => dto(r, v)),
    setGoing: async (id: string, userId: string, going: boolean) => {
      h.going.push([id, userId, going]);
      const r = h.parties.find((p) => p.roomId === id) as Row;
      if (r.closed) return { ok: false, reason: 'CLOSED' };
      return { ok: true, value: { ...dto(r, userId), viewerGoing: going } };
    },
  };
});

const routes = {
  later: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/rmhtube/watch-later')).Route),
  laterId: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/rmhtube/watch-later/$id')).Route),
  stats: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/rmhtube/stats')).Route),
  parties: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/rmhtube/parties')).Route),
  party: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/rmhtube/parties/$id')).Route),
  going: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/rmhtube/parties/$id/going')).Route),
};

const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;
const call = (handler: TestHandler, path: string, init: RequestInit = {}, params: Record<string, string> = {}) =>
  handler({
    request: new Request(`https://x.test${path}`, {
      ...init,
      headers: { authorization: BEARER, 'content-type': 'application/json' },
    }),
    params,
  });
const send = (handler: TestHandler, path: string, method: string, body: unknown, params: Record<string, string> = {}) =>
  call(handler, path, { method, body: JSON.stringify(body) }, params);

const later = (id: string, userId: string, sec: number, url = `https://v.test/${id}`) => ({
  id,
  userId,
  url,
  title: `t ${id}`,
  createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, sec)),
});
const party = (roomId: string, over: Row = {}) => ({
  roomId,
  name: 'Film night',
  description: null,
  isPublic: true,
  hostId: 'host_1',
  going: [] as string[],
  closed: false,
  ...over,
});

beforeEach(() => {
  h.scopes = ['read:rmhtube', 'write:rmhtube'];
  h.later = [];
  h.parties = [];
  h.blocked = new Set();
  h.going = [];
  h.nextId = 1;
});

describe('scopes', () => {
  it('read:rmhtube cannot add, remove or answer; write:rmhtube cannot read', async () => {
    h.scopes = ['read:rmhtube'];
    h.parties = [party('AB12CD')];
    for (const res of [
      await send(routes.later.POST!, '/api/v1/me/rmhtube/watch-later', 'POST', { url: 'https://v.test/a' }),
      await call(routes.laterId.DELETE!, '/api/v1/me/rmhtube/watch-later/x', { method: 'DELETE' }, { id: 'x' }),
      await send(routes.going.PUT!, '/api/v1/rmhtube/parties/AB12CD/going', 'PUT', { going: true }, { id: 'AB12CD' }),
    ]) {
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('insufficient_scope');
    }
    expect(h.later).toHaveLength(0);
    expect(h.going).toHaveLength(0);
    h.scopes = ['write:rmhtube'];
    for (const [handler, path] of [
      [routes.later.GET!, '/api/v1/me/rmhtube/watch-later'],
      [routes.stats.GET!, '/api/v1/me/rmhtube/stats'],
      [routes.parties.GET!, '/api/v1/rmhtube/parties'],
    ] as const) {
      expect((await call(handler, path)).status).toBe(403);
    }
  });

  it('read:* and write:* grant them', async () => {
    h.scopes = ['read:*'];
    expect((await call(routes.stats.GET!, '/api/v1/me/rmhtube/stats')).status).toBe(200);
  });
});

describe('Watch later', () => {
  it('lists only the owner’s items, oldest first, in keyset pages', async () => {
    h.later = [later('a', 'owner_1', 1), later('b', 'owner_1', 2), later('c', 'owner_1', 3), later('z', 'other', 0)];
    const p1 = await (await call(routes.later.GET!, '/api/v1/me/rmhtube/watch-later?limit=2')).json();
    expect(p1.data.map((i: { id: string }) => i.id)).toEqual(['a', 'b']);
    expect(p1.data[0].createdAt).toBe('2026-11-01T00:00:01.000Z');
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await (
      await call(
        routes.later.GET!,
        `/api/v1/me/rmhtube/watch-later?limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`,
      )
    ).json();
    expect(p2.data.map((i: { id: string }) => i.id)).toEqual(['c']);
    expect(p2.nextCursor).toBeNull();
  });

  it('refuses a bad cursor and a bad limit', async () => {
    expect((await call(routes.later.GET!, '/api/v1/me/rmhtube/watch-later?cursor=nope')).status).toBe(400);
    expect((await call(routes.later.GET!, '/api/v1/me/rmhtube/watch-later?limit=500')).status).toBe(400);
  });

  it('adds with 201, and returns the existing item with 200 for a duplicate', async () => {
    const first = await send(routes.later.POST!, '/api/v1/me/rmhtube/watch-later', 'POST', {
      url: 'https://v.test/a#t=5',
      title: 'Mine',
    });
    expect(first.status).toBe(201);
    const item = await first.json();
    expect(item).toMatchObject({ url: 'https://v.test/a', title: 'Mine' });
    const again = await send(routes.later.POST!, '/api/v1/me/rmhtube/watch-later', 'POST', { url: 'https://v.test/a' });
    expect(again.status).toBe(200);
    expect((await again.json()).id).toBe(item.id);
    expect(h.later).toHaveLength(1);
  });

  it('defaults the title to the host name and validates the URL', async () => {
    const res = await send(routes.later.POST!, '/api/v1/me/rmhtube/watch-later', 'POST', { url: 'https://v.test/x' });
    expect((await res.json()).title).toBe('v.test');
    expect(
      (await send(routes.later.POST!, '/api/v1/me/rmhtube/watch-later', 'POST', { url: 'not a url' })).status,
    ).toBe(400);
  });

  it('deletes only the owner’s own item', async () => {
    h.later = [later('mine', 'owner_1', 1), later('theirs', 'other', 2)];
    const del = (id: string) =>
      call(routes.laterId.DELETE!, `/api/v1/me/rmhtube/watch-later/${id}`, { method: 'DELETE' }, { id });
    expect((await del('theirs')).status).toBe(404);
    expect(h.later.map((r) => r.id)).toEqual(['mine', 'theirs']);
    expect((await del('mine')).status).toBe(204);
    expect(h.later.map((r) => r.id)).toEqual(['theirs']);
    expect((await del('mine')).status).toBe(404);
  });
});

describe('parties', () => {
  it('lists public parties and the owner’s link-only ones, without the attendee list', async () => {
    h.parties = [
      party('PUB001'),
      party('LNK001', { isPublic: false, going: ['owner_1'] }),
      party('LNK002', { isPublic: false }),
      party('MINE01', { isPublic: false, hostId: 'owner_1' }),
    ];
    const text = await (await call(routes.parties.GET!, '/api/v1/rmhtube/parties')).text();
    const body = JSON.parse(text);
    expect(body.data.map((p: { id: string }) => p.id)).toEqual(['PUB001', 'LNK001', 'MINE01']);
    expect(body.data[1]).toMatchObject({ going: true, isHost: false, goingCount: 3, description: '' });
    expect(text).not.toContain('secret_attendee');
    expect(body.data[2].isHost).toBe(true);
  });

  it('hides a party whose host is blocked either way', async () => {
    h.parties = [party('PUB001'), party('PUB002', { hostId: 'blocked_host' })];
    h.blocked = new Set(['blocked_host']);
    const list = await (await call(routes.parties.GET!, '/api/v1/rmhtube/parties')).json();
    expect(list.data.map((p: { id: string }) => p.id)).toEqual(['PUB001']);
    expect((await call(routes.party.GET!, '/api/v1/rmhtube/parties/PUB002', {}, { id: 'PUB002' })).status).toBe(404);
  });

  it('a private party is 404 for a stranger, a missing one too, and visible to someone going', async () => {
    h.parties = [party('LNK002', { isPublic: false }), party('LNK001', { isPublic: false, going: ['owner_1'] })];
    const get = (id: string) => call(routes.party.GET!, `/api/v1/rmhtube/parties/${id}`, {}, { id });
    expect((await get('LNK002')).status).toBe(404);
    expect((await get('NOPE99')).status).toBe(404);
    expect((await get('bad')).status).toBe(404);
    const ok = await get('LNK001');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: 'LNK001', going: true, host: { id: 'host_1', name: 'Ada' } });
  });

  it('going goes through the site’s setGoing and shows on the party', async () => {
    h.parties = [party('PUB001')];
    const put = (going: unknown) =>
      send(routes.going.PUT!, '/api/v1/rmhtube/parties/PUB001/going', 'PUT', { going }, { id: 'PUB001' });
    const res = await put(true);
    expect(res.status).toBe(200);
    expect((await res.json()).going).toBe(true);
    expect(h.going).toEqual([['PUB001', 'owner_1', true]]);
    expect((await put('yes')).status).toBe(400);
  });

  it('lets you leave a party whose host you later blocked, but not join one', async () => {
    h.parties = [
      party('PUB003', { hostId: 'blocked_host', going: ['owner_1'] }),
      party('PUB004', { hostId: 'blocked_host' }),
    ];
    h.blocked = new Set(['blocked_host']);
    const put = (id: string, going: boolean) =>
      send(routes.going.PUT!, `/api/v1/rmhtube/parties/${id}/going`, 'PUT', { going }, { id });
    expect((await put('PUB003', false)).status).toBe(200);
    expect((await put('PUB003', true)).status).toBe(404);
    expect((await put('PUB004', true)).status).toBe(404);
    expect((await put('PUB004', false)).status).toBe(404);
  });

  it('going honours the site’s refusals: closed is 409, a party you cannot see is 404', async () => {
    h.parties = [party('CLOSED', { closed: true }), party('LNK002', { isPublic: false })];
    const put = (id: string) =>
      send(routes.going.PUT!, `/api/v1/rmhtube/parties/${id}/going`, 'PUT', { going: true }, { id });
    const closed = await put('CLOSED');
    expect(closed.status).toBe(409);
    expect((await closed.json()).error.code).toBe('party_closed');
    expect((await put('LNK002')).status).toBe(404);
    expect(h.going.map((g) => g[0])).toEqual(['CLOSED']);
  });
});

describe('stats', () => {
  it('serves the owner’s statistics with the pause flag', async () => {
    const body = await (await call(routes.stats.GET!, '/api/v1/me/rmhtube/stats')).json();
    expect(body.counters.totalWatchTimeMinutes).toBe(12);
    expect(body.paused).toBe(true);
    expect(body.days).toEqual([{ day: '2026-11-22', minutes: 5 }]);
  });
});

describe('registry', () => {
  it('declares the new scopes and the closed-party error', async () => {
    const { ALL_SCOPES } = await import('@/lib/api/scopes');
    const { ERROR_TYPES, defaultStatus } = await import('@/lib/api/errors');
    expect(ALL_SCOPES).toEqual(expect.arrayContaining(['read:rmhtube', 'write:rmhtube']));
    expect(ERROR_TYPES.party_closed).toBe('conflict_error');
    expect(defaultStatus('party_closed')).toBe(409);
  });
});
