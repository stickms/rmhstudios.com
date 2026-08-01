/**
 * Contract tests for the shared site-API route wrapper.
 *
 * These lock the security-relevant behaviour that ~465 hand-rolled routes used
 * to each re-implement: the order of session → rate limit → validation, the
 * exact status codes and bodies, and — most importantly — that a thrown
 * exception becomes a bare 500 without leaking its message.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { defineHandler, apiError } from '@/lib/api/handler.server';

const req = (url = 'https://rmhstudios.com/api/test', init: RequestInit = {}) =>
  new Request(url, { headers: { 'cf-connecting-ip': `${Math.random()}` }, ...init });

const post = (body: unknown, url = 'https://rmhstudios.com/api/test') =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': `${Math.random()}` },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const SIGNED_IN = { user: { id: 'u1', name: 'Ada', isAdmin: false } };
const ADMIN = { user: { id: 'a1', name: 'Root', isAdmin: true } };

beforeEach(() => {
  getSession.mockReset();
  getSession.mockResolvedValue(SIGNED_IN);
});

describe('auth modes', () => {
  it('defaults to required and 401s anonymous callers', async () => {
    getSession.mockResolvedValue(null);
    const h = defineHandler({}, async () => Response.json({ ok: true }));
    const res = await h({ params: {}, request: req() });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('passes userId through when signed in', async () => {
    const h = defineHandler({}, async ({ userId, isAdmin }) => Response.json({ userId, isAdmin }));
    await expect((await h({ params: {}, request: req() })).json()).resolves.toEqual({
      userId: 'u1',
      isAdmin: false,
    });
  });

  it('admin mode: 401 anonymous, 403 non-admin, 200 admin', async () => {
    const h = defineHandler({ auth: 'admin' }, async () => Response.json({ ok: true }));

    getSession.mockResolvedValue(null);
    expect((await h({ params: {}, request: req() })).status).toBe(401);

    getSession.mockResolvedValue(SIGNED_IN);
    const denied = await h({ params: {}, request: req() });
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ error: 'Forbidden' });

    getSession.mockResolvedValue(ADMIN);
    expect((await h({ params: {}, request: req() })).status).toBe(200);
  });

  it('optional mode lets anonymous through with a null userId', async () => {
    getSession.mockResolvedValue(null);
    const h = defineHandler({ auth: 'optional' }, async ({ userId }) => Response.json({ userId }));
    const res = await h({ params: {}, request: req() });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: null });
  });

  it('optional mode degrades to signed-out when the session lookup throws', async () => {
    getSession.mockRejectedValue(new Error('db down'));
    const h = defineHandler({ auth: 'optional' }, async ({ userId }) => Response.json({ userId }));
    const res = await h({ params: {}, request: req() });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: null });
  });

  it('auth:none never touches the session store', async () => {
    const h = defineHandler({ auth: 'none' }, async () => Response.json({ ok: true }));
    expect((await h({ params: {}, request: req() })).status).toBe(200);
    expect(getSession).not.toHaveBeenCalled();
  });
});

describe('validation', () => {
  const schema = z.object({ name: z.string().min(1).max(10) });

  it('400s an invalid body with the first zod message', async () => {
    const h = defineHandler({ body: schema }, async () => Response.json({ ok: true }));
    const res = await h({ params: {}, request: post({ name: '' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  it('400s malformed JSON rather than throwing a 500', async () => {
    const h = defineHandler({ body: schema }, async () => Response.json({ ok: true }));
    expect((await h({ params: {}, request: post('{not json') })).status).toBe(400);
  });

  it('passes the parsed body to the handler', async () => {
    const h = defineHandler({ body: schema }, async ({ body }) => Response.json(body));
    await expect(
      (await h({ params: {}, request: post({ name: 'ok', extra: 1 }) })).json(),
    ).resolves.toEqual({
      name: 'ok',
    });
  });

  it('validates query params', async () => {
    const h = defineHandler(
      { auth: 'none', query: z.object({ page: z.coerce.number().min(1) }) },
      async ({ query }) => Response.json(query),
    );
    expect((await h({ params: {}, request: req('https://x.dev/api/t?page=0') })).status).toBe(400);
    await expect(
      (await h({ params: {}, request: req('https://x.dev/api/t?page=3') })).json(),
    ).resolves.toEqual({ page: 3 });
  });

  it('runs auth before validation — an anonymous bad body is 401, not 400', async () => {
    getSession.mockResolvedValue(null);
    const h = defineHandler({ body: schema }, async () => Response.json({ ok: true }));
    expect((await h({ params: {}, request: post({ name: '' }) })).status).toBe(401);
  });
});

describe('rate limiting', () => {
  it('429s past the limit with a Retry-After header', async () => {
    const h = defineHandler(
      { auth: 'none', rateLimit: { limit: 1, windowMs: 60_000, prefix: `t-${Math.random()}` } },
      async () => Response.json({ ok: true }),
    );
    // The global RATE_LIMIT_MULTIPLIER scales the ceiling, so drive it well past.
    const ip = 'test-ip-429';
    const one = () =>
      h({
        params: {},
        request: new Request('https://x.dev/api/t', { headers: { 'cf-connecting-ip': ip } }),
      });

    let last = await one();
    for (let i = 0; i < 12 && last.status !== 429; i++) last = await one();

    expect(last.status).toBe(429);
    expect(last.headers.get('Retry-After')).toBeTruthy();
    await expect(last.json()).resolves.toEqual({ error: 'Too many requests' });
  });

  it('runs the session check before the rate limiter', async () => {
    getSession.mockResolvedValue(null);
    const h = defineHandler(
      { rateLimit: { limit: 1, windowMs: 60_000, prefix: `t-${Math.random()}` } },
      async () => Response.json({ ok: true }),
    );
    const ip = 'test-ip-order';
    for (let i = 0; i < 12; i++) {
      const res = await h({
        params: {},
        request: new Request('https://x.dev/api/t', { headers: { 'cf-connecting-ip': ip } }),
      });
      expect(res.status).toBe(401);
    }
  });
});

describe('error containment', () => {
  it('turns a thrown exception into a bare 500 without leaking the message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = defineHandler({ auth: 'none' }, async () => {
      throw new Error('connection string postgres://user:hunter2@db/prod');
    });
    const res = await h({ params: {}, request: req() });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe(JSON.stringify({ error: 'Internal Server Error' }));
    expect(text).not.toContain('hunter2');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('passes non-JSON responses through untouched', async () => {
    const h = defineHandler(
      { auth: 'none' },
      async () => new Response('raw', { status: 206, headers: { 'X-Custom': 'y' } }),
    );
    const res = await h({ params: {}, request: req() });
    expect(res.status).toBe(206);
    expect(res.headers.get('X-Custom')).toBe('y');
    await expect(res.text()).resolves.toBe('raw');
  });

  it('exposes route params', async () => {
    const h = defineHandler({ auth: 'none' }, async ({ params }) =>
      Response.json({ id: params.id }),
    );
    await expect((await h({ request: req(), params: { id: 'abc' } })).json()).resolves.toEqual({
      id: 'abc',
    });
  });

  it('apiError builds the canonical envelope', async () => {
    const res = apiError('Nope', 418);
    expect(res.status).toBe(418);
    await expect(res.json()).resolves.toEqual({ error: 'Nope' });
  });
});
