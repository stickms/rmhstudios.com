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

  it('400s an invalid body with a GENERIC message by default', async () => {
    const h = defineHandler({ body: schema }, async () => Response.json({ ok: true }));
    const res = await h({ params: {}, request: post({ name: 'wayyy too long' }) });
    expect(res.status).toBe(400);
    // Must not leak field names or constraints to an arbitrary caller.
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
  });

  it('surfaces the zod message only when verboseValidationErrors is set', async () => {
    const h = defineHandler(
      { body: schema, verboseValidationErrors: true },
      async () => Response.json({ ok: true }),
    );
    const res = await h({ params: {}, request: post({ name: 'wayyy too long' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).not.toBe('Invalid input');
  });

  it('allowEmptyBody validates {} instead of null for a bodyless request', async () => {
    const optional = z.object({ name: z.string().optional() });

    const strict = defineHandler({ body: optional }, async () => Response.json({ ok: true }));
    expect((await strict({ params: {}, request: post('') })).status).toBe(400);

    const lenient = defineHandler(
      { body: optional, allowEmptyBody: true },
      async ({ body }) => Response.json({ got: body }),
    );
    const res = await lenient({ params: {}, request: post('') });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ got: {} });
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

/* -------------------------------------------------------------------------- */
/* Cache headers + conditional requests                                       */
/* -------------------------------------------------------------------------- */

/**
 * The `cache` / `etag` half of the wrapper had **no tests at all** until the
 * 2026-08-11 loading audit started declaring policies on real routes
 * (`docs/loading-audit-2026-08-11/03-api-caching.md`). It is the part where a
 * mistake is a data leak rather than a bug: `visibility: 'public'` on a
 * per-user response means the CDN stores the first caller's body under the URL
 * and serves it to everyone else.
 *
 * `assertCacheSpec` refuses that combination at **module load**, which is the
 * property worth pinning hardest — a request-time check would only fail on the
 * paths that get exercised, in an environment with a CDN in front, i.e. in
 * production after the leak.
 */
describe('cache spec', () => {
  it('rejects public + authenticated at definition time, not request time', () => {
    // The whole safety story: this throws while the route module is being
    // imported, so the server does not boot and the mistake cannot deploy.
    expect(() =>
      defineHandler(
        { auth: 'required', cache: { visibility: 'public', maxAge: 60 } },
        async () => Response.json({}),
      ),
    ).toThrow(/cache.visibility 'public' with auth 'required'/);

    expect(() =>
      defineHandler(
        { auth: 'admin', cache: { visibility: 'public', maxAge: 60 } },
        async () => Response.json({}),
      ),
    ).toThrow(/cache.visibility 'public' with auth 'admin'/);
  });

  it('allows public on auth none/optional', () => {
    expect(() =>
      defineHandler(
        { auth: 'none', cache: { visibility: 'public', maxAge: 60 } },
        async () => Response.json({}),
      ),
    ).not.toThrow();
    expect(() =>
      defineHandler(
        { auth: 'optional', cache: { visibility: 'public', maxAge: 60 } },
        async () => Response.json({}),
      ),
    ).not.toThrow();
  });

  it('rejects a malformed spec at definition time', () => {
    expect(() =>
      defineHandler(
        // @ts-expect-error — deliberately invalid visibility
        { auth: 'none', cache: { visibility: 'shared', maxAge: 60 } },
        async () => Response.json({}),
      ),
    ).toThrow(/must be 'public' or 'private'/);
    expect(() =>
      defineHandler(
        { auth: 'none', cache: { visibility: 'public', maxAge: -1 } },
        async () => Response.json({}),
      ),
    ).toThrow(/non-negative/);
  });

  it('writes Cache-Control and Vary on a successful GET', async () => {
    const h = defineHandler(
      {
        auth: 'none',
        cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 },
      },
      async () => Response.json({ ok: true }),
    );
    const res = await h({ params: {}, request: req() });
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
    );
    // Always-on: without it a cache can hand a gzip body to a client that never
    // asked for one.
    expect(res.headers.get('vary')).toBe('Accept-Encoding');
  });

  it('adds Vary: Cookie on a private response', async () => {
    const h = defineHandler(
      { auth: 'none', cache: { visibility: 'private', maxAge: 15 } },
      async () => Response.json({ ok: true }),
    );
    const res = await h({ params: {}, request: req() });
    // `private` is the braces; `Vary: Cookie` is the belt — it stops any
    // intermediary that ignores `private` from keying one user's response for
    // the next.
    expect(res.headers.get('cache-control')).toBe('private, max-age=15');
    expect(res.headers.get('vary')).toBe('Accept-Encoding, Cookie');
    // `s-maxage` is meaningless on a private response and must not be emitted.
    expect(res.headers.get('cache-control')).not.toMatch(/s-maxage/);
  });

  it('never puts a cache header on a mutation or an error', async () => {
    const mutation = defineHandler(
      { auth: 'none', cache: { visibility: 'public', maxAge: 60 } },
      async () => Response.json({ ok: true }),
    );
    expect((await mutation({ params: {}, request: post({}) })).headers.get('cache-control')).toBe(
      null,
    );

    const failing = defineHandler(
      { auth: 'none', cache: { visibility: 'public', maxAge: 60 } },
      async () => Response.json({ error: 'nope' }, { status: 404 }),
    );
    const res = await failing({ params: {}, request: req() });
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe(null);
  });
});

describe('conditional requests (ETag / 304)', () => {
  const cached = (body: unknown) =>
    defineHandler({ auth: 'none', cache: { visibility: 'public', maxAge: 60 } }, async () =>
      Response.json(body),
    );

  it('emits a weak ETag when cache is declared (etag defaults on)', async () => {
    const res = await cached({ a: 1 })({ params: {}, request: req() });
    expect(res.headers.get('etag')).toMatch(/^W\/"/);
  });

  it('answers a matching If-None-Match with a bodyless 304 that repeats the policy', async () => {
    const h = cached({ a: 1 });
    const etag = (await h({ params: {}, request: req() })).headers.get('etag')!;

    const res = await h({
      params: {},
      request: req('https://rmhstudios.com/api/test', { headers: { 'if-none-match': etag } }),
    });
    expect(res.status).toBe(304);
    await expect(res.text()).resolves.toBe('');
    // RFC 9110 §15.4.5: a 304 MUST repeat the caching headers. Omit them and the
    // client's stored entry keeps expiring on whatever policy it first saw,
    // which turns a quiet revalidation back into a request storm one TTL later.
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(res.headers.get('etag')).toBe(etag);
  });

  it('uses weak comparison, so W/"x" and "x" match', async () => {
    const h = cached({ a: 1 });
    const weak = (await h({ params: {}, request: req() })).headers.get('etag')!;
    const strong = weak.replace(/^W\//, '');
    const res = await h({
      params: {},
      request: req('https://rmhstudios.com/api/test', { headers: { 'if-none-match': strong } }),
    });
    expect(res.status).toBe(304);
  });

  it('matches `*` and a comma-separated list', async () => {
    const h = cached({ a: 1 });
    const etag = (await h({ params: {}, request: req() })).headers.get('etag')!;

    for (const header of ['*', `W/"nope", ${etag}, W/"also-nope"`]) {
      const res = await h({
        params: {},
        request: req('https://rmhstudios.com/api/test', { headers: { 'if-none-match': header } }),
      });
      expect(res.status, `If-None-Match: ${header}`).toBe(304);
    }
  });

  it('serves 200 when the body changed', async () => {
    const stale = (await cached({ a: 1 })({ params: {}, request: req() })).headers.get('etag')!;
    const res = await cached({ a: 2 })({
      params: {},
      request: req('https://rmhstudios.com/api/test', { headers: { 'if-none-match': stale } }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ a: 2 });
  });

  it('etag: false opts out while keeping the cache policy', async () => {
    const h = defineHandler(
      { auth: 'none', cache: { visibility: 'public', maxAge: 60 }, etag: false },
      async () => Response.json({ a: 1 }),
    );
    const res = await h({ params: {}, request: req() });
    expect(res.headers.get('etag')).toBe(null);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('etag: true works without any cache policy', async () => {
    const h = defineHandler({ auth: 'none', etag: true }, async () => Response.json({ a: 1 }));
    const res = await h({ params: {}, request: req() });
    expect(res.headers.get('etag')).toMatch(/^W\/"/);
    expect(res.headers.get('cache-control')).toBe(null);
  });

  it('refuses to hash a streaming body — an SSE response would hang forever', async () => {
    const h = defineHandler({ auth: 'none', etag: true }, async () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: hi\n\n'));
          // Deliberately never closed: this is the shape that would hang if the
          // wrapper tried to buffer it to compute a hash.
        },
      });
      return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
    });
    const res = await h({ params: {}, request: req() });
    expect(res.headers.get('etag')).toBe(null);
  });

  it('refuses to hash an already-encoded body — the hash could never match', async () => {
    const h = defineHandler(
      { auth: 'none', etag: true },
      async () =>
        new Response('compressed-bytes', {
          headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
        }),
    );
    expect((await h({ params: {}, request: req() })).headers.get('etag')).toBe(null);
  });

  it('leaves the body readable after hashing it', async () => {
    // `weakEtag` clones the response to hash it. If it consumed the original
    // instead, every cached route would return an empty body — which is the kind
    // of bug that only shows up in production.
    const res = await cached({ hello: 'world' })({ params: {}, request: req() });
    await expect(res.json()).resolves.toEqual({ hello: 'world' });
  });
});
