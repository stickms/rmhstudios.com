import { describe, expect, it, vi } from 'vitest';
import { fetchWithServerFnRetry, isServerFnGet } from '../server-fn-retry';
import { isTransientError } from '../transient-error';

const URL_FN = '/_serverFn/abc123?payload=x';
const ok = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
const html = (status: number) =>
  new Response('<html>bad gateway</html>', { status, headers: { 'content-type': 'text/html' } });

describe('isServerFnGet', () => {
  it('matches only GETs to /_serverFn/', () => {
    expect(isServerFnGet(URL_FN)).toBe(true);
    expect(isServerFnGet(URL_FN, { method: 'POST' })).toBe(false);
    expect(isServerFnGet('/api/feed')).toBe(false);
  });
});

describe('fetchWithServerFnRetry', () => {
  it('retries a 502 once and returns the good response', async () => {
    const f = vi.fn().mockResolvedValueOnce(html(502)).mockResolvedValueOnce(ok());
    const res = await fetchWithServerFnRetry(f as unknown as typeof fetch, URL_FN, { method: 'GET' }, 1);
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('retries a network error once', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok());
    const res = await fetchWithServerFnRetry(f as unknown as typeof fetch, URL_FN, undefined, 1);
    expect(res.status).toBe(200);
  });

  it('replaces a persistent gateway page with a short plain-text body', async () => {
    const f = vi.fn().mockResolvedValue(html(504));
    const res = await fetchWithServerFnRetry(f as unknown as typeof fetch, URL_FN, undefined, 1);
    expect(res.status).toBe(504);
    expect(await res.text()).toBe('Server temporarily unavailable (HTTP 504)');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('rethrows a persistent network error', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      fetchWithServerFnRetry(f as unknown as typeof fetch, URL_FN, undefined, 1),
    ).rejects.toThrow('Failed to fetch');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('does not retry an aborted request', async () => {
    const ac = new AbortController();
    ac.abort();
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const f = vi.fn().mockRejectedValue(abort);
    await expect(
      fetchWithServerFnRetry(f as unknown as typeof fetch, URL_FN, { signal: ac.signal }, 1),
    ).rejects.toThrow('aborted');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('never replays a POST or a non-server-fn request, and passes 4xx/500 through', async () => {
    const post = vi.fn().mockResolvedValue(html(502));
    const r1 = await fetchWithServerFnRetry(post as unknown as typeof fetch, URL_FN, { method: 'POST' }, 1);
    expect(r1.status).toBe(502);
    expect(post).toHaveBeenCalledTimes(1);

    const err500 = vi.fn().mockResolvedValue(new Response('x', { status: 500 }));
    const r2 = await fetchWithServerFnRetry(err500 as unknown as typeof fetch, URL_FN, undefined, 1);
    expect(r2.status).toBe(500);
    expect(err500).toHaveBeenCalledTimes(1);
  });
});

describe('isTransientError', () => {
  it('flags network and gateway failures', () => {
    expect(isTransientError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTransientError(new TypeError('Load failed'))).toBe(true);
    expect(isTransientError(new Error('Server temporarily unavailable (HTTP 502)'))).toBe(true);
    expect(isTransientError(new Error('<!DOCTYPE html><html lang="en">...'))).toBe(true);
  });
  it('does not flag application errors', () => {
    expect(isTransientError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError({})).toBe(false);
  });
});
