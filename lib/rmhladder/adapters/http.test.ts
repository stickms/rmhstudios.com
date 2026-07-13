import { describe, expect, it } from 'vitest';
import { DomainRateLimiter, parseSafeLadderUrl, politeFetch } from './http';

const stub = (status: number, body: string, capture?: { headers?: Record<string, string> }): typeof fetch =>
  (async (_url: unknown, init?: RequestInit) => {
    if (capture) capture.headers = Object.fromEntries(new Headers(init?.headers).entries());
    return new Response(body, { status });
  }) as typeof fetch;

describe('politeFetch', () => {
  it('returns body and ok on 200', async () => {
    const r = await politeFetch('https://example.com/x', { fetchImpl: stub(200, '{"a":1}') });
    expect(r).toEqual({ ok: true, status: 200, body: '{"a":1}' });
  });
  it('returns ok:false on 404 without throwing', async () => {
    const r = await politeFetch('https://example.com/x', { fetchImpl: stub(404, 'nope') });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });
  it('sends the custom User-Agent', async () => {
    const cap: { headers?: Record<string, string> } = {};
    await politeFetch('https://example.com/x', { fetchImpl: stub(200, '', cap) });
    expect(cap.headers?.['user-agent']).toMatch(/rmhladder-bot/);
  });
  it('never throws on network failure', async () => {
    const boom = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const r = await politeFetch('https://example.com/x', { fetchImpl: boom });
    expect(r).toEqual({ ok: false, status: 0, body: '' });
  });

  it('forwards method, body, and caller headers', async () => {
    let captured: RequestInit | undefined;
    const impl = (async (_url: unknown, init?: RequestInit) => {
      captured = init;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    await politeFetch('https://example.com/jobs', {
      fetchImpl: impl,
      init: { method: 'POST', body: '{"offset":0}', headers: { 'content-type': 'application/json' } },
    });

    expect(captured?.method).toBe('POST');
    expect(captured?.body).toBe('{"offset":0}');
    expect(new Headers(captured?.headers).get('content-type')).toBe('application/json');
  });

  it.each([
    'http://example.com/jobs',
    'https://localhost/jobs',
    'https://api.internal/jobs',
    'https://127.0.0.1/jobs',
    'https://10.1.2.3/jobs',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/jobs',
    'https://user:pass@example.com/jobs',
    'not-a-url',
  ])('rejects unsafe URL %s without fetching', async (url) => {
    let called = false;
    const impl = (async () => {
      called = true;
      return new Response('unexpected');
    }) as typeof fetch;

    expect(parseSafeLadderUrl(url)).toBeNull();
    await expect(politeFetch(url, { fetchImpl: impl })).resolves.toEqual({ ok: false, status: 0, body: '' });
    expect(called).toBe(false);
  });

  it('accepts a public HTTPS URL', () => {
    expect(parseSafeLadderUrl('https://boards-api.greenhouse.io/v1/boards/acme/jobs')?.hostname)
      .toBe('boards-api.greenhouse.io');
  });
});

describe('DomainRateLimiter', () => {
  it('spaces requests to the same domain while allowing a different domain immediately', async () => {
    let now = 10_000;
    const waits: number[] = [];
    const limiter = new DomainRateLimiter(
      1_000,
      () => now,
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
    );

    await limiter.wait(new URL('https://example.com/one'));
    await limiter.wait(new URL('https://other.example/two'));
    await limiter.wait(new URL('https://example.com/three'));

    expect(waits).toEqual([1_000]);
  });

  it('queues concurrent calls for one domain', async () => {
    let now = 0;
    const waits: number[] = [];
    const limiter = new DomainRateLimiter(
      250,
      () => now,
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
    );

    await Promise.all([
      limiter.wait(new URL('https://example.com/one')),
      limiter.wait(new URL('https://example.com/two')),
      limiter.wait(new URL('https://example.com/three')),
    ]);

    expect(waits).toEqual([250, 250]);
  });
});
