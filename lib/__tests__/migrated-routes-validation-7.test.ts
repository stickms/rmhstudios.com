/**
 * C1 phase 29 batch 8: routes that read the session, rate-limited or parsed the
 * body by hand (ask the feed, AI search, mention search, the library quota, the
 * redemption review, the homes AI image) now ride `implement()`. Pins the 401 for a
 * signed-out caller and the bespoke 400 bodies the clients read. Drives the real
 * route handlers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  requestQuota: vi.fn(),
  searchMentionUsers: vi.fn(async () => []),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/ai/text.server', () => ({
  askFeed: vi.fn(),
  answerSearch: vi.fn(),
  isAITextConfigured: () => false,
}));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: vi.fn(async () => []) }));
vi.mock('@/lib/feed/audience.server', () => ({ communityVisibleWhere: vi.fn(() => ({})) }));
vi.mock('@/lib/search/universal.server', () => ({ universalSearch: vi.fn() }));
vi.mock('@/lib/feed/mention-search.server', () => ({ searchMentionUsers: h.searchMentionUsers }));
vi.mock('@/lib/library/quota.server', () => ({
  getQuotaStatus: vi.fn(async () => ({ used: 0 })),
  requestQuota: h.requestQuota,
}));
vi.mock('@/lib/creator/earnings.server', () => ({
  reviewRedemption: vi.fn(),
  RedemptionError: class extends Error {},
}));
vi.mock('@/lib/homes/ai-image.server', () => ({
  generateListingImage: vi.fn(),
  isListingImageAIConfigured: () => false,
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
  const m = (await import(/* @vite-ignore */ mod)) as {
    Route: { options: { server: { handlers: Record<string, Handler> } } };
  };
  return m.Route.options.server.handlers[method]!;
}

const ASK_FEED = '@/app/routes/api/ai/ask-feed';
const AI_SEARCH = '@/app/routes/api/ai/search';
const MENTION = '@/app/routes/api/feed/mention-search';
const QUOTA = '@/app/routes/api/library/quota';
const REDEMPTION = '@/app/routes/api/admin/redemptions/$id';
const HOMES_AI = '@/app/routes/api/homes/ai-image';

function req(method: string, body?: unknown, cookie = true, search = ''): Request {
  return new Request(`https://rmhstudios.com/api/x${search}`, {
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
  h.requestQuota.mockReset();
});

describe('signed-in routes answer 401 { error: "Unauthorized" } signed out', () => {
  const ROUTES: [string, string][] = [
    [ASK_FEED, 'POST'],
    [AI_SEARCH, 'POST'],
    [QUOTA, 'GET'],
    [QUOTA, 'POST'],
    [REDEMPTION, 'POST'],
    [HOMES_AI, 'GET'],
    [HOMES_AI, 'POST'],
  ];
  for (const [mod, method] of ROUTES) {
    it(`${method} ${mod}`, async () => {
      h.getSession.mockResolvedValue(null);
      const fn = await handler(mod, method);
      const res = await fn({ params: { id: 'r1' }, request: req(method, {}, false) });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });
  }
});

describe('bespoke 400 bodies survive', () => {
  it('ask the feed and AI search: generic "Invalid input" for a bad or empty body', async () => {
    for (const mod of [ASK_FEED, AI_SEARCH]) {
      const fn = await handler(mod, 'POST');
      for (const body of [{}, { question: 'x', q: 'x' }, '{nope']) {
        const res = await fn({ params: {}, request: req('POST', body) });
        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
      }
    }
  });

  it('redemption review: "Invalid input" for a bad action or malformed JSON', async () => {
    const fn = await handler(REDEMPTION, 'POST');
    for (const body of [{}, { action: 'bogus' }, '{nope']) {
      const res = await fn({ params: { id: 'r1' }, request: req('POST', body) });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
    }
  });

  it('homes AI image: a missing prompt names what to enter', async () => {
    const fn = await handler(HOMES_AI, 'POST');
    for (const body of [{}, { prompt: '' }, '{nope']) {
      const res = await fn({ params: {}, request: req('POST', body) });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Enter a description to generate.' });
    }
  });
});

describe('lenient inputs survive', () => {
  it('library quota appeal: a bad number and a missing reason reach requestQuota as NaN / ""', async () => {
    h.requestQuota.mockResolvedValue({ ok: false, error: 'Pick a higher total.', status: 400 });
    const fn = await handler(QUOTA, 'POST');
    const res = await fn({ params: {}, request: req('POST', { requestedTotal: 'lots' }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Pick a higher total.' });
    const [, total, reason] = h.requestQuota.mock.calls[0] as [string, number, string];
    expect(Number.isNaN(total)).toBe(true);
    expect(reason).toBe('');
  });

  it('library quota appeal: a good appeal answers { ok: true }', async () => {
    h.requestQuota.mockResolvedValue({ ok: true });
    const fn = await handler(QUOTA, 'POST');
    const res = await fn({
      params: {},
      request: req('POST', { requestedTotal: 20, reason: 'a lot of books' }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(h.requestQuota).toHaveBeenCalledWith('u1', 20, 'a lot of books');
  });

  it('mention search: signed out is fine and a missing q is the empty query', async () => {
    h.getSession.mockResolvedValue(null);
    const fn = await handler(MENTION, 'GET');
    const res = await fn({ params: {}, request: req('GET', undefined, false) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ users: [] });
    expect(h.searchMentionUsers).toHaveBeenCalledWith('', undefined);
  });
});
