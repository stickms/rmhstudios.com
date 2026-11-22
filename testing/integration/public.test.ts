/**
 * The public surfaces machines read — the readiness probe the status page and
 * the deploy smoke test depend on, the published OpenAPI spec, and the sitemap.
 * The same probes deploy/smoke-test.sh runs against production, run here
 * against the PR's build before it can merge.
 */
import { describe, expect, it } from 'vitest';
import { Client } from './lib/client';

const anon = new Client();

describe('public surfaces', () => {
  it('/api/ready reports every dependency ok', async () => {
    const res = await anon.get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
  });

  it('/api/v1/openapi.json is a valid OpenAPI 3.1 document covering the API', async () => {
    const res = await anon.get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\.1/);
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/api/v1/me', '/api/v1/posts']));
  });

  it('/ server-renders an HTML document and /sitemap.xml serves a sitemap', async () => {
    const home = await anon.get('/');
    expect(home.status).toBe(200);
    expect(String(home.body)).toContain('<html');

    const sitemap = await anon.get('/sitemap.xml');
    expect(sitemap.status).toBe(200);
    expect(String(sitemap.body)).toMatch(/<sitemapindex|<urlset/);
  });
});
