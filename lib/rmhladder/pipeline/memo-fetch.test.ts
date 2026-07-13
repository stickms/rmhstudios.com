import { describe, expect, it } from 'vitest';
import { memoFetch } from './memo-fetch';

function makeCountingFetch(responses: Map<string, { status: number; body: string }>) {
  const callCount = new Map<string, number>();
  const impl: typeof fetch = async (input, _init?) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    callCount.set(url, (callCount.get(url) ?? 0) + 1);
    const resp = responses.get(url);
    if (!resp) throw new Error(`No stub for ${url}`);
    return new Response(resp.body, { status: resp.status });
  };
  return { impl, callCount };
}

describe('memoFetch', () => {
  it('calls underlying impl once for the same URL fetched twice', async () => {
    const responses = new Map([
      ['https://example.com/board', { status: 200, body: '{"ok":true}' }],
    ]);
    const { impl, callCount } = makeCountingFetch(responses);
    const fetch = memoFetch(impl);

    await fetch('https://example.com/board');
    await fetch('https://example.com/board');

    expect(callCount.get('https://example.com/board')).toBe(1);
  });

  it('calls underlying impl once per unique URL', async () => {
    const responses = new Map([
      ['https://example.com/a', { status: 200, body: '"a"' }],
      ['https://example.com/b', { status: 200, body: '"b"' }],
    ]);
    const { impl, callCount } = makeCountingFetch(responses);
    const fetch = memoFetch(impl);

    await fetch('https://example.com/a');
    await fetch('https://example.com/b');
    await fetch('https://example.com/a');

    expect(callCount.get('https://example.com/a')).toBe(1);
    expect(callCount.get('https://example.com/b')).toBe(1);
  });

  it('caches non-ok (4xx/5xx) responses', async () => {
    const responses = new Map([
      ['https://example.com/gone', { status: 404, body: 'not found' }],
    ]);
    const { impl, callCount } = makeCountingFetch(responses);
    const fetch = memoFetch(impl);

    const r1 = await fetch('https://example.com/gone');
    const r2 = await fetch('https://example.com/gone');

    expect(callCount.get('https://example.com/gone')).toBe(1);
    expect(r1.status).toBe(404);
    expect(r2.status).toBe(404);
  });

  it('both callers can read the response body independently', async () => {
    const responses = new Map([
      ['https://example.com/data', { status: 200, body: '{"hello":"world"}' }],
    ]);
    const { impl } = makeCountingFetch(responses);
    const fetch = memoFetch(impl);

    const r1 = await fetch('https://example.com/data');
    const r2 = await fetch('https://example.com/data');

    // Both responses must be independently readable (not share a consumed stream)
    const body1 = await r1.text();
    const body2 = await r2.text();

    expect(body1).toBe('{"hello":"world"}');
    expect(body2).toBe('{"hello":"world"}');
  });

  it('manufactured responses carry the correct status', async () => {
    const responses = new Map([
      ['https://example.com/forbidden', { status: 403, body: 'forbidden' }],
    ]);
    const { impl } = makeCountingFetch(responses);
    const fetch = memoFetch(impl);

    const r1 = await fetch('https://example.com/forbidden');
    const r2 = await fetch('https://example.com/forbidden');

    expect(r1.status).toBe(403);
    expect(r1.ok).toBe(false);
    expect(r2.status).toBe(403);
    expect(r2.ok).toBe(false);
  });

  it('different memoFetch instances do not share cache', async () => {
    const responses = new Map([
      ['https://example.com/x', { status: 200, body: '"x"' }],
    ]);
    const { impl, callCount } = makeCountingFetch(responses);

    const fetch1 = memoFetch(impl);
    const fetch2 = memoFetch(impl);

    await fetch1('https://example.com/x');
    await fetch2('https://example.com/x');

    expect(callCount.get('https://example.com/x')).toBe(2);
  });

  it('uses global fetch when no impl provided (type check only)', () => {
    // Just verify the function can be called without arguments and returns a function
    const result = memoFetch();
    expect(typeof result).toBe('function');
  });

  it('caches Workday CXS listing POSTs by request body', async () => {
    let calls = 0;
    const impl = (async () => {
      calls++;
      return new Response('{"total":0,"jobPostings":[]}', { status: 200 });
    }) as typeof fetch;
    const fetch = memoFetch(impl);
    const url = 'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/jobs';
    const init = { method: 'POST', body: '{"offset":0}' };

    await fetch(url, init);
    await fetch(url, init);
    await fetch(url, { ...init, body: '{"offset":20}' });

    expect(calls).toBe(2);
  });

  it('does not cache arbitrary POST requests', async () => {
    let calls = 0;
    const impl = (async () => {
      calls++;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const fetch = memoFetch(impl);

    await fetch('https://example.com/mutate', { method: 'POST', body: '{}' });
    await fetch('https://example.com/mutate', { method: 'POST', body: '{}' });

    expect(calls).toBe(2);
  });
});
