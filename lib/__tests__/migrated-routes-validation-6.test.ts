/**
 * C1 phase 28 batch 7: routes that used to read the session, rate-limit or parse
 * the body by hand (event create, event RSVP, market listing, studio tiers, Dream
 * Rift score) now ride `defineHandler`. Pins the 401 for a signed-out caller and
 * the bespoke 400 bodies the clients read. Drives the real route handlers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/quests/engine.server', () => ({ recordGamePlay: vi.fn() }));
vi.mock('@/lib/events.server', () => ({
  createEvent: vi.fn(),
  listEvents: vi.fn(async () => []),
  rsvp: vi.fn(),
  unrsvp: vi.fn(),
  EventError: class extends Error {},
}));
vi.mock('@/lib/market/market.server', () => ({
  listItem: vi.fn(),
  browse: vi.fn(async () => []),
  priceHistory: vi.fn(async () => null),
  MarketError: class extends Error {},
}));
vi.mock('@/lib/discovery/watch.server', () => ({ watchMarketListing: vi.fn() }));
vi.mock('@/lib/creator/tiers.server', () => ({
  listTiers: vi.fn(async () => []),
  saveTiers: vi.fn(),
  TierError: class extends Error {},
  MAX_TIERS: 3,
  TIER_PRICE_MIN: 1,
  TIER_PRICE_MAX: 100000,
}));
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

const EVENTS = '@/lib/calendar/api/events.server';
const RSVP = '@/lib/api/routes/events.$id.rsvp.server';
const LISTINGS = '@/app/routes/api/market/listings/index';
const TIERS = '@/app/routes/api/studio/tiers';
const SCORE = '@features/dream-rift/api/dream-rift.score.server';

function req(method: string, body?: unknown, cookie = true): Request {
  return new Request('https://rmhstudios.com/api/x', {
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
    [EVENTS, 'POST'],
    [RSVP, 'POST'],
    [LISTINGS, 'POST'],
    [TIERS, 'PUT'],
    [SCORE, 'POST'],
  ];
  for (const [mod, method] of ROUTES) {
    it(`${method} ${mod}`, async () => {
      h.getSession.mockResolvedValue(null);
      const fn = await handler(mod, method);
      const res = await fn({ params: { id: 'e1' }, request: req(method, {}, false) });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });
  }
});

describe('bespoke 400 bodies survive', () => {
  it('event create names the first schema issue; malformed JSON is a 400', async () => {
    const fn = await handler(EVENTS, 'POST');
    const res = await fn({ params: {}, request: req('POST', { title: 'x' }) });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(typeof json.error).toBe('string');
    expect(json.error).not.toBe('Invalid input');
    const bad = await fn({ params: {}, request: req('POST', '{nope') });
    expect(bad.status).toBe(400);
  });

  it('RSVP, market listing, studio tiers: generic "Invalid input"', async () => {
    for (const [mod, method] of [
      [RSVP, 'POST'],
      [LISTINGS, 'POST'],
      [TIERS, 'PUT'],
    ] as const) {
      const fn = await handler(mod, method);
      for (const body of [{}, '{nope']) {
        const res = await fn({ params: { id: 'e1' }, request: req(method, body) });
        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
      }
    }
  });

  it('Dream Rift score: an out-of-range score is "Invalid score"', async () => {
    const fn = await handler(SCORE, 'POST');
    const res = await fn({ params: {}, request: req('POST', { score: -1 }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid score' });
  });
});
