/**
 * `GET /api/v1/me/deleted`, driven through the real developer-API wrapper and the real tombstone reader over a small
 * in-memory Prisma stand-in: the read scope of each kind, oldest-first order and the keyset cursor, `410
 * sync_window_expired` for a `since` older than 90 days, and another member's tombstones never returned.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  scopes: [] as string[],
  rows: [] as { id: bigint; userId: string; kind: string; entityId: string; deletedAt: Date }[],
  lastWhere: null as unknown,
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
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (config: unknown) => ({ options: config }) }));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (k === 'AND') return (v as Row[]).every((w) => matches(row, w));
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
    const value = row[k];
    if (v instanceof Date) return (value as Date).getTime() === v.getTime();
    if (v && typeof v === 'object') {
      const op = v as { gt?: Date | bigint };
      if (op.gt !== undefined) return (value as Date | bigint) > op.gt;
    }
    return value === v;
  });

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    syncTombstone: {
      findMany: async ({ where, orderBy, take }: { where: Row; orderBy: Row[]; take: number }) => {
        h.lastWhere = { where, orderBy };
        return h.rows
          .filter((r) => matches(r as unknown as Row, where))
          .sort((a, b) => a.deletedAt.getTime() - b.deletedAt.getTime() || Number(a.id - b.id))
          .slice(0, take);
      },
    },
  },
}));

const route = handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/deleted')).Route);
const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;
const get = (query: string) =>
  route!.GET!({
    request: new Request(`https://x.test/api/v1/me/deleted?${query}`, { headers: { authorization: BEARER } }),
    params: {},
  });

const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
let nextId = 1n;
const add = (kind: string, entityId: string, deletedAt: Date, userId = 'owner_1') =>
  h.rows.push({ id: nextId++, userId, kind, entityId, deletedAt });

beforeEach(() => {
  h.scopes = ['read:reading', 'read:study', 'read:bookmarks'];
  h.rows = [];
  nextId = 1n;
});

describe('GET /api/v1/me/deleted', () => {
  it.each([
    ['highlight', 'read:reading'],
    ['shelf_entry', 'read:reading'],
    ['deck', 'read:study'],
    ['card', 'read:study'],
    ['bookmark', 'read:bookmarks'],
  ])('%s needs %s and nothing else', async (kind, scope) => {
    add(kind, 'x1', ago(1));
    h.scopes = ['read:profile'];
    const refused = await get(`kind=${kind}`);
    expect(refused.status).toBe(403);
    expect(refused.headers.get('x-accepted-scope')).toBe(scope);
    h.scopes = [scope];
    const ok = await get(`kind=${kind}`);
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toEqual([{ id: 'x1', kind, deletedAt: expect.any(String) }]);
  });

  it('a wildcard read key reads every kind', async () => {
    h.scopes = ['read:*'];
    expect((await get('kind=deck')).status).toBe(200);
  });

  it('refuses a missing or unknown kind and a bad since', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('kind=post')).status).toBe(400);
    expect((await get('kind=card&since=yesterday')).status).toBe(400);
    expect((await get('kind=card&cursor=@@')).status).toBe(400);
    expect((await get('kind=card&limit=501')).status).toBe(400);
  });

  it('returns one kind, oldest first, only after `since`', async () => {
    add('card', 'newer', ago(1));
    add('card', 'older', ago(5));
    add('deck', 'other-kind', ago(2));
    const all = await (await get('kind=card')).json();
    expect(all.data.map((d: { id: string }) => d.id)).toEqual(['older', 'newer']);
    const since = await (await get(`kind=card&since=${encodeURIComponent(ago(3).toISOString())}`)).json();
    expect(since.data.map((d: { id: string }) => d.id)).toEqual(['newer']);
  });

  it('never returns another member’s tombstones', async () => {
    add('card', 'theirs', ago(1), 'someone_else');
    add('card', 'mine', ago(2));
    const body = await (await get('kind=card')).json();
    expect(body.data.map((d: { id: string }) => d.id)).toEqual(['mine']);
    expect(JSON.stringify(h.lastWhere)).toContain('owner_1');
  });

  it('pages through a cursor, including rows with the same time', async () => {
    const same = ago(2);
    add('highlight', 'a', same);
    add('highlight', 'b', same);
    add('highlight', 'c', ago(1));
    const first = await (await get('kind=highlight&limit=2')).json();
    expect(first.data.map((d: { id: string }) => d.id)).toEqual(['a', 'b']);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await (await get(`kind=highlight&limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)).json();
    expect(second.data.map((d: { id: string }) => d.id)).toEqual(['c']);
    expect(second.nextCursor).toBeNull();
  });

  it('answers 410 sync_window_expired with the window for a since older than 90 days', async () => {
    const res = await get(`kind=card&since=${encodeURIComponent(ago(91).toISOString())}`);
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe('sync_window_expired');
    expect(body.error.type).toBe('invalid_request_error');
    expect(body.error.message).toContain('90 days');
    expect((await get(`kind=card&since=${encodeURIComponent(ago(89).toISOString())}`)).status).toBe(200);
  });

  it('does not serve a tombstone past the window that the prune has not reached yet', async () => {
    add('card', 'stale', ago(100));
    add('card', 'fresh', ago(10));
    const body = await (await get('kind=card')).json();
    expect(body.data.map((d: { id: string }) => d.id)).toEqual(['fresh']);
  });
});
