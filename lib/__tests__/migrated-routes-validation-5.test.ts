/**
 * C1 phase 25 batch 6: routes that used to read the session, rate-limit or parse
 * the body by hand (coin tips, membership gifts, creator tier joins, wager and
 * tournament writes, feedback, saved ladder searches, the homes geocoder) now ride
 * `implement()`. Pins the 401 for a signed-out caller and the bespoke 400 texts the
 * clients read. Drives the real route handlers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/economy/ledger.server', () => ({ transferCoins: vi.fn() }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/achievements/engine.server', () => ({ grantAchievement: vi.fn() }));
vi.mock('@/lib/recovery/hold.server', () => ({ assertNoRecoveryHold: vi.fn(async () => null) }));
vi.mock('@/lib/gifting/gift.server', () => ({
  giftMembership: vi.fn(),
  GiftError: class extends Error {},
  GIFT_PRICES: { starter: 1, pro: 2 },
  GIFT_TIER_LABELS: { starter: 'Starter', pro: 'Pro' },
}));
vi.mock('@/lib/creator/tiers.server', () => ({
  joinTier: vi.fn(async () => {
    throw Object.assign(new Error('x'), { code: 'x' });
  }),
  TierError: class extends Error {},
}));
vi.mock('@/lib/wager/wager.server', () => ({
  createWager: vi.fn(),
  listWagers: vi.fn(async () => []),
  expireStaleWagers: vi.fn(async () => {}),
  getWager: vi.fn(async () => null),
  WagerError: class extends Error {},
}));
vi.mock('@/lib/tournaments/tournament.server', () => ({
  createTournament: vi.fn(),
  listTournaments: vi.fn(async () => []),
  reportMatch: vi.fn(),
  TournamentError: class extends Error {},
}));
vi.mock('@/lib/homes/geo.server', () => ({ geocode: vi.fn(async () => []) }));
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

const TIP = '@/lib/economy/api/coins.tip.server';
const GIFT = '@/lib/gifting/api/gift-sub.server';
const JOIN = '@/lib/creator/api/creators.$id.join.server';
const WAGER = '@/lib/wager/api/wager.server';
const TOURNEY = '@/lib/tournaments/api/tournaments.server';
const T_REPORT = '@/lib/tournaments/api/tournaments.$id.matches.$matchId.report.server';
const FEEDBACK = '@/app/routes/api/feedback';
const SEARCHES = '@/lib/rmhladder/api/rmhladder.searches.server';
const GEOCODE = '@/lib/homes/api/homes.geocode.server';

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
  h.getSession.mockResolvedValue({ user: { id: 'u1', name: 'U', isAdmin: false } });
});

describe('signed-in routes answer 401 { error: "Unauthorized" } signed out', () => {
  const ROUTES: [string, string][] = [
    [TIP, 'POST'],
    [GIFT, 'POST'],
    [JOIN, 'POST'],
    [WAGER, 'POST'],
    [TOURNEY, 'POST'],
    [T_REPORT, 'POST'],
    [FEEDBACK, 'POST'],
    [SEARCHES, 'GET'],
    [SEARCHES, 'POST'],
    [SEARCHES, 'DELETE'],
    [GEOCODE, 'GET'],
  ];
  for (const [mod, method] of ROUTES) {
    it(`${method} ${mod}`, async () => {
      h.getSession.mockResolvedValue(null);
      const fn = await handler(mod, method);
      const res = await fn({
        params: { id: 'a1', matchId: 'm1' },
        request: req(method, {}, false),
      });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });
  }
});

describe('bespoke 400 texts survive', () => {
  it('tip: names the first schema issue; a self-tip has its own text', async () => {
    const fn = await handler(TIP, 'POST');
    for (const body of [{}, '{nope']) {
      const res = await fn({ params: {}, request: req('POST', body) });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(typeof json.error).toBe('string');
      expect(json.error).not.toBe('Invalid input');
    }
    const self = await fn({ params: {}, request: req('POST', { recipientId: 'u1', amount: 5 }) });
    expect(self.status).toBe(400);
    await expect(self.json()).resolves.toEqual({ error: 'You cannot tip yourself' });
  });

  it('gift, creator join: generic "Invalid input"', async () => {
    for (const mod of [GIFT, JOIN]) {
      const fn = await handler(mod, 'POST');
      for (const body of [{}, '{nope']) {
        const res = await fn({ params: { id: 'c1' }, request: req('POST', body) });
        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
      }
    }
  });

  it('wager and tournament create name the first schema issue', async () => {
    for (const mod of [WAGER, TOURNEY]) {
      const fn = await handler(mod, 'POST');
      const res = await fn({ params: {}, request: req('POST', {}) });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).not.toBe('Invalid input');
    }
  });

  it('tournament result report: generic "Invalid input"', async () => {
    const fn = await handler(T_REPORT, 'POST');
    const res = await fn({ params: { id: 't1', matchId: 'm1' }, request: req('POST', {}) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
  });

  it('feedback: names the first schema issue; malformed JSON is a 400, not a 500', async () => {
    const fn = await handler(FEEDBACK, 'POST');
    const res = await fn({
      params: {},
      request: req('POST', { category: 'bug', message: 'short' }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Message must be at least 10 characters' });
    const bad = await fn({ params: {}, request: req('POST', '{nope') });
    expect(bad.status).toBe(400);
  });

  it('saved ladder searches: "Invalid saved search" and "Missing id"', async () => {
    const post = await handler(SEARCHES, 'POST');
    const res = await post({ params: {}, request: req('POST', { name: '' }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid saved search' });
    const del = await handler(SEARCHES, 'DELETE');
    const missing = await del({ params: {}, request: req('DELETE', undefined) });
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({ error: 'Missing id' });
  });

  it('homes geocode: under three characters is an empty list', async () => {
    const fn = await handler(GEOCODE, 'GET');
    const res = await fn({
      params: {},
      request: req('GET', undefined, true, 'https://rmhstudios.com/api/homes/geocode?q=ab'),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ results: [] });
  });

  it('gift prices stay public', async () => {
    h.getSession.mockResolvedValue(null);
    const fn = await handler(GIFT, 'GET');
    const res = await fn({ params: {}, request: req('GET', undefined, false) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      prices: { starter: 1, pro: 2 },
      labels: { starter: 'Starter', pro: 'Pro' },
    });
  });
});
