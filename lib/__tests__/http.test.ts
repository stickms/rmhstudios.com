import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, TimeoutError, fetchJson, isRetryable, retryDelayMs } from '@/lib/http';

/**
 * The client's retry/timeout contract. React Query's global retry policy is
 * built on `isRetryable` + `retryDelayMs`, so a wrong answer here either hammers
 * the API on a 4xx or gives up on a recoverable blip for every query at once.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('isRetryable', () => {
  it('retries transport failures, timeouts, 408/425/429 and 5xx', () => {
    expect(isRetryable(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryable(new TimeoutError(10))).toBe(true);
    for (const s of [408, 425, 429, 500, 502, 503]) expect(isRetryable(new HttpError(s))).toBe(true);
  });

  it('never retries a client error or a caller abort', () => {
    for (const s of [400, 401, 403, 404, 409, 422]) expect(isRetryable(new HttpError(s))).toBe(false);
    expect(isRetryable(new DOMException('aborted', 'AbortError'))).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('backs off exponentially with jitter, capped', () => {
    expect(retryDelayMs(0, undefined, () => 0)).toBe(500);
    expect(retryDelayMs(0, undefined, () => 1)).toBe(1000);
    expect(retryDelayMs(3, undefined, () => 0)).toBe(4000);
    expect(retryDelayMs(10, undefined, () => 1)).toBe(15_000);
  });

  it("honours the server's Retry-After, capped at a minute", () => {
    expect(retryDelayMs(0, new HttpError(429, undefined, 7))).toBe(7000);
    expect(retryDelayMs(0, new HttpError(503, undefined, 600))).toBe(60_000);
  });
});

describe('fetchJson', () => {
  it('returns JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })));
    await expect(fetchJson('/x', { timeoutMs: 0 })).resolves.toEqual({ ok: 1 });
  });

  it("throws HttpError with the server's message and Retry-After", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Slow down' }), { status: 429, headers: { 'Retry-After': '3' } })),
    );
    const err = (await fetchJson('/x', { timeoutMs: 0 }).catch((e: unknown) => e)) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(429);
    expect(err.message).toBe('Slow down');
    expect(err.retryAfterSec).toBe(3);
  });

  it('times out a request that never answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_: unknown, init: RequestInit) => new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))),
    );
    await expect(fetchJson('/x', { timeoutMs: 20 })).rejects.toBeInstanceOf(TimeoutError);
  });

  it('retries an idempotent GET on a 503 but never a POST', async () => {
    vi.useFakeTimers();
    const fail = () => new Response('{}', { status: 503 });
    const get = vi.fn(async () => (get.mock.calls.length < 2 ? fail() : new Response('{"ok":true}')));
    vi.stubGlobal('fetch', get);
    const p = fetchJson('/x', { timeoutMs: 0, retries: 2 });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ ok: true });
    expect(get).toHaveBeenCalledTimes(2);

    const post = vi.fn(async () => fail());
    vi.stubGlobal('fetch', post);
    const q = fetchJson('/x', { method: 'POST', timeoutMs: 0, retries: 2 }).catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await q).toBeInstanceOf(HttpError);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 404', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', f);
    await expect(fetchJson('/x', { timeoutMs: 0, retries: 3 })).rejects.toBeInstanceOf(HttpError);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
