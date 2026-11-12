/**
 * C1 phase 24 batch 5: routes that used to read the session, rate-limit or parse
 * the body by hand (spaces, streak freeze, market/storefront buys, admin quota
 * appeals, creator redemption, the optional-session readers) now ride
 * `implement()` / `defineHandler`. Pins their bespoke 400 texts, the 401 for a
 * signed-out caller, the 403 for a non-admin and the signed-out shapes of the
 * readers that answer a quiet empty value. Drives the real route handlers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/spaces.server', () => ({
  createSpace: vi.fn(),
  startSpace: vi.fn(),
  endSpace: vi.fn(),
  listLiveSpaces: vi.fn(async () => []),
  SpaceError: class extends Error {},
}));
vi.mock('@/lib/streak.server', () => ({
  buyFreeze: vi.fn(async () => {
    throw new Error('INSUFFICIENT_COINS');
  }),
  FREEZE_COST: 50,
  MAX_FREEZE_TOKENS: 3,
}));
vi.mock('@/lib/market/market.server', () => ({
  buyListing: vi.fn(),
  cancelListing: vi.fn(),
  MarketError: class extends Error {},
  EscrowError: class extends Error {},
}));
vi.mock('@/lib/storefront/storefront.server', () => ({
  buyProduct: vi.fn(),
  StorefrontError: class extends Error {},
}));
vi.mock('@/lib/achievements/engine.server', () => ({ grantAchievement: vi.fn() }));
vi.mock('@/lib/library/quota.server', () => ({
  listPendingQuotaRequests: vi.fn(async () => []),
  decideQuotaRequest: vi.fn(),
}));
vi.mock('@/lib/library/storage-health.server', () => ({ getLibraryStorageHealth: vi.fn() }));
vi.mock('@/lib/creator/earnings.server', () => ({
  getCreatorEarnings: vi.fn(),
  listMyRedemptions: vi.fn(),
  requestRedemption: vi.fn(),
  RedemptionError: class extends Error {},
}));
vi.mock('@/lib/recovery/hold.server', () => ({ assertNoRecoveryHold: vi.fn(async () => null) }));
vi.mock('@/lib/explore.server', () => ({ listExplore: vi.fn() }));
vi.mock('@/lib/search/people.server', () => ({ searchPeople: vi.fn(async () => []) }));
vi.mock('@/lib/push/send.server', () => ({ pushConfigured: () => false }));
vi.mock('@/lib/chat-plus/expiry.server', () => ({ liveMessages: vi.fn() }));
vi.mock('@/lib/redis.server', () => ({
  redisEnabled: () => false,
  redisGetJSON: vi.fn(),
  redisSetJSON: vi.fn(),
  redisRateLimit: vi.fn(async () => null),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function handler(mod: string, method: string): Promise<Handler> {
  return handlersOfModule<Handler>(await import(/* @vite-ignore */ mod))[method]!;
}

const SPACES = '@/app/routes/api/spaces/index';
const SPACE_START = '@/lib/spaces/api/spaces.$id.start.server';
const SPACE_END = '@/lib/spaces/api/spaces.$id.end.server';
const FREEZE = '@/lib/api/routes/streak.freeze.server';
const MARKET_BUY = '@/lib/market/api/market.listings.$id.buy.server';
const MARKET_CANCEL = '@/lib/market/api/market.listings.$id.server';
const STORE_BUY = '@/lib/storefront/api/storefront.products.$id.buy.server';
const QUOTA = '@/lib/library/api/admin.library.quota-requests.server';
const HEALTH = '@/lib/library/api/admin.library.storage-health.server';
const REDEEM = '@/lib/creator/api/creator.redeem.server';

