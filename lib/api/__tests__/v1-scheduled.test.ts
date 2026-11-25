/**
 * `/api/v1/me/scheduled*`, driven through the real developer-API wrapper and the real shared create and update path
 * (lib/scheduled/create.server.ts) with Prisma and the community and publish modules mocked: scopes per route (a
 * `communityId` without `write:communities` is refused), the community gate running on create, patch and publish with a
 * held or flagged outcome refused as `422 automod_held`, capsules listed but never created or changed, the
 * `scheduledAt` window, `held` reasons, publish delegating to `publishScheduledPost`, the key owner's rows only,
 * the sandbox, and an idempotent retry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// s14-17: publishing asks the author's `post` timeout; these tests are not about it (restriction-paths and
// scheduled-restricted.test.ts are), so nobody is timed out here.
vi.mock('@/lib/moderation/restrictions.server', () => ({
  isRestricted: async () => false,
  restrictionMessage: async () => null,
  restrictionResponse: async () => null,
}));
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({
  key: { current: null as Record<string, unknown> | null },
  idem: new Map<string, { requestHash: string; responseBody: string; statusCode: number }>(),
  rows: new Map<string, Record<string, unknown>>(),
  pending: { n: 0 },
  media: new Map<string, Record<string, unknown>>(),
  prepare: vi.fn(),
  publish: vi.fn(),
  publishDue: vi.fn(async () => 0),
  sanction: { current: null as unknown },
  settings: { current: null as null | { requireImageAlt: boolean } },
  nextId: { n: 0 },
}));

vi.mock('@/lib/communities/post-gate.server', () => ({ prepareCommunityPost: h.prepare }));
vi.mock('@/lib/scheduled/publish.server', () => ({
  publishScheduledPost: h.publish,
  publishDueForUser: h.publishDue,
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: vi.fn(async () => {}) }));
vi.mock('@/lib/communities/bans.server', () => ({ activeSanction: vi.fn(async () => h.sanction.current) }));
vi.mock('@/lib/communities/settings.server', () => ({ getCommunitySettings: vi.fn(async () => h.settings.current) }));
vi.mock('@/lib/feed/alt-text.server', () => ({ altTextViolation: vi.fn(async () => null) }));
vi.mock('@/lib/prisma.server', () => {
  const scheduledPost = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => h.rows.get(where.id) ?? null),
    findMany: vi.fn(async () => [...h.rows.values()].filter((r) => r.publishedId === null)),
    count: vi.fn(async () => h.pending.n),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const id = `sp${++h.nextId.n}`;
      const row = {
        id,
        publishedId: null,
        createdAt: new Date('2026-11-22T10:00:00Z'),
        updatedAt: new Date('2026-11-22T10:00:00Z'),
        ...data,
      };
      h.rows.set(id, row);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const r = h.rows.get(where.id);
      if (!r) return { count: 0 };
      Object.assign(r, data);
      return { count: 1 };
    }),
    deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => ({ count: h.rows.delete(where.id) ? 1 : 0 })),
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (t: { scheduledPost: typeof scheduledPost }) => unknown) => fn({ scheduledPost })),
      scheduledPost,
      media: {
        findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.map((i) => h.media.get(i)).filter(Boolean),
        ),
      },
      developerApiKey: { findUnique: vi.fn(async () => h.key.current), update: vi.fn(async () => ({})) },
      apiKeyRefusalDaily: { upsert: vi.fn(async () => ({})) },
      apiIdempotencyKey: {
        findUnique: vi.fn(
          async ({ where }: { where: { keyId_idempotency: { idempotency: string } } }) =>
            h.idem.get(where.keyId_idempotency.idempotency) ?? null,
        ),
        create: vi.fn(
          async ({
            data,
          }: {
            data: { idempotency: string; requestHash: string; responseBody: string; statusCode: number };
          }) => {
            h.idem.set(data.idempotency, data);
            return {};
          },
        ),
        deleteMany: vi.fn(),
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

const load = async (path: string) =>
  handlersOf<TestHandler>(((await import(/* @vite-ignore */ path)) as { Route: unknown }).Route);
