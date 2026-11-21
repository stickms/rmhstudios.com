import { describe, expect, it } from 'vitest';
import { ENDPOINTS, type ApiEndpoint } from '@/lib/api/registry';
import { buildRequest, exampleBody, toCurl, toFetch, toPython } from '@/lib/developer/explorer';

// A member's API key is a credential: the explorer may send it in the Authorization header and nowhere else.
const KEY = 'rmh_live_s3cr3t-KEY-0123456789';

function requestFor(endpoint: ApiEndpoint) {
  const params: Record<string, string> = {};
  for (const p of endpoint.params ?? []) {
    params[p.name] = p.type === 'integer' ? '5' : p.type === 'boolean' ? 'true' : 'value';
  }
  return buildRequest(endpoint, { params, body: exampleBody(endpoint), key: KEY });
}

describe('API explorer credential handling', () => {
  it('never puts the key in the URL, whatever the endpoint', () => {
    for (const ep of ENDPOINTS) {
      expect(requestFor(ep).url).not.toContain(KEY);
    }
  });

  it('sends the key only in the Authorization header', () => {
    for (const ep of ENDPOINTS) {
      const r = requestFor(ep);
      expect(r.headers.Authorization).toBe(`Bearer ${KEY}`);
      const others = Object.entries(r.headers).filter(([name]) => name !== 'Authorization');
      expect(JSON.stringify(others)).not.toContain(KEY);
      expect(r.body ?? '').not.toContain(KEY);
    }
  });

  it('leaves the key out of every default snippet', () => {
    for (const ep of ENDPOINTS) {
      const r = requestFor(ep);
      for (const snippet of [toCurl(r), toFetch(r), toPython(r)]) {
        expect(snippet).not.toContain(KEY);
        expect(snippet).toContain('RMH_API_KEY');
      }
    }
  });

  it('includes the key only when the member opts in', () => {
    const r = requestFor(ENDPOINTS[0]!);
    for (const snippet of [
      toCurl(r, { includeKey: true }),
      toFetch(r, { includeKey: true }),
      toPython(r, { includeKey: true }),
    ]) {
      expect(snippet).toContain(KEY);
      expect(snippet).not.toContain('RMH_API_KEY');
    }
  });

  it('adds no Authorization header when no key was entered', () => {
    const r = buildRequest(ENDPOINTS[0]!, { params: {} });
    expect(r.headers.Authorization).toBeUndefined();
    expect(toCurl(r)).not.toContain('Authorization');
  });
});