function req(
  method: string,
  body?: unknown,
  cookie = true,
  url = 'https://rmhstudios.com/api/x',
): Request {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: 'better-auth.session_token=abc' } : {}),
      'content-type': 'application/json',
      'cf-connecting-ip': `${Math.random()}`,
    },
    ...(body === undefined || method === 'GET'
      ? {}
      : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

beforeEach(() => {
  h.getSession.mockResolvedValue({ user: { id: 'u1', name: 'U', isAdmin: true } });
});

describe('signed-in routes answer 401 { error: "Unauthorized" } signed out', () => {
  const ROUTES: [string, string][] = [
    [SPACES, 'POST'],
    [SPACE_START, 'POST'],
    [SPACE_END, 'POST'],
    [FREEZE, 'POST'],
    [MARKET_BUY, 'POST'],
    [MARKET_CANCEL, 'DELETE'],
    [STORE_BUY, 'POST'],
    [REDEEM, 'POST'],
  ];
  for (const [mod, method] of ROUTES) {
    it(`${method} ${mod}`, async () => {
      h.getSession.mockResolvedValue(null);
      const fn = await handler(mod, method);
      const res = await fn({ params: { id: 'a1' }, request: req(method, {}, false) });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });
  }
});

describe('bespoke 400 texts survive', () => {
  it('space create: names the first issue; malformed JSON reads as an empty body', async () => {
    const fn = await handler(SPACES, 'POST');
    for (const body of [{}, '{nope', { title: '' }]) {
      const res = await fn({ params: {}, request: req('POST', body) });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(typeof json.error).toBe('string');
      expect(json.error).not.toBe('Invalid input');
    }
  });

  it('quota decision: a missing id is "Missing request id."', async () => {
    const fn = await handler(QUOTA, 'POST');
    for (const body of [{}, '{nope', { approve: true }]) {
      const res = await fn({ params: {}, request: req('POST', body) });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Missing request id.' });
    }
  });

  it('creator redemption: the schema message is returned', async () => {
    const fn = await handler(REDEEM, 'POST');
    const res = await fn({ params: {}, request: req('POST', { kind: 'SUB_CREDIT' }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Subscription credit needs a tier and month count',
    });
  });

  it('streak freeze: not enough coins is a 400 with its own text', async () => {
    const fn = await handler(FREEZE, 'POST');
    const res = await fn({ params: {}, request: req('POST') });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Not enough coins' });
  });
});

describe('admin library routes: 401 signed out, 403 non-admin', () => {
  const ROUTES: [string, string][] = [
    [QUOTA, 'GET'],
    [QUOTA, 'POST'],
    [HEALTH, 'GET'],
  ];
  for (const [mod, method] of ROUTES) {
    it(`${method} ${mod}`, async () => {
      const fn = await handler(mod, method);
      h.getSession.mockResolvedValue(null);
      const out = await fn({ params: {}, request: req(method, {}, false) });
      expect(out.status).toBe(401);
      h.getSession.mockResolvedValue({ user: { id: 'u2', name: 'V', isAdmin: false } });
      const nonAdmin = await fn({ params: {}, request: req(method, {}) });
      expect(nonAdmin.status).toBe(403);
    });
  }
});

describe('optional-session readers keep their quiet signed-out answers', () => {
  it('messages unread-count answers { count: 0 }', async () => {
    h.getSession.mockResolvedValue(null);
    const fn = await handler('@/lib/messages/api/messages.unread-count.server', 'GET');
    const res = await fn({ params: {}, request: req('GET', undefined, false) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ count: 0 });
  });

  it('messages sidebar answers empty lists', async () => {
    h.getSession.mockResolvedValue(null);
    const fn = await handler('@/lib/messages/api/messages.sidebar.server', 'GET');
    const res = await fn({ params: {}, request: req('GET', undefined, false) });
    await expect(res.json()).resolves.toEqual({ recent: [], suggested: [] });
  });

  it('users search answers an empty list for a blank query', async () => {
    h.getSession.mockResolvedValue(null);
    const fn = await handler('@/lib/discovery/api/users.search.server', 'GET');
    const res = await fn({
      params: {},
      request: req('GET', undefined, false, 'https://rmhstudios.com/api/users/search?q='),
    });
    await expect(res.json()).resolves.toEqual({ users: [] });
  });

  it('push public key is a 404 when push is not configured', async () => {
    const fn = await handler('@/lib/push/api/push.public-key.server', 'GET');
    const res = await fn({ params: {}, request: req('GET', undefined, false) });
    expect(res.status).toBe(404);
  });
});
