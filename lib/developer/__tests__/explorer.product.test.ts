import { describe, expect, it } from 'vitest';
import { ENDPOINTS, endpointsByGroup, type ApiEndpoint } from '@/lib/api/registry';
import {
  buildRequest,
  docsPathForGroup,
  ExplorerRequestError,
  filterGroups,
  isTestKey,
  missingRequired,
  parseJsonWithPosition,
  shellQuote,
  toCurl,
  toFetch,
  toPython,
} from '@/lib/developer/explorer';
import { TEST_KEY_PREFIX } from '@/lib/api/test-mode';

const getUser: ApiEndpoint = {
  method: 'GET',
  path: '/api/v1/users/{handle}/posts',
  operationId: 'listUserPosts',
  group: 'Users',
  summary: 'List a user’s posts',
  description: 'd',
  scope: 'read:posts',
  params: [
    { name: 'handle', in: 'path', required: true, type: 'string', description: '' },
    { name: 'limit', in: 'query', type: 'integer', description: '' },
    { name: 'cursor', in: 'query', type: 'string', description: '' },
    { name: 'replies', in: 'query', type: 'boolean', description: '' },
  ],
};

const createPost: ApiEndpoint = {
  method: 'POST',
  path: '/api/v1/posts',
  operationId: 'createPost',
  group: 'Posts',
  summary: 's',
  description: 'd',
  scope: 'write:posts',
  requestBody: { example: { content: 'hi' } },
};

describe('buildRequest', () => {
  it('percent-encodes path parameters', () => {
    const r = buildRequest(getUser, { params: { handle: 'a b/c?d#e' } });
    expect(r.url).toBe('/api/v1/users/a%20b%2Fc%3Fd%23e/posts');
  });

  it('cannot be walked out of its segment with dots', () => {
    expect(buildRequest(getUser, { params: { handle: '..' } }).url).toBe('/api/v1/users/%2E%2E/posts');
  });

  it('drops empty query parameters and keeps the rest', () => {
    const r = buildRequest(getUser, { params: { handle: 'ada', limit: '10', cursor: '  ', replies: '' } });
    expect(r.url).toBe('/api/v1/users/ada/posts?limit=10');
  });

  it('refuses a path outside /api/v1/', () => {
    const bad = { ...getUser, path: '/api/other/{handle}' };
    expect(() => buildRequest(bad, { params: { handle: 'a' } })).toThrow(ExplorerRequestError);
    expect(() => buildRequest({ ...getUser, path: 'https://evil.example/api/v1/x' }, { params: {} })).toThrow(
      /path-not-allowed/,
    );
  });

  it('refuses a missing path parameter', () => {
    expect(() => buildRequest(getUser, { params: { handle: ' ' } })).toThrow(/missing-path-param/);
    expect(missingRequired(getUser, {})).toEqual(['handle']);
    expect(missingRequired(getUser, { handle: 'ada' })).toEqual([]);
  });

  it('sets a JSON content type only when there is a body', () => {
    const withBody = buildRequest(createPost, { params: {}, body: '{"content":"hi"}' });
    expect(withBody.headers['Content-Type']).toBe('application/json');
    expect(withBody.body).toBe('{"content":"hi"}');
    const without = buildRequest(createPost, { params: {}, body: '   ' });
    expect(without.body).toBeNull();
    expect(without.headers['Content-Type']).toBeUndefined();
    expect(buildRequest(getUser, { params: { handle: 'a' }, body: '{}' }).body).toBeNull();
  });

  it('builds a valid request for every registry endpoint', () => {
    for (const ep of ENDPOINTS) {
      const params: Record<string, string> = {};
      for (const p of ep.params ?? []) params[p.name] = 'x';
      expect(buildRequest(ep, { params }).url.startsWith('/api/v1/')).toBe(true);
    }
  });
});

