import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  buildUnfurled,
  canonicalizeUrl,
  hostOf,
  parseOpenGraph,
  proxiedImageUrl,
} from '@/lib/unfurl/parse';

/**
 * B15 — the two things about the unfurler that are worth a regression test:
 * the metadata precedence (og:* beats twitter:* beats <title>) and the refusal
 * of a private/loopback destination.
 *
 * The second one is mocked at the `safeFetch` seam rather than by pointing a
 * real fetch at 127.0.0.1: what must hold is that `unfurl` (a) routes through
 * the guard at all and (b) lets an `SsrfError` out instead of swallowing it into
 * a generic "no preview", which is what would quietly turn a refusal into a
 * retry loop against an internal address.
 */

vi.mock('@/lib/redis.server', () => ({
  redisGetJSON: vi.fn(async () => null),
  redisSetJSON: vi.fn(async () => {}),
}));

vi.mock('@/lib/ssrf-guard.server', async (importOriginal) => {
  // The real SsrfError class, so `instanceof` in the module under test is
  // testing the same identity production does.
  const actual = await importOriginal<typeof import('@/lib/ssrf-guard.server')>();
  return { ...actual, safeFetch: vi.fn() };
});

const { safeFetch, SsrfError } = await import('@/lib/ssrf-guard.server');
const { unfurl } = await import('@/lib/unfurl/unfurl.server');
const mockSafeFetch = vi.mocked(safeFetch);

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

beforeEach(() => {
  mockSafeFetch.mockReset();
  // Nothing in the unfurl path may reach the network except through safeFetch.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('bare fetch() is forbidden in the unfurl path');
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseOpenGraph precedence', () => {
  it('prefers og:* over twitter:* over <title>', () => {
    const meta = parseOpenGraph(`
      <html><head>
        <title>Document title</title>
        <meta name="twitter:title" content="Twitter title">
        <meta property="og:title" content="OG title">
        <meta name="twitter:description" content="Twitter description">
        <meta property="og:description" content="OG description">
        <meta name="twitter:image" content="https://cdn.example.com/twitter.png">
        <meta property="og:image" content="https://cdn.example.com/og.png">
        <meta property="og:site_name" content="Example">
      </head></html>
    `);

    expect(meta.title).toBe('OG title');
    expect(meta.description).toBe('OG description');
    expect(meta.image).toBe('https://cdn.example.com/og.png');
    expect(meta.siteName).toBe('Example');
  });

  it('falls back to twitter:* when og:* is absent', () => {
    const meta = parseOpenGraph(`
      <title>Document title</title>
      <meta name="twitter:title" content="Twitter title">
      <meta name="twitter:image:src" content="https://cdn.example.com/t.png">
    `);

    expect(meta.title).toBe('Twitter title');
    expect(meta.image).toBe('https://cdn.example.com/t.png');
  });

  it('falls back to <title> and <meta name="description"> last', () => {
    const meta = parseOpenGraph(`
      <head><title>  Document
        title </title>
      <meta name="description" content="Plain description"></head>
    `);

    expect(meta.title).toBe('Document title');
    expect(meta.description).toBe('Plain description');
    expect(meta.image).toBeNull();
  });

  it('reads single-quoted and reversed attribute order, and decodes entities', () => {
    const meta = parseOpenGraph(
      `<meta content='Ben &amp; Jerry&#39;s' property='og:title'><meta property="og:description" content="a &lt;b&gt; c">`,
    );

    expect(meta.title).toBe("Ben & Jerry's");
    expect(meta.description).toBe('a <b> c');
  });

  it('returns nulls for a document with no metadata at all', () => {
    const meta = parseOpenGraph('<html><body><p>hello</p></body></html>');
    expect(meta).toEqual({ title: null, description: null, image: null, siteName: null });
  });
});

