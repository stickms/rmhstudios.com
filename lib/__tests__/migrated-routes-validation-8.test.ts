/**
 * C1 batch 10: routes that read the session, rate-limited or parsed the body by hand
 * (replay submit, share moment, coin gift, prediction trade, the vibe thumbnail backfill,
 * the Void Breaker score, the Discord token swap) now ride `implement()`. Pins the 401 for a
 * signed-out caller and the bespoke bodies and statuses the clients read. Drives the real
 * route handlers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  class ReplayError extends Error {
    constructor(public code: string) {
      super(code);
    }
  }
  class CoinGiftError extends Error {
    constructor(public code: string) {
      super(code);
    }
  }
  class PredictionError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  return {
    getSession: vi.fn(),
    saveReplay: vi.fn(),
    createMoment: vi.fn(),
    sendCoinGift: vi.fn(),
    placeTrade: vi.fn(),
    userFindFirst: vi.fn(),
    vibeUpdateMany: vi.fn(),
    submitGameScore: vi.fn(),
    ReplayError,
    CoinGiftError,
    PredictionError,
  };
});

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    user: { findFirst: h.userFindFirst },
    vibePage: { updateMany: h.vibeUpdateMany },
  },
}));
vi.mock('@/lib/replays.server', () => ({
  saveReplay: h.saveReplay,
  saveGhost: vi.fn(),
  getGhost: vi.fn(),
  ReplayError: h.ReplayError,
}));
vi.mock('@/lib/game/replay', () => ({ REPLAYABLE_GAME_IDS: ['lights-out'] }));
vi.mock('@/lib/moments.server', () => ({ createMoment: h.createMoment }));
vi.mock('@/lib/seo', () => ({ SITE_URL: 'https://rmhstudios.com' }));
vi.mock('@/lib/gifting/coin-gift.server', () => ({
  sendCoinGift: h.sendCoinGift,
  CoinGiftError: h.CoinGiftError,
}));
vi.mock('@/lib/recovery/hold.server', () => ({ assertNoRecoveryHold: vi.fn(async () => null) }));
vi.mock('@/lib/predictions/predictions.server', () => ({
  placeTrade: h.placeTrade,
  PredictionError: h.PredictionError,
}));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/game/submit.server', () => ({ submitGameScore: h.submitGameScore }));
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

const REPLAYS = '@/app/routes/api/replays/index';
const MOMENTS = '@/app/routes/api/moments/index';
const GIFT = '@/app/routes/api/coins/gift';
const TRADE = '@/app/routes/api/predictions/$id/trade';
const BACKFILL = '@/app/routes/api/admin/vibe/backfill-thumbs';
const VB_SCORE = '@/app/routes/api/void-breaker/score';
const DISCORD = '@/app/routes/api/discord/token';

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
  h.getSession.mockResolvedValue({ user: { id: 'u1', name: 'U', isAdmin: true } });
  for (const f of [h.saveReplay, h.createMoment, h.sendCoinGift, h.placeTrade, h.userFindFirst]) {
    f.mockReset();
  }
  h.submitGameScore.mockReset();
  h.vibeUpdateMany.mockReset();
});

describe('signed-in routes answer 401 { error: "Unauthorized" } signed out', () => {
  const ROUTES: [string, string][] = [
    [REPLAYS, 'POST'],
    [MOMENTS, 'POST'],
    [GIFT, 'POST'],
    [TRADE, 'POST'],
    [VB_SCORE, 'POST'],
  ];
  for (const [mod, method] of ROUTES) {
    it(`${method} ${mod}`, async () => {
      h.getSession.mockResolvedValue(null);
      const fn = await handler(mod, method);
      const res = await fn({ params: { id: 'p1' }, request: req(method, {}, false) });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });
  }

  it('the vibe thumbnail backfill is admin only: 401 signed out, 403 for a member', async () => {
    const fn = await handler(BACKFILL, 'POST');
    h.getSession.mockResolvedValue(null);
    expect((await fn({ params: {}, request: req('POST', {}, false) })).status).toBe(401);
    h.getSession.mockResolvedValue({ user: { id: 'u2', name: 'M', isAdmin: false } });
    const res = await fn({ params: {}, request: req('POST', {}) });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(h.vibeUpdateMany).not.toHaveBeenCalled();
  });
});

describe('bespoke 400 bodies survive', () => {
  it('replay submit: "Invalid input" for a bad body, the unknown-game text for a game that has no replay', async () => {
    const fn = await handler(REPLAYS, 'POST');
    for (const body of [{}, { game: 'x' }, '{nope']) {
      const res = await fn({ params: {}, request: req('POST', body) });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
    }
    const res = await fn({
      params: {},
      request: req('POST', { game: 'chess', data: {}, durationMs: 10 }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Unknown or non-replayable game' });
  });

  it('replay submit: a ReplayError keeps its status and text, a save answers 201', async () => {
    const fn = await handler(REPLAYS, 'POST');
    const ok = { game: 'lights-out', data: {}, durationMs: 10 };
    h.saveReplay.mockRejectedValueOnce(new h.ReplayError('TOO_LARGE'));
    let res = await fn({ params: {}, request: req('POST', ok) });
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({ error: 'Replay too large' });
    h.saveReplay.mockResolvedValueOnce({ id: 'r1', score: 7 });
    res = await fn({ params: {}, request: req('POST', ok) });
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: 'r1', score: 7, url: '/replays/r1' });
  });

  it('share moment: "Invalid input" for a bad body and for the server-side kind / payload refusals', async () => {
    const fn = await handler(MOMENTS, 'POST');
    for (const body of [{}, { kind: 'x' }, '{nope']) {
      const res = await fn({ params: {}, request: req('POST', body) });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
    }
    h.createMoment.mockRejectedValueOnce(new Error('INVALID_KIND'));
    const res = await fn({
      params: {},
      request: req('POST', { kind: 'nope', payload: { value: '1' } }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
  });

  it('share moment: a created moment answers its id and public URL', async () => {
    h.createMoment.mockResolvedValue({ id: 'm1' });
    const fn = await handler(MOMENTS, 'POST');
    const res = await fn({
      params: {},
      request: req('POST', { kind: 'streak', payload: { value: '7', extra: 1 } }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      id: 'm1',
      url: 'https://rmhstudios.com/moments/m1',
    });
  });

  it('coin gift: "Invalid input" for a bad body, 404 for an unknown recipient, the mapped text for a refusal', async () => {
    const fn = await handler(GIFT, 'POST');
    for (const body of [{}, { recipient: 'a', amount: 1 }, '{nope']) {
      const res = await fn({ params: {}, request: req('POST', body) });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
    }
    const good = { recipient: 'pal', amount: 50 };
    h.userFindFirst.mockResolvedValueOnce(null);
    let res = await fn({ params: {}, request: req('POST', good) });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Recipient not found' });
    h.userFindFirst.mockResolvedValue({ id: 'u9' });
    h.sendCoinGift.mockRejectedValueOnce(new h.CoinGiftError('CAP'));
    res = await fn({ params: {}, request: req('POST', good) });
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: "You've hit today's gift limit",
      code: 'CAP',
    });
    h.sendCoinGift.mockResolvedValueOnce(undefined);
    res = await fn({ params: {}, request: req('POST', good) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('prediction trade: the first validation message is the error, a PredictionError keeps its status', async () => {
    const fn = await handler(TRADE, 'POST');
    let res = await fn({
      params: { id: 'p1' },
      request: req('POST', { side: 'MAYBE', amount: 5 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error.length).toBeGreaterThan(0);
    expect(body.error).not.toBe('Internal Server Error');
    h.placeTrade.mockRejectedValueOnce(new h.PredictionError('Market is closed', 409));
    res = await fn({ params: { id: 'p1' }, request: req('POST', { side: 'YES', amount: 10 }) });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'Market is closed' });
    h.placeTrade.mockResolvedValueOnce({ market: { id: 'p1' }, sharesBought: 3, newBalance: 90 });
    res = await fn({ params: { id: 'p1' }, request: req('POST', { side: 'YES', amount: 10 }) });
    expect(res.status).toBe(200);
    expect(h.placeTrade).toHaveBeenLastCalledWith({
      userId: 'u1',
      predictionId: 'p1',
      side: 'YES',
      amount: 10,
    });
  });

  it('void breaker score: a body without a numeric score is "Invalid score"', async () => {
    const fn = await handler(VB_SCORE, 'POST');
    for (const body of [{}, { score: 'lots' }, '{nope']) {
      const res = await fn({ params: {}, request: req('POST', body) });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid score' });
    }
    h.submitGameScore.mockResolvedValue({ ok: true, moment: null });
    const res = await fn({ params: {}, request: req('POST', { score: 10, wave: 3, extra: 'x' }) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, linked: true, moment: null });
  });

  it('discord token: a missing or empty code is "Missing code", signed out is fine', async () => {
    h.getSession.mockResolvedValue(null);
    const fn = await handler(DISCORD, 'POST');
    for (const body of [{}, { code: '' }, { code: 5 }, '{nope']) {
      const res = await fn({ params: {}, request: req('POST', body, false) });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Missing code' });
    }
  });
});