describe('snippets', () => {
  const r = buildRequest(createPost, { params: {}, body: `{"content":"it's"}`, key: 'rmh_live_abc' });

  it('quotes single quotes safely for a POSIX shell', () => {
    expect(shellQuote(`it's`)).toBe(`'it'\\''s'`);
    expect(toCurl(r)).toContain(`--data '{"content":"it'\\''s"}'`);
  });

  it('omits the key by default and reads it from the environment', () => {
    expect(toCurl(r)).toContain('-H "Authorization: Bearer $RMH_API_KEY"');
    expect(toCurl(r)).not.toContain('rmh_live_abc');
    expect(toFetch(r)).toContain('process.env.RMH_API_KEY');
    expect(toPython(r)).toContain('os.environ["RMH_API_KEY"]');
    expect(toPython(r)).toContain('import os');
  });

  it('puts the key in only when asked, shell-quoted', () => {
    expect(toCurl(r, { includeKey: true })).toContain(`-H 'Authorization: Bearer rmh_live_abc'`);
    expect(toPython(r, { includeKey: true })).not.toContain('import os');
  });

  it('targets the given origin and falls back to production', () => {
    expect(toCurl(r, { origin: 'http://localhost:7005/' })).toContain(`'http://localhost:7005/api/v1/posts'`);
    expect(toCurl(r)).toContain(`'https://rmhstudios.com/api/v1/posts'`);
  });

  it('emits the method, the body and a JSON content type in every language', () => {
    expect(toCurl(r)).toContain('-X POST');
    expect(toFetch(r)).toContain('method: "POST"');
    expect(toFetch(r)).toContain('body: "{\\"content\\":\\"it\'s\\"}"');
    expect(toPython(r)).toContain('requests.request(');
    expect(toPython(r)).toContain('"Content-Type": "application/json"');
  });
});

describe('parseJsonWithPosition', () => {
  it('returns the value for valid JSON', () => {
    expect(parseJsonWithPosition('{"a":[1,2]}')).toEqual({ ok: true, value: { a: [1, 2] } });
  });

  it('reports line and column of the mistake', () => {
    const r = parseJsonWithPosition('{\n  "a": 1,\n  "b": oops\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.line).toBe(3);
      expect(r.column).toBe(8);
      expect(r.message.length).toBeGreaterThan(0);
    }
  });

  it('points at the end of truncated input', () => {
    const r = parseJsonWithPosition('{"a": 1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect([r.line, r.column]).toEqual([1, 8]);
  });
});

describe('keys, docs and filtering', () => {
  it('recognises a test key by the shared prefix', () => {
    expect(isTestKey(`${TEST_KEY_PREFIX}abc`)).toBe(true);
    expect(isTestKey(`  ${TEST_KEY_PREFIX}abc `)).toBe(true);
    expect(isTestKey('rmh_live_abc')).toBe(false);
    expect(isTestKey('')).toBe(false);
  });

  it('maps every registry group to a docs page', () => {
    for (const g of endpointsByGroup()) expect(docsPathForGroup(g.group)).not.toBeNull();
    expect(docsPathForGroup('Nope')).toBeNull();
  });

  it('has a docs page for the RMHLadder group (s13-10) and for every group the registry declares', () => {
    expect(docsPathForGroup('RMHLadder')).toBe('developer-api/endpoints/rmhladder');
    expect(endpointsByGroup().map((g) => g.group)).toContain('RMHLadder');
  });

  it('filters on method, path, summary and scope, all words required', () => {
    const groups = endpointsByGroup();
    const count = (q: string) => filterGroups(groups, q).reduce((n, g) => n + g.endpoints.length, 0);
    expect(count('')).toBe(ENDPOINTS.length);
    // Every DELETE, plus any endpoint that names deletion in its path or summary (`/me/deleted`, s09-10).
    const deleteCount = count('delete');
    expect(deleteCount).toBeGreaterThanOrEqual(ENDPOINTS.filter((e) => e.method === 'DELETE').length);
    expect(deleteCount).toBe(
      ENDPOINTS.filter((e) => `${e.method} ${e.path} ${e.summary} ${e.scope ?? ''}`.toLowerCase().includes('delete'))
        .length,
    );
    expect(count('/api/v1/me')).toBeGreaterThan(0);
    const scope = ENDPOINTS.find((e) => e.scope)!.scope!;
    expect(count(scope)).toBeGreaterThan(0);
    expect(count('zzzz-no-such-thing')).toBe(0);
    expect(filterGroups(groups, 'get me').every((g) => g.endpoints.length > 0)).toBe(true);
  });
});