describe('canonicalizeUrl', () => {
  it('strips tracking params, the hash and the default port, and sorts the rest', () => {
    expect(
      canonicalizeUrl('https://Example.com:443/post?b=2&utm_source=x&a=1&fbclid=zz#section'),
    ).toBe('https://example.com/post?a=1&b=2');
  });

  it('maps equivalent spellings of one document onto one key', () => {
    const a = canonicalizeUrl('https://example.com/?utm_campaign=spring');
    const b = canonicalizeUrl('https://EXAMPLE.com#top');
    expect(a).toBe(b);
  });

  it('refuses anything that is not an absolute http(s) URL', () => {
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalizeUrl('data:text/html,<b>x')).toBeNull();
    expect(canonicalizeUrl('/relative/path')).toBeNull();
    expect(canonicalizeUrl('not a url')).toBeNull();
  });
});

describe('image proxying', () => {
  it('routes every image through /api/image-proxy', () => {
    expect(proxiedImageUrl('https://cdn.example.com/a.png')).toBe(
      `/api/image-proxy?url=${encodeURIComponent('https://cdn.example.com/a.png')}`,
    );
  });

  it('resolves a relative image against the page URL', () => {
    expect(proxiedImageUrl('/img/hero.png', 'https://example.com/post')).toBe(
      `/api/image-proxy?url=${encodeURIComponent('https://example.com/img/hero.png')}`,
    );
  });

  it('drops data: and other non-http images', () => {
    expect(proxiedImageUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(proxiedImageUrl(null)).toBeNull();
  });

  it('buildUnfurled never emits a third-party image URL', () => {
    const out = buildUnfurled('https://example.com/post', {
      title: 'T',
      description: null,
      image: 'https://evil.example.net/tracker.gif',
      siteName: null,
    });
    expect(out.image?.startsWith('/api/image-proxy?url=')).toBe(true);
    expect(out.site).toBe('example.com');
  });
});

describe('hostOf', () => {
  it('drops the www prefix and survives garbage', () => {
    expect(hostOf('https://www.example.com/x')).toBe('example.com');
    expect(hostOf('nope')).toBe('');
  });
});

describe('unfurl()', () => {
  it('refuses a loopback URL — the guard error is not swallowed', async () => {
    mockSafeFetch.mockRejectedValue(new SsrfError('Disallowed IP address'));

    await expect(unfurl('http://127.0.0.1:7005/admin')).rejects.toBeInstanceOf(SsrfError);
    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
  });

  it('never even reaches the guard for a private URL that is not http(s)', async () => {
    await expect(unfurl('file:///etc/passwd')).resolves.toBeNull();
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it('returns proxied metadata for a healthy page', async () => {
    mockSafeFetch.mockResolvedValue(
      htmlResponse(
        `<meta property="og:title" content="Hello"><meta property="og:image" content="https://cdn.example.com/x.png">`,
      ),
    );

    const out = await unfurl('https://example.com/post?utm_source=feed');

    expect(out).not.toBeNull();
    expect(out?.url).toBe('https://example.com/post');
    expect(out?.title).toBe('Hello');
    expect(out?.image).toBe(
      `/api/image-proxy?url=${encodeURIComponent('https://cdn.example.com/x.png')}`,
    );
    expect(out?.site).toBe('example.com');
  });

  it('returns null for a non-HTML upstream', async () => {
    mockSafeFetch.mockResolvedValue(
      new Response('%PDF-1.7', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    );

    await expect(unfurl('https://example.com/paper.pdf')).resolves.toBeNull();
  });

  it('returns null when the page carries no usable metadata', async () => {
    mockSafeFetch.mockResolvedValue(htmlResponse('<html><body>nothing</body></html>'));
    await expect(unfurl('https://example.com/empty')).resolves.toBeNull();
  });

  it('stops reading at the byte cap instead of buffering the whole body', async () => {
    // 2 MB of filler after the metadata: the parse must still succeed, and the
    // reader must not have consumed the whole stream.
    const head = `<meta property="og:title" content="Capped">`;
    const filler = 'x'.repeat(2 * 1024 * 1024);
    mockSafeFetch.mockResolvedValue(htmlResponse(head + filler));

    const out = await unfurl('https://example.com/huge');
    expect(out?.title).toBe('Capped');
  });
});
