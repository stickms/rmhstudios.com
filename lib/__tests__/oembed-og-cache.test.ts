/**
 * WS6 — `/api/oembed?type=og` buffered the whole upstream body with `res.text()`
 * on every call. It now reads a capped head and caches the card per URL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { safeFetch } = vi.hoisted(() => ({ safeFetch: vi.fn() }));

vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_opts: unknown, fn: (ctx: unknown) => unknown) => fn,
}));
vi.mock('@/lib/ssrf-guard.server', () => ({
  safeFetch,
  SsrfError: class SsrfError extends Error {},
}));
vi.mock('@/lib/posts-plus/link-rescue.server', () => ({
  getArchivedCard: vi.fn().mockResolvedValue(null),
  noteLinkSeen: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/unfurl/unfurl.server', async () => {
  const actual = await vi
    .importActual<typeof import('@/lib/unfurl/unfurl.server')>('@/lib/unfurl/unfurl.server')
    .catch(() => null);
  return { readCapped: actual?.readCapped };
});
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { Route } from '@/app/routes/api/oembed';

type Get = (ctx: { request: Request }) => Promise<Response>;
const GET = (Route as unknown as { options: { server: { handlers: { GET: Get } } } }).options.server
  .handlers.GET;
const call = (url: string) =>
  GET({ request: new Request(`https://x.test/api/oembed?type=og&url=${encodeURIComponent(url)}`) });

function bodyOf(chunks: string[], pulled: { n: number }) {
  const enc = new TextEncoder();
  let i = 0;
  return new Response(
    new ReadableStream({
      pull(c) {
        pulled.n++;
        if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
        else c.close();
      },
    }),
    { status: 200 },
  );
}

beforeEach(() => safeFetch.mockReset());

describe('oembed og', () => {
  it('stops reading the origin at the cap', async () => {
    const pulled = { n: 0 };
    const head = '<html><head><meta property="og:title" content="Hello"></head>';
    // 200 x 32 kB of padding after the head: a hostile or just huge page.
    safeFetch.mockResolvedValue(bodyOf([head, ...Array(200).fill('x'.repeat(32 * 1024))], pulled));
    const res = await call('https://capped.test/a');
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('Hello');
    expect(pulled.n).toBeLessThan(10);
  });

  it('fetches a URL once and serves repeats from cache', async () => {
    safeFetch.mockImplementation(async () =>
      bodyOf(['<meta property="og:title" content="Cached">'], { n: 0 }),
    );
    const a = await call('https://cached.test/a');
    const b = await call('https://cached.test/a');
    expect((await a.json()).title).toBe('Cached');
    expect((await b.json()).title).toBe('Cached');
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an over-long url with 400 before fetching', async () => {
    const res = await call(`https://long.test/${'a'.repeat(2100)}`);
    expect(res.status).toBe(400);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it('shares one cache entry across host case and fragment variants', async () => {
    safeFetch.mockImplementation(async () =>
      bodyOf(['<meta property="og:title" content="Canon">'], { n: 0 }),
    );
    await call('https://Canon.test/a?x=1#one');
    await call('https://canon.test/a?x=1#two');
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it('does not cache an upstream failure', async () => {
    safeFetch.mockResolvedValueOnce(new Response('no', { status: 500 }));
    expect((await call('https://flaky.test/a')).status).toBe(502);
    safeFetch.mockResolvedValueOnce(
      bodyOf(['<meta property="og:title" content="Back">'], { n: 0 }),
    );
    const res = await call('https://flaky.test/a');
    expect(res.status).toBe(200);
  });
});
