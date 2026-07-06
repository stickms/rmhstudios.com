import { describe, expect, it } from 'vitest';
import { politeFetch } from './http';

const stub = (status: number, body: string, capture?: { headers?: Record<string, string> }): typeof fetch =>
  (async (_url: any, init?: any) => {
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
});