const collection = await load('../../../app/routes/api/v1/me/scheduled');
const item = await load('../../../app/routes/api/v1/me/scheduled/$id');
const publishRoute = await load('../../../app/routes/api/v1/me/scheduled/$id/publish');
const { sandboxResponse } = await import('@/lib/api/test-mode');

const ME = 'user_me';
const keyRecord = (scopes: string[]) => ({
  id: 'key_1',
  userId: ME,
  revokedAt: null,
  expiresAt: null,
  scopes,
  testMode: false,
  allowedCidrs: [] as string[],
  rateLimitPerMinute: null,
});
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const req = (url: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://rmhstudios.com${url}`, {
    method,
    headers: { Authorization: 'Bearer rmh_live_test-key-1', 'content-type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
const call = (
  hs: Record<string, TestHandler>,
  method: string,
  url: string,
  params: Record<string, string> = {},
  body?: unknown,
  headers?: Record<string, string>,
) => hs[method]!({ request: req(url, method, body, headers), params });

const row = (id: string, extra: Record<string, unknown> = {}) => {
  const r = {
    id,
    userId: ME,
    content: 'hello',
    gifUrl: null,
    gifAlt: null,
    imageUrls: [] as string[],
    imageAlts: [] as string[],
    audience: 'PUBLIC',
    isSensitive: false,
    contentWarning: null,
    replyControl: 'EVERYONE',
    unlockPrice: null,
    communityId: null,
    poll: null,
    scheduledAt: new Date(Date.now() + DAY),
    publishedId: null,
    isCapsule: false,
    createdAt: new Date('2026-11-22T10:00:00Z'),
    updatedAt: new Date('2026-11-22T10:00:00Z'),
    ...extra,
  };
  h.rows.set(id, r);
  return r;
};

const ALL = ['read:scheduled', 'write:scheduled', 'write:communities'];

beforeEach(() => {
  h.key.current = keyRecord(ALL);
  h.idem.clear();
  h.rows.clear();
  h.media.clear();
  h.pending.n = 0;
  h.nextId.n = 0;
  h.sanction.current = null;
  h.settings.current = null;
  h.prepare.mockReset();
  h.prepare.mockResolvedValue({ ok: true, held: false, holdRule: 'AutoMod', flagRule: null });
  h.publish.mockReset();
  h.publish.mockResolvedValue('post_1');
});

describe('scopes', () => {
  it('reads need read:scheduled and writes need write:scheduled', async () => {
    h.key.current = keyRecord(['write:scheduled']);
    expect((await call(collection, 'GET', '/api/v1/me/scheduled')).status).toBe(403);
    h.key.current = keyRecord(['read:scheduled']);
    expect((await call(collection, 'POST', '/api/v1/me/scheduled', {}, { content: 'x' })).status).toBe(403);
    expect((await call(item, 'PATCH', '/api/v1/me/scheduled/a', { id: 'a' }, { content: 'x' })).status).toBe(403);
    expect((await call(item, 'DELETE', '/api/v1/me/scheduled/a', { id: 'a' })).status).toBe(403);
    expect((await call(publishRoute, 'POST', '/api/v1/me/scheduled/a/publish', { id: 'a' })).status).toBe(403);
  });

  it('a communityId without write:communities is insufficient_scope and nothing is gated or stored', async () => {
    h.key.current = keyRecord(['write:scheduled']);
    const res = await call(
      collection,
      'POST',
      '/api/v1/me/scheduled',
      {},
      { content: 'x', communityId: 'c1', scheduledAt: iso(DAY) },
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('insufficient_scope');
    expect(h.prepare).not.toHaveBeenCalled();
    expect(h.rows.size).toBe(0);
  });

  it('changing or publishing a community row needs write:communities too', async () => {
    row('c1row', { communityId: 'c1' });
    h.key.current = keyRecord(['write:scheduled']);
    expect((await call(item, 'PATCH', '/api/v1/me/scheduled/c1row', { id: 'c1row' }, { content: 'y' })).status).toBe(
      403,
    );
    expect((await call(publishRoute, 'POST', '/api/v1/me/scheduled/c1row/publish', { id: 'c1row' })).status).toBe(403);
    expect(h.publish).not.toHaveBeenCalled();
  });
});

describe('create', () => {
  it('saves a draft without scheduledAt and a scheduled post with it', async () => {
    const draft = await call(collection, 'POST', '/api/v1/me/scheduled', {}, { content: 'a draft' });
    expect(draft.status).toBe(201);
    expect(await draft.json()).toMatchObject({ kind: 'draft', scheduledAt: null, held: null });
    const sched = await call(
      collection,
      'POST',
      '/api/v1/me/scheduled',
      {},
      { content: 'later', scheduledAt: iso(DAY) },
    );
    expect(await sched.json()).toMatchObject({ kind: 'scheduled' });
  });

  it('keeps the content warning, reply control and a ranked poll', async () => {
    const res = await call(
      collection,
      'POST',
      '/api/v1/me/scheduled',
      {},
      {
        content: 'q',
        contentWarning: 'spoilers',
        replyControl: 'FOLLOWING',
        poll: { question: 'Best?', options: ['a', 'b', 'c'], ranked: true, durationHours: 24 },
      },
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      contentWarning: 'spoilers',
      replyControl: 'FOLLOWING',
      poll: { ranked: true },
    });
  });

  it('enforces the scheduledAt window in UTC: 2 minutes to 365 days', async () => {
    const tooSoon = await call(
      collection,
      'POST',
      '/api/v1/me/scheduled',
      {},
      { content: 'x', scheduledAt: iso(60_000) },
    );
    expect(tooSoon.status).toBe(400);
    const tooFar = await call(
      collection,
      'POST',
      '/api/v1/me/scheduled',
      {},
      { content: 'x', scheduledAt: iso(366 * DAY) },
    );
    expect(tooFar.status).toBe(400);
    expect(
      (await call(collection, 'POST', '/api/v1/me/scheduled', {}, { content: 'x', scheduledAt: iso(3 * 60_000) }))
        .status,
    ).toBe(201);
    expect(
      (await call(collection, 'POST', '/api/v1/me/scheduled', {}, { content: 'x', scheduledAt: iso(364 * DAY) }))
        .status,
    ).toBe(201);
  });

  it('refuses a capsule, and a poll with a community', async () => {
    const cap = await call(
      collection,
      'POST',
      '/api/v1/me/scheduled',
      {},
      { content: 'x', capsule: true, scheduledAt: iso(30 * DAY) },
    );
    expect(cap.status).toBe(400);
    const poll = await call(
      collection,
      'POST',
      '/api/v1/me/scheduled',
      {},
      {
        content: 'x',
        communityId: 'c1',
        poll: { question: 'q', options: ['a', 'b'] },
      },
    );
    expect(poll.status).toBe(400);
    expect(h.rows.size).toBe(0);
  });

  it('refuses an empty body and an unknown media id', async () => {
    expect((await call(collection, 'POST', '/api/v1/me/scheduled', {}, {})).status).toBe(400);
    const res = await call(collection, 'POST', '/api/v1/me/scheduled', {}, { content: 'x', media_ids: ['med_nope'] });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_media');
  });

  it("refuses another member's upload as media", async () => {
    h.media.set('med_other', { id: 'med_other', userId: 'someone', status: 'PENDING', url: 'u' });
    const res = await call(collection, 'POST', '/api/v1/me/scheduled', {}, { content: 'x', media_ids: ['med_other'] });
    expect(res.status).toBe(400);
    expect(h.rows.size).toBe(0);
  });

  it('refuses the 51st with 409 conflict', async () => {
    h.pending.n = 50;
    const res = await call(collection, 'POST', '/api/v1/me/scheduled', {}, { content: 'x' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('conflict');
    expect(h.rows.size).toBe(0);
  });
});

describe('community gate', () => {
  const body = { content: 'x', communityId: 'c1', scheduledAt: iso(DAY) };

  it('runs prepareCommunityPost on create and stores the post when it is allowed', async () => {
    const res = await call(collection, 'POST', '/api/v1/me/scheduled', {}, body);
    expect(res.status).toBe(201);
    expect(h.prepare).toHaveBeenCalledWith(expect.objectContaining({ communityId: 'c1', userId: ME, content: 'x' }));
  });

  it('refuses what AutoMod would hold, or flag, as 422 automod_held', async () => {
    h.prepare.mockResolvedValueOnce({ ok: true, held: true, holdRule: 'r', flagRule: null });
    const held = await call(collection, 'POST', '/api/v1/me/scheduled', {}, body);
    expect(held.status).toBe(422);
    expect(((await held.json()) as { error: { code: string } }).error.code).toBe('automod_held');
    h.prepare.mockResolvedValueOnce({ ok: true, held: false, holdRule: 'AutoMod', flagRule: 'r' });
    expect((await call(collection, 'POST', '/api/v1/me/scheduled', {}, body)).status).toBe(422);
    expect(h.rows.size).toBe(0);
  });

  it("carries the gate's own refusal in the v1 envelope", async () => {
    h.prepare.mockResolvedValueOnce({
      ok: false,
      refusal: {
        status: 403,
        code: 'community_banned',
        body: { error: 'You are banned', code: 'community_banned', endsAt: null },
      },
    });
    const res = await call(collection, 'POST', '/api/v1/me/scheduled', {}, body);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { type: 'authorization_error', code: 'community_banned' } });
  });

  it('runs again on patch (merged state) and refuses a held outcome', async () => {
    row('r1', { communityId: 'c1' });
    h.prepare.mockResolvedValueOnce({ ok: true, held: true, holdRule: 'r', flagRule: null });
    const res = await call(item, 'PATCH', '/api/v1/me/scheduled/r1', { id: 'r1' }, { content: 'edited' });
    expect(res.status).toBe(422);
    expect(h.prepare).toHaveBeenCalledWith(expect.objectContaining({ communityId: 'c1', content: 'edited' }));
    expect(h.rows.get('r1')!.content).toBe('hello');
  });

  it('runs on publish too, so a publish never skips the hold', async () => {
    row('r2', { communityId: 'c1' });
    h.prepare.mockResolvedValueOnce({ ok: true, held: true, holdRule: 'r', flagRule: null });
    const res = await call(publishRoute, 'POST', '/api/v1/me/scheduled/r2/publish', { id: 'r2' });
    expect(res.status).toBe(422);
    expect(h.publish).not.toHaveBeenCalled();
  });
});

describe('capsules', () => {
  it('are listed with kind capsule, and cannot be changed, discarded or published', async () => {
    row('cap1', { isCapsule: true, scheduledAt: new Date(Date.now() + 30 * DAY) });
    const list = (await (await call(collection, 'GET', '/api/v1/me/scheduled')).json()) as {
      data: Array<{ id: string; kind: string }>;
    };
    expect(list.data).toMatchObject([{ id: 'cap1', kind: 'capsule' }]);
    expect((await call(item, 'PATCH', '/api/v1/me/scheduled/cap1', { id: 'cap1' }, { content: 'y' })).status).toBe(409);
    expect((await call(item, 'DELETE', '/api/v1/me/scheduled/cap1', { id: 'cap1' })).status).toBe(409);
    expect((await call(publishRoute, 'POST', '/api/v1/me/scheduled/cap1/publish', { id: 'cap1' })).status).toBe(409);
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.rows.has('cap1')).toBe(true);
    expect(h.rows.get('cap1')!.content).toBe('hello');
  });
});

describe('list, get, patch, delete', () => {
  it('publishes what is due first and reports held reasons from the publish checks', async () => {
    row('banned', { communityId: 'c1' });
    h.sanction.current = { kind: 'ban', endsAt: null };
    const list = (await (await call(collection, 'GET', '/api/v1/me/scheduled')).json()) as {
      data: Array<{ held: string | null }>;
    };
    expect(h.publishDue).toHaveBeenCalledWith(ME);
    expect(list.data[0]!.held).toBe('community_sanction');

    h.sanction.current = null;
    h.settings.current = { requireImageAlt: true };
    h.rows.clear();
    row('noalt', { communityId: 'c1', imageUrls: ['u1'], imageAlts: [''] });
    const again = (await (await call(collection, 'GET', '/api/v1/me/scheduled')).json()) as {
      data: Array<{ held: string | null }>;
    };
    expect(again.data[0]!.held).toBe('image_descriptions');
  });

  it("never shows another member's row", async () => {
    row('theirs', { userId: 'someone' });
    expect((await call(item, 'GET', '/api/v1/me/scheduled/theirs', { id: 'theirs' })).status).toBe(404);
    expect((await call(item, 'PATCH', '/api/v1/me/scheduled/theirs', { id: 'theirs' }, { content: 'y' })).status).toBe(
      404,
    );
    expect((await call(item, 'DELETE', '/api/v1/me/scheduled/theirs', { id: 'theirs' })).status).toBe(404);
    expect((await call(publishRoute, 'POST', '/api/v1/me/scheduled/theirs/publish', { id: 'theirs' })).status).toBe(
      404,
    );
    expect(h.rows.has('theirs')).toBe(true);
  });

  it('patches a draft, turns a schedule back into a draft with null, and discards it', async () => {
    row('mine');
    const patched = await call(
      item,
      'PATCH',
      '/api/v1/me/scheduled/mine',
      { id: 'mine' },
      { content: 'changed', scheduledAt: null },
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ content: 'changed', kind: 'draft' });
    expect((await call(item, 'PATCH', '/api/v1/me/scheduled/mine', { id: 'mine' }, {})).status).toBe(400);
    expect((await call(item, 'DELETE', '/api/v1/me/scheduled/mine', { id: 'mine' })).status).toBe(204);
    expect(h.rows.has('mine')).toBe(false);
  });

  it('rejects a bad kind filter and a bad cursor', async () => {
    expect((await call(collection, 'GET', '/api/v1/me/scheduled?kind=nope')).status).toBe(400);
    expect((await call(collection, 'GET', '/api/v1/me/scheduled?cursor=!!')).status).toBe(400);
  });
});

