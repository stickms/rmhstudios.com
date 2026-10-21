/**
 * Balance fetch + admin route behaviour with a mocked upstream. Locks the
 * error mapping (never a 500 for upstream trouble) and that the API key is
 * sent as a bearer header but never appears in a response.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

const upsert = vi.fn();
const findMany = vi.fn();
const deleteMany = vi.fn();
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    deepseekBalanceSnapshot: {
      upsert: (...a: unknown[]) => upsert(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
  },
}));

vi.mock('@/lib/cached.server', () => ({
  cached: (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
}));

import {
  DeepseekBalanceError,
  fetchDeepseekBalance,
  runDeepseekBalanceJob,
} from '@/lib/deepseek/balance.server';
import { Route as BalanceRoute } from '@/app/routes/api/admin/deepseek/balance';
import { Route as RefreshRoute } from '@/app/routes/api/admin/deepseek/refresh';
import { Route as HistoryRoute } from '@/app/routes/api/admin/deepseek/history';

const KEY = 'sk-test-secret-key';
const OK_BODY = {
  is_available: true,
  balance_infos: [
    {
      currency: 'USD',
      total_balance: '110.00',
      granted_balance: '10.00',
      topped_up_balance: '100.00',
    },
  ],
};

type Handler = (ctx: { params: object; request: Request }) => Promise<Response>;
const handlerOf = (route: unknown, method: 'GET' | 'POST'): Handler =>
  (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers[
    method
  ];

const req = (url: string, method = 'GET') =>
  new Request(url, {
    method,
    headers: { 'cf-connecting-ip': `${Math.random()}`, cookie: 'better-auth.session_token=x' },
  });

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = KEY;
  delete process.env.DEEPSEEK_BASE_URL;
  fetchMock.mockReset();
  upsert.mockReset().mockResolvedValue({});
  findMany.mockReset().mockResolvedValue([]);
  deleteMany.mockReset().mockResolvedValue({ count: 0 });
  getSession.mockReset().mockResolvedValue({ user: { id: 'a1', isAdmin: true } });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DEEPSEEK_API_KEY;
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('fetchDeepseekBalance', () => {
  it('parses string amounts and sends the bearer key to /user/balance without /v1', async () => {
    process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1/';
    fetchMock.mockResolvedValue(json(OK_BODY));
    const b = await fetchDeepseekBalance();
    expect(b.isAvailable).toBe(true);
    expect(b.balances).toEqual([
      { currency: 'USD', totalBalance: 110, grantedBalance: 10, toppedUpBalance: 100 },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/user/balance');
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${KEY}`,
      Accept: 'application/json',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws not_configured without calling upstream', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    await expect(fetchDeepseekBalance()).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps upstream status, timeout and bad bodies to typed errors', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500));
    await expect(fetchDeepseekBalance()).rejects.toMatchObject({ code: 'http_500' });

    fetchMock.mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    await expect(fetchDeepseekBalance()).rejects.toMatchObject({ code: 'timeout' });

    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    await expect(fetchDeepseekBalance()).rejects.toMatchObject({ code: 'invalid_response' });

    fetchMock.mockResolvedValueOnce(
      json({ is_available: true, balance_infos: [{ currency: 'USD' }] }),
    );
    await expect(fetchDeepseekBalance()).rejects.toBeInstanceOf(DeepseekBalanceError);
  });
});

describe('GET /api/admin/deepseek/balance', () => {
  const get = () =>
    handlerOf(BalanceRoute, 'GET')({ params: {}, request: req('https://x.test/a') });

  it('returns the live balance', async () => {
    fetchMock.mockResolvedValue(json(OK_BODY));
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.live.balances[0].totalBalance).toBe(110);
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  it('503 not_configured', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const res = await get();
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: 'not_configured' });
  });

  it('502 on an upstream 500, 504 on timeout, 502 on bad JSON', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500));
    let res = await get();
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: 'http_500', upstreamStatus: 500 });

    fetchMock.mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    res = await get();
    expect(res.status).toBe(504);
    await expect(res.json()).resolves.toMatchObject({ error: 'timeout' });

    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 200 }));
    res = await get();
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: 'invalid_response' });
  });

  it('403s non-admins', async () => {
    getSession.mockResolvedValue({ user: { id: 'u', isAdmin: false } });
    expect((await get()).status).toBe(403);
  });
});

describe('POST /api/admin/deepseek/refresh', () => {
  it('persists a manual snapshot per currency', async () => {
    fetchMock.mockResolvedValue(json(OK_BODY));
    const res = await handlerOf(
      RefreshRoute,
      'POST',
    )({
      params: {},
      request: req('https://x.test/r', 'POST'),
    });
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      currency: 'USD',
      source: 'manual',
      totalBalance: 110,
    });
  });

  it('maps upstream failure without writing', async () => {
    fetchMock.mockResolvedValue(json({}, 500));
    const res = await handlerOf(
      RefreshRoute,
      'POST',
    )({
      params: {},
      request: req('https://x.test/r', 'POST'),
    });
    expect(res.status).toBe(502);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/deepseek/history', () => {
  const hist = (qs: string) =>
    handlerOf(HistoryRoute, 'GET')({ params: {}, request: req(`https://x.test/h${qs}`) });

  it('rejects hours outside 1..9600', async () => {
    expect((await hist('?hours=0')).status).toBe(400);
    expect((await hist('?hours=9601')).status).toBe(400);
  });

  it('returns hourly series with a summary', async () => {
    const row = (iso: string, n: number) => ({
      createdAt: new Date(iso),
      currency: 'USD',
      totalBalance: n,
      grantedBalance: 0,
      toppedUpBalance: n,
      source: 'cron',
    });
    findMany.mockResolvedValue([row('2026-10-21T00:05:00Z', 10), row('2026-10-21T02:05:00Z', 8)]);
    const res = await hist('');
    const body = await res.json();
    expect(body.hours).toBe(168);
    expect(body.series[0].points).toHaveLength(2);
    expect(body.series[0].summary.perHour).toBe(1);
  });
});

describe('runDeepseekBalanceJob', () => {
  it('skips silently when unconfigured', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    await expect(runDeepseekBalanceJob()).resolves.toEqual({ recorded: 0, pruned: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    debug.mockRestore();
  });

  it('records a cron snapshot and prunes rows older than 400 days', async () => {
    fetchMock.mockResolvedValue(json(OK_BODY));
    deleteMany.mockResolvedValue({ count: 3 });
    await expect(runDeepseekBalanceJob()).resolves.toEqual({ recorded: 1, pruned: 3 });
    expect(upsert.mock.calls[0][0].create.source).toBe('cron');
    const cutoff: Date = deleteMany.mock.calls[0][0].where.createdAt.lt;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThan(399 * 86_400_000);
  });

  it('still prunes and never logs the key when the fetch fails', async () => {
    fetchMock.mockResolvedValue(json({}, 401));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runDeepseekBalanceJob();
    expect(deleteMany).toHaveBeenCalled();
    expect(JSON.stringify(err.mock.calls)).not.toContain(KEY);
    err.mockRestore();
  });
});
