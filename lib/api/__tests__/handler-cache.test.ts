/**
 * Contract tests for the caching layer of the shared site-API wrapper
 * (`lib/api/handler.server.ts`).
 *
 * Caching is the one part of this wrapper where a mistake is a *security* bug
 * rather than a performance one: a `public` response from an authenticated route
 * is stored by the CDN under the URL alone and handed to the next caller. So the
 * first thing locked down here is not a header value, it is that the unsafe
 * declaration cannot be written at all — `defineHandler` throws while the route
 * module is still being imported.
 *
 * The rest pins the narrowness of the feature: cache headers appear on a
 * successful GET and nowhere else — not on a mutation, not on an error — and a
 * 304 repeats the freshness policy so a client's stored entry does not expire on
 * a policy it saw one deploy ago.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { defineHandler, buildCacheHeaders, type CacheSpec } from '@/lib/api/handler.server';

const SIGNED_IN = { user: { id: 'u1', name: 'Ada', isAdmin: false } };

/** Unique IP per request so the shared rate-limit buckets never interfere. */
const req = (
  url = 'https://rmhstudios.com/api/test',
  init: RequestInit & { headers?: Record<string, string> } = {},
) =>
  new Request(url, {
    ...init,
    headers: { 'cf-connecting-ip': `${Math.random()}`, ...(init.headers ?? {}) },
  });

const call = (
  handler: (args: { request: Request; params: Record<string, string> }) => Promise<Response>,
  request = req(),
) => handler({ params: {}, request });

beforeEach(() => {
  getSession.mockReset();
  getSession.mockResolvedValue(SIGNED_IN);
});

/* -------------------------------------------------------------------------- */