describe('publish', () => {
  it('delegates to publishScheduledPost and returns the post id', async () => {
    const r = row('p1');
    const res = await call(publishRoute, 'POST', '/api/v1/me/scheduled/p1/publish', { id: 'p1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ published: true, postId: 'post_1' });
    expect(h.publish).toHaveBeenCalledWith(r);
  });

  it('is 409 conflict when a check holds it back', async () => {
    row('p2', { communityId: 'c1' });
    h.publish.mockResolvedValueOnce(null);
    h.sanction.current = { kind: 'ban', endsAt: null };
    const res = await call(publishRoute, 'POST', '/api/v1/me/scheduled/p2/publish', { id: 'p2' });
    expect(res.status).toBe(409);
  });

  it('refuses an already published row', async () => {
    row('p3', { publishedId: 'post_9' });
    expect((await call(publishRoute, 'POST', '/api/v1/me/scheduled/p3/publish', { id: 'p3' })).status).toBe(409);
    expect(h.publish).not.toHaveBeenCalled();
  });
});

describe('idempotency', () => {
  it('replays the first response for a retried create and stores one row', async () => {
    const headers = { 'Idempotency-Key': 'retry-1' };
    const a = await call(collection, 'POST', '/api/v1/me/scheduled', {}, { content: 'once' }, headers);
    const b = await call(collection, 'POST', '/api/v1/me/scheduled', {}, { content: 'once' }, headers);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(((await b.json()) as { id: string }).id).toBe(((await a.clone().json()) as { id: string }).id);
    expect(h.rows.size).toBe(1);
  });
});

describe('sandbox', () => {
  const id = () => 'x';
  it('answers the reads with the fixture and refuses a capsule or a bad time like the route', () => {
    expect(sandboxResponse('GET', '/api/v1/me/scheduled', null, id)?.body).toMatchObject({ nextCursor: null });
    expect(sandboxResponse('POST', '/api/v1/me/scheduled', { content: 'x', capsule: true }, id)?.status).toBe(400);
    expect(sandboxResponse('POST', '/api/v1/me/scheduled', { content: 'x', scheduledAt: iso(1000) }, id)?.status).toBe(
      400,
    );
    const ok = sandboxResponse('POST', '/api/v1/me/scheduled', { content: 'x', scheduledAt: iso(DAY) }, id);
    expect(ok?.status).toBe(201);
    expect(ok?.body).toMatchObject({ sandbox: true });
    expect(sandboxResponse('DELETE', '/api/v1/me/scheduled/abc', null, id)?.status).toBe(204);
    expect(sandboxResponse('POST', '/api/v1/me/scheduled/abc/publish', null, id)?.status).toBe(200);
  });
});
