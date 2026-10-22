/**
 * The server-side response micro-cache for public `defineHandler` GETs.
 * See lib/api/response-cache.server.ts for the safety argument; this file holds
 * the behaviour that argument depends on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { defineHandler } from '@/lib/api/handler.server';
import { clearResponseCache } from '@/lib/api/response-cache.server';

const PUBLIC = {
  visibility: 'public',
  maxAge: 30,
  sMaxAge: 60,
  staleWhileRevalidate: 300,
} as const;
let n = 0;
const req = (path = '/api/t', init: RequestInit = {}) =>
  new Request(`https://rmhstudios.com${path}`, {
    headers: { 'cf-connecting-ip': `10.0.0.${n++ % 250}`, ...(init.headers as object) },
    method: init.method,
  });

beforeEach(() => {
  clearResponseCache();
  getSession.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => vi.useRealTimers());

describe('response micro-cache', () => {
  it('runs the handler once for repeated identical GETs and serves identical bytes and headers', async () => {
    const run = vi.fn(async () => Response.json({ rows: [1, 2, 3] }));
    const h = defineHandler({ auth: 'none', cache: PUBLIC }, run);

    const a = await h({ params: {}, request: req('/api/t?x=1') });
    const b = await h({ params: {}, request: req('/api/t?x=1') });

    expect(run).toHaveBeenCalledTimes(1);
    expect(await b.text()).toBe(await a.text());
    for (const r of [a, b]) {
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toMatch(/json/);
      expect(r.headers.get('cache-control')).toBe(
        'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      );
    }
    expect(b.headers.get('etag')).toBe(a.headers.get('etag'));
  });

  it('keys on the query string and the path', async () => {
    const run = vi.fn(async ({ request }) => Response.json({ u: request.url }));
    const h = defineHandler({ auth: 'none', cache: PUBLIC }, run);
    await h({ params: {}, request: req('/api/t?x=1') });
    await h({ params: {}, request: req('/api/t?x=2') });
    await h({ params: {}, request: req('/api/u?x=1') });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('still answers If-None-Match with a 304 from a cached body', async () => {
    const h = defineHandler({ auth: 'none', cache: PUBLIC }, async () => Response.json({ a: 1 }));
    const first = await h({ params: {}, request: req() });
    const second = await h({
      params: {},
      request: req('/api/t', { headers: { 'if-none-match': first.headers.get('etag')! } }),
    });
    expect(second.status).toBe(304);
  });

  it('expires after min(sMaxAge, 30 s)', async () => {
    const run = vi.fn(async () => Response.json({ a: 1 }));
    const h = defineHandler(
      { auth: 'none', cache: { ...PUBLIC, sMaxAge: 86_400 } },
      run, // a day-long shared window is still held at most 30 s here
    );
    await h({ params: {}, request: req() });
    vi.setSystemTime(Date.now() + 29_000);
    await h({ params: {}, request: req() });
    expect(run).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2_000);
    await h({ params: {}, request: req() });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('never caches errors, empty bodies, cookies or non-GET', async () => {
    const bad = vi.fn(async () => Response.json({ error: 'x' }, { status: 500 }));
    const hb = defineHandler({ auth: 'none', cache: PUBLIC }, bad);
    await hb({ params: {}, request: req() });
    await hb({ params: {}, request: req() });
    expect(bad).toHaveBeenCalledTimes(2);

    const cookie = vi.fn(
      async () =>
        new Response('{}', {
          headers: { 'set-cookie': 'a=b', 'content-type': 'application/json' },
        }),
    );
    const hc = defineHandler({ auth: 'none', cache: PUBLIC }, cookie);
    await hc({ params: {}, request: req('/api/c') });
    await hc({ params: {}, request: req('/api/c') });
    expect(cookie).toHaveBeenCalledTimes(2);

    const post = vi.fn(async () => Response.json({ ok: true }));
    const hp = defineHandler({ auth: 'none', cache: PUBLIC }, post);
    await hp({ params: {}, request: req('/api/p', { method: 'POST' }) });
    await hp({ params: {}, request: req('/api/p', { method: 'POST' }) });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('never applies to private policies, authenticated modes or routes without a policy', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    const mk = (opts: Parameters<typeof defineHandler>[0]) => {
      const run = vi.fn(async () => Response.json({ a: 1 }));
      return { run, h: defineHandler(opts as never, run as never) };
    };
    const cases = [
      mk({ auth: 'none', cache: { visibility: 'private', maxAge: 30 } }),
      mk({ auth: 'optional', cache: PUBLIC }),
      mk({ auth: 'none' }),
    ];
    for (const { h } of cases) {
      await h({ params: {}, request: req('/api/z') });
      await h({ params: {}, request: req('/api/z') });
    }
    for (const { run } of cases) expect(run).toHaveBeenCalledTimes(2);
  });

  it('skips a route that declares vary (the key does not carry those headers)', async () => {
    const run = vi.fn(async ({ request }) =>
      Response.json({ lang: request.headers.get('accept-language') }),
    );
    const h = defineHandler({ auth: 'none', cache: { ...PUBLIC, vary: ['Accept-Language'] } }, run);
    const en = await h({ params: {}, request: req('/api/t', { headers: { 'accept-language': 'en' } }) });
    const fr = await h({ params: {}, request: req('/api/t', { headers: { 'accept-language': 'fr' } }) });
    expect(run).toHaveBeenCalledTimes(2);
    expect(await en.json()).toEqual({ lang: 'en' });
    expect(await fr.json()).toEqual({ lang: 'fr' });
  });

  it('still rate-limits cached routes (the limiter runs before the cache)', async () => {
    const run = vi.fn(async () => Response.json({ a: 1 }));
    const h = defineHandler(
      { auth: 'none', cache: PUBLIC, rateLimit: { limit: 1, windowMs: 60_000, prefix: 'rc-test' } },
      run,
    );
    const same = { headers: { 'cf-connecting-ip': '203.0.113.9' } };
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++)
      statuses.push((await h({ params: {}, request: req('/api/r', same) })).status);
    expect(statuses).toContain(429);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent misses into one handler run', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const run = vi.fn(async () => {
      await gate;
      return Response.json({ a: 1 });
    });
    const h = defineHandler({ auth: 'none', cache: PUBLIC }, run);
    const all = Promise.all([1, 2, 3, 4].map(() => h({ params: {}, request: req('/api/s') })));
    await Promise.resolve();
    release();
    const res = await all;
    expect(run).toHaveBeenCalledTimes(1);
    expect(await Promise.all(res.map((r) => r.text()))).toEqual(Array(4).fill('{"a":1}'));
  });

  it('a throwing leader does not poison followers', async () => {
    let calls = 0;
    const run = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return Response.json({ ok: 1 });
    });
    const h = defineHandler({ auth: 'none', cache: PUBLIC }, run);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const [a, b] = await Promise.all([
      h({ params: {}, request: req('/api/e') }),
      h({ params: {}, request: req('/api/e') }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 500]);
  });
});