describe('the public-cache leak guard', () => {
  const publicSpec: CacheSpec = { visibility: 'public', maxAge: 60 };

  it('throws at DEFINITION time for auth:"required" — not on the first request', () => {
    // The throw has to happen here, synchronously, while the module graph is
    // still loading. A request-time check would only fire on the paths that get
    // exercised, in an environment that has a CDN in front of it — production,
    // after the leak.
    expect(() => defineHandler({ cache: publicSpec }, async () => Response.json({}))).toThrow(
      /public.*auth 'required'/s,
    );
  });

  it('throws for auth:"admin" too', () => {
    expect(() =>
      defineHandler({ auth: 'admin', cache: publicSpec }, async () => Response.json({})),
    ).toThrow(/public.*auth 'admin'/s);
  });

  it('names the offending call site in the message', () => {
    let message = '';
    try {
      defineHandler({ cache: publicSpec }, async () => Response.json({}));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('[api] invalid cache declaration at ');
    // The frame of the `defineHandler(...)` call above, so the error points at a
    // file instead of leaving the developer to grep 465 route files.
    expect(message).toMatch(/handler-cache\.test\.ts/);
  });

  it('throws for a membership-gated route, which is per-account by construction', () => {
    expect(() =>
      defineHandler({ auth: 'optional', feature: 'custom-emoji', cache: publicSpec }, async () =>
        Response.json({}),
      ),
    ).toThrow(/feature 'custom-emoji'/);
  });

  it('allows public on auth:"none" and auth:"optional"', () => {
    expect(() =>
      defineHandler({ auth: 'none', cache: publicSpec }, async () => Response.json({})),
    ).not.toThrow();
    expect(() =>
      defineHandler({ auth: 'optional', cache: publicSpec }, async () => Response.json({})),
    ).not.toThrow();
  });

  it('allows private on an authenticated route', () => {
    expect(() =>
      defineHandler({ cache: { visibility: 'private', maxAge: 30 } }, async () =>
        Response.json({}),
      ),
    ).not.toThrow();
  });

  it('rejects a nonsense freshness value at definition time', () => {
    expect(() =>
      defineHandler({ auth: 'none', cache: { visibility: 'public', maxAge: -1 } }, async () =>
        Response.json({}),
      ),
    ).toThrow(/maxAge/);
    expect(() =>
      defineHandler(
        { auth: 'none', cache: { visibility: 'public', maxAge: 60, sMaxAge: Number.NaN } },
        async () => Response.json({}),
      ),
    ).toThrow(/sMaxAge/);
  });
});

/* -------------------------------------------------------------------------- */

describe('cache-control and vary', () => {
  it('private responses carry Vary: Cookie and never say public', async () => {
    const h = defineHandler({ cache: { visibility: 'private', maxAge: 30 } }, async () =>
      Response.json({ ok: true }),
    );
    const res = await call(h);

    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).toContain('private');
    expect(cc).not.toContain('public');
    // The belt to `private`'s braces: an intermediary that ignores `private`
    // still cannot key one user's response for the next.
    expect(res.headers.get('vary')?.split(', ')).toContain('Cookie');
  });

  it('private ignores s-maxage — a private body is never in a shared cache', () => {
    const cc = buildCacheHeaders({ visibility: 'private', maxAge: 30, sMaxAge: 600 })[
      'cache-control'
    ];
    expect(cc).not.toContain('s-maxage');
  });

  it('public responses do not vary on Cookie but always vary on Accept-Encoding', async () => {
    const h = defineHandler(
      { auth: 'none', cache: { visibility: 'public', maxAge: 60, sMaxAge: 300 } },
      async () => Response.json({ ok: true }),
    );
    const res = await call(h);

    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300');
    expect(res.headers.get('vary')).toBe('Accept-Encoding');
  });

  it('emits stale-while-revalidate and any extra vary the route declares', async () => {
    const h = defineHandler(
      {
        auth: 'none',
        cache: {
          visibility: 'public',
          maxAge: 60,
          sMaxAge: 300,
          staleWhileRevalidate: 3600,
          vary: ['Accept-Language'],
        },
      },
      async () => Response.json({ ok: true }),
    );
    const res = await call(h);

    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
    );
    expect(res.headers.get('vary')).toBe('Accept-Encoding, Accept-Language');
  });

  it('emits nothing at all when the route declares no cache', async () => {
    const h = defineHandler({ auth: 'none' }, async () => Response.json({ ok: true }));
    const res = await call(h);
    expect(res.headers.get('cache-control')).toBeNull();
    expect(res.headers.get('vary')).toBeNull();
    expect(res.headers.get('etag')).toBeNull();
  });

  it('a POST gets no cache headers even when the route declares them', async () => {
    const spec: CacheSpec = { visibility: 'private', maxAge: 30 };
    const h = defineHandler({ cache: spec }, async () => Response.json({ ok: true }));
    const res = await call(h, req('https://rmhstudios.com/api/test', { method: 'POST' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBeNull();
    expect(res.headers.get('vary')).toBeNull();
    expect(res.headers.get('etag')).toBeNull();
  });

  it('an error response gets no cache headers', async () => {
    const spec: CacheSpec = { visibility: 'public', maxAge: 60 };

    const notFound = defineHandler({ auth: 'none', cache: spec }, async () =>
      Response.json({ error: 'Not found' }, { status: 404 }),
    );
    const missing = await call(notFound);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBeNull();
    expect(missing.headers.get('etag')).toBeNull();

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = defineHandler({ auth: 'none', cache: spec }, async () => {
      throw new Error('nope');
    });
    const failed = await call(boom);
    expect(failed.status).toBe(500);
    expect(failed.headers.get('cache-control')).toBeNull();
    expect(failed.headers.get('vary')).toBeNull();
    spy.mockRestore();
  });

  it('a 401 from the wrapper itself is never cached', async () => {
    getSession.mockResolvedValue(null);
    const h = defineHandler({ cache: { visibility: 'private', maxAge: 30 } }, async () =>
      Response.json({ ok: true }),
    );
    const res = await call(h);
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe('weak etag and 304', () => {
  const spec: CacheSpec = { visibility: 'public', maxAge: 60, sMaxAge: 300 };
  const board = () =>
    defineHandler({ auth: 'none', cache: spec }, async () =>
      Response.json({ rows: [{ user: 'ada', score: 9 }] }),
    );

  it('tags a GET with a weak etag, and answers a matching If-None-Match with a 304', async () => {
    const h = board();

    const first = await call(h);
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');
    expect(etag).toMatch(/^W\/"[\w-]+"$/);

    const second = await call(
      h,
      req('https://rmhstudios.com/api/test', { headers: { 'if-none-match': etag! } }),
    );
    expect(second.status).toBe(304);
    expect(second.headers.get('etag')).toBe(etag);
    // The whole point of the 304 branch: the body is gone, the policy is not.
    expect(second.headers.get('cache-control')).toBe(first.headers.get('cache-control'));
    expect(second.headers.get('vary')).toBe(first.headers.get('vary'));
    await expect(second.text()).resolves.toBe('');
  });

  it('is stable across calls and changes when the body changes', async () => {
    let rows = 1;
    const h = defineHandler({ auth: 'none', cache: spec }, async () =>
      Response.json({ rows: Array.from({ length: rows }, (_, i) => i) }),
    );

    const a = (await call(h)).headers.get('etag');
    const b = (await call(h)).headers.get('etag');
    expect(a).toBe(b);

    rows = 2;
    expect((await call(h)).headers.get('etag')).not.toBe(a);
  });

  it('honours a comma-separated If-None-Match list and a bare `*`', async () => {
    const h = board();
    const etag = (await call(h)).headers.get('etag')!;

    const list = await call(
      h,
      req('https://rmhstudios.com/api/test', {
        headers: { 'if-none-match': `W/"stale", ${etag}, W/"older"` },
      }),
    );
    expect(list.status).toBe(304);

    const star = await call(
      h,
      req('https://rmhstudios.com/api/test', { headers: { 'if-none-match': '*' } }),
    );
    expect(star.status).toBe(304);
  });

  it('serves a 200 when the client holds a different etag', async () => {
    const res = await call(
      board(),
      req('https://rmhstudios.com/api/test', {
        headers: { 'if-none-match': 'W/"something-else"' },
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ rows: [{ user: 'ada', score: 9 }] });
  });

  it('still returns the body on the 200 leg — hashing must not consume it', async () => {
    const res = await call(board());
    await expect(res.json()).resolves.toEqual({ rows: [{ user: 'ada', score: 9 }] });
  });

  it('works without a cache spec when the route opts in explicitly', async () => {
    const h = defineHandler({ auth: 'none', etag: true }, async () => Response.json({ ok: true }));
    const first = await call(h);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    expect(first.headers.get('cache-control')).toBeNull();

    const second = await call(
      h,
      req('https://rmhstudios.com/api/test', { headers: { 'if-none-match': etag! } }),
    );
    expect(second.status).toBe(304);
    // Nothing to repeat, and nothing invented: no policy was ever declared.
    expect(second.headers.get('cache-control')).toBeNull();
  });

  it('can be opted out per route while keeping the cache policy', async () => {
    const h = defineHandler({ auth: 'none', cache: spec, etag: false }, async () =>
      Response.json({ ok: true }),
    );
    const res = await call(h);
    expect(res.headers.get('etag')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300');
  });

  it('never buffers a streaming response to hash it', async () => {
    let cancelled = false;
    const h = defineHandler(
      { auth: 'none', cache: spec },
      async () =>
        new Response(
          new ReadableStream({
            // An SSE body that never ends: hashing it would hang the request
            // forever, so the wrapper must refuse on sight.
            start() {},
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );

    const res = await call(h);
    expect(res.headers.get('etag')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300');
    expect(cancelled).toBe(false);
    await res.body?.cancel();
  });

  it('skips the hash above the size threshold', async () => {
    const huge = 'x'.repeat(300 * 1024);
    const h = defineHandler(
      { auth: 'none', cache: spec },
      async () => new Response(huge, { headers: { 'content-type': 'text/plain' } }),
    );
    const res = await call(h);
    expect(res.headers.get('etag')).toBeNull();
    // The policy still applies — only the conditional-request half is skipped.
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300');
    await expect(res.text()).resolves.toHaveLength(huge.length);
  });

  it('does not hash an already-encoded body', async () => {
    const h = defineHandler(
      { auth: 'none', cache: spec },
      async () =>
        new Response('compressed-bytes', {
          headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
        }),
    );
    expect((await call(h)).headers.get('etag')).toBeNull();
  });

  it('leaves a non-200 success (204) untagged but still cached', async () => {
    const h = defineHandler(
      { auth: 'none', cache: spec },
      async () => new Response(null, { status: 204 }),
    );
    const res = await call(h);
    expect(res.status).toBe(204);
    expect(res.headers.get('etag')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300');
  });
});
