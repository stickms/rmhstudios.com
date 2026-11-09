/**
 * Typed API contracts (redesign audit C1): the URL/body the client sends, and
 * the compile-time guarantees `implement()` makes on the server side.
 *
 * The `@ts-expect-error` lines are the point of the type tests: `pnpm typecheck`
 * fails if any of them stops being an error, i.e. if a mismatched schema or a
 * wrong response shape is ever accepted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

import { buildPath, buildQuery, endpoint } from '@/lib/contract/endpoint';
import { api, apiQuery, apiUrl } from '@/lib/contract/client';
import { implement } from '@/lib/api/implement.server';

const itemBody = z.object({ name: z.string() });
const item = z.object({ id: z.string(), name: z.string() });

const getItem = endpoint<{ res: z.infer<typeof item> }>()({
  method: 'GET',
  path: '/api/things/$id/items/$itemId',
});
const createItem = endpoint<{ body: z.infer<typeof itemBody>; res: z.infer<typeof item> }>()({
  method: 'POST',
  path: '/api/things/$id/items',
});
const listItems = endpoint<{ query: { cursor?: string; tag?: string[] }; res: { items: unknown[] } }>()(
  { method: 'GET', path: '/api/items' },
);

describe('path and query building', () => {
  it('fills $params and encodes them', () => {
    expect(buildPath('/api/a/$id/b/$slug', { id: 'x y', slug: 'ä/b' })).toBe('/api/a/x%20y/b/%C3%A4%2Fb');
  });
  it('throws on a missing param instead of sending /undefined', () => {
    expect(() => buildPath('/api/a/$id', {})).toThrow(/missing path param "id"/);
  });
  it('drops null/undefined and repeats array keys', () => {
    expect(buildQuery({ a: 1, b: undefined, c: null, t: ['x', 'y'] })).toBe('?a=1&t=x&t=y');
    expect(buildQuery({})).toBe('');
  });
  it('rejects a contract outside /api/', () => {
    expect(() => endpoint<{ res: null }>()({ method: 'GET', path: '/nope' })).toThrow();
  });
});

describe('api()', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(Response.json({ id: '1', name: 'n' }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('GETs the filled path with credentials and no body', async () => {
    const res = await api(getItem, { params: { id: 't1', itemId: 'i9' } });
    expect(res).toEqual({ id: '1', name: 'n' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/things/t1/items/i9');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
  });

  it('POSTs a JSON body', async () => {
    await api(createItem, { params: { id: 't1' }, body: { name: 'x' } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/things/t1/items');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"name":"x"}');
  });

  it('surfaces the server error envelope as an HttpError', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Not found' }, { status: 404 }));
    await expect(api(getItem, { params: { id: 'a', itemId: 'b' } })).rejects.toMatchObject({
      status: 404,
      message: 'Not found',
    });
  });

  it('apiUrl and apiQuery key on the template', () => {
    expect(apiUrl(listItems, { query: { cursor: 'c', tag: ['a'] } })).toBe('/api/items?cursor=c&tag=a');
    expect(apiQuery(listItems, { query: { cursor: 'c' } }).queryKey).toEqual([
      '/api/items',
      null,
      { cursor: 'c' },
    ]);
  });

  it('type-checks inputs', () => {
    // These only exist for the compiler; nothing is awaited.
    const typeOnly = () => {
      // @ts-expect-error params are required for a templated path
      void api(getItem);
      // @ts-expect-error the body is required when the contract declares one
      void api(createItem, { params: { id: 'x' } });
      // @ts-expect-error a wrong body type is rejected
      void api(createItem, { params: { id: 'x' }, body: { name: 1 } });
      void api(listItems); // query is always optional
    };
    expect(typeof typeOnly).toBe('function');
  });
});

describe('implement()', () => {
  it('serialises a plain return as JSON through defineHandler', async () => {
    const handler = implement(
      createItem,
      { auth: 'none', body: itemBody, response: item },
      async ({ params, body }) => ({ id: params.id!, name: body.name }),
    );
    const res = await handler({
      params: { id: 't1' },
      request: new Request('https://rmhstudios.com/api/things/t1/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"name":"x"}',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 't1', name: 'x' });
  });

  it('a 400 from the shared preamble still applies to contract bodies', async () => {
    const handler = implement(createItem, { auth: 'none', body: itemBody }, async () => ({
      id: '1',
      name: 'n',
    }));
    const res = await handler({
      params: { id: 't1' },
      request: new Request('https://rmhstudios.com/api/things/t1/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"name":5}',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('a response that drifts from its schema fails in dev/test', async () => {
    const handler = implement(
      getItem,
      { auth: 'none', response: item },
      // @ts-expect-error the handler must return the contract's response type
      async () => ({ id: 1 }),
    );
    const res = await handler({
      params: { id: 'a', itemId: 'b' },
      request: new Request('https://rmhstudios.com/api/things/a/items/b'),
    });
    expect(res.status).toBe(500);
  });

  it('rejects a schema that does not parse to the contract type (compile time)', () => {
    const typeOnly = () =>
      implement(
        createItem,
        // @ts-expect-error body schema parses to { name: number }, the contract says string
        { auth: 'none', body: z.object({ name: z.number() }) },
        async () => ({ id: '1', name: 'n' }),
      );
    expect(typeof typeOnly).toBe('function');
  });
});
