/**
 * The vibe key-value store is user data behind untrusted page code: every limit is
 * enforced on the server. Prisma is mocked; the handlers are driven directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const db = vi.hoisted(() => {
  const vibeKv = {
    findUnique: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  };
  const tx = {
    vibeKv,
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  };
  return {
    vibeKv,
    tx,
    vibePage: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    $queryRaw: vi.fn(),
  };
});
const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession,
    },
  },
}));
vi.mock('@/lib/rate-limit.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit.server')>()),
  checkRateLimit: vi.fn(async () => ({
    allowed: true,
  })),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: db,
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({
    options: config,
  }),
}));

import { route } from '@/lib/rmhvibe/api/vibe.kv.$slug.server';

type H = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const handlers = handlersOf<H>(route);
const headers = {
  cookie: 'better-auth.session_token=abc',
  'cf-connecting-ip': '1.2.3.4',
};
const get = (qs: string) =>
  handlers.GET!({
    params: {
      slug: 'neon',
    },
    request: new Request(`https://x.test/api/vibe/kv/neon?${qs}`, {
      headers,
    }),
  });
const post = (body: unknown) =>
  handlers.POST!({
    params: {
      slug: 'neon',
    },
    request: new Request('https://x.test/api/vibe/kv/neon', {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({
    user: {
      id: 'u1',
      name: 'Ada',
    },
  });
  db.vibePage.findUnique.mockResolvedValue({
    id: 'p1',
    status: 'ready',
  });
  db.vibeKv.findUnique.mockResolvedValue(null);
  db.vibeKv.count.mockResolvedValue(0);
  db.tx.$queryRaw.mockResolvedValue([
    {
      value: 5,
    },
  ]);
});

describe('vibe kv', () => {
  it('refuses a user-scope read when signed out', async () => {
    getSession.mockResolvedValue(null);
    expect((await get('key=a&scope=user')).status).toBe(401);
    expect(db.vibeKv.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a value over 4096 JSON chars', async () => {
    const res = await post({
      op: 'set',
      key: 'a',
      scope: 'page',
      value: 'x'.repeat(4095),
    });
    expect(res.status).toBe(400); // 4095 chars + 2 quotes = 4097
    expect(db.vibeKv.upsert).not.toHaveBeenCalled();
  });

  it('rejects writes to the reserved __ namespace', async () => {
    const res = await post({
      op: 'set',
      key: '__once:x',
      scope: 'page',
      value: 1,
    });
    expect(res.status).toBe(400);
    expect(db.vibeKv.upsert).not.toHaveBeenCalled();
  });

  it('refuses a new key once the page has 500', async () => {
    db.vibeKv.count.mockResolvedValue(500);
    const res = await post({
      op: 'set',
      key: 'new',
      scope: 'page',
      value: 1,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).detail.reason).toBe('VIBE_KV_FULL');
    expect(db.vibeKv.upsert).not.toHaveBeenCalled();
  });

  it('still lets an existing key be overwritten at the cap', async () => {
    db.vibeKv.count.mockResolvedValue(500);
    db.vibeKv.findUnique.mockResolvedValue({
      id: 'k',
    });
    expect(
      (
        await post({
          op: 'set',
          key: 'old',
          scope: 'page',
          value: 1,
        })
      ).status,
    ).toBe(200);
  });

  it('counts a oncePerUser increment once', async () => {
    const first = await post({
      op: 'incr',
      key: 'votes',
      scope: 'page',
      by: 1,
      oncePerUser: true,
    });
    expect(await first.json()).toEqual({
      value: 5,
      counted: true,
    });
    // Now the marker exists, and the counter holds 5.
    db.vibeKv.findUnique.mockImplementation(
      ({
        where,
      }: {
        where: {
          pageId_scope_ownerKey_key: {
            key: string;
          };
        };
      }) =>
        Promise.resolve(
          where.pageId_scope_ownerKey_key.key === '__once:votes'
            ? {
                id: 'm',
              }
            : {
                value: 5,
              },
        ),
    );
    db.tx.$queryRaw.mockClear();
    const second = await post({
      op: 'incr',
      key: 'votes',
      scope: 'page',
      by: 1,
      oncePerUser: true,
    });
    expect(await second.json()).toEqual({
      value: 5,
      counted: false,
    });
    expect(db.tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects an increment outside [-1000, 1000]', async () => {
    expect(
      (
        await post({
          op: 'incr',
          key: 'n',
          scope: 'page',
          by: 5000,
        })
      ).status,
    ).toBe(400);
    expect(db.tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('answers 409 when incrementing a non-number', async () => {
    db.tx.$queryRaw.mockResolvedValue([]);
    expect(
      (
        await post({
          op: 'incr',
          key: 'n',
          scope: 'page',
          by: 1,
        })
      ).status,
    ).toBe(409);
  });

  it('404s a page that is not ready', async () => {
    db.vibePage.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'generating',
    });
    expect((await get('key=a&scope=page')).status).toBe(404);
  });
});
