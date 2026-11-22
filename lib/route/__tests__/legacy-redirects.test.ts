/**
 * The legacy-redirect table replaced ~30 one-line route files. Old links are
 * shared outside the site (bookmarks, posts, search results), so a wrong or
 * missing entry silently sends people to a 404.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_REDIRECTS, legacyRedirectFor } from '@/lib/route/legacy-redirects';
import { STATIC_ROUTES } from '@/lib/sitemap';

const ROOT = join(__dirname, '../../..');
const routeTree = readFileSync(join(ROOT, 'app/routeTree.gen.ts'), 'utf8');

/** Every `fullPath` the generated route tree declares. */
const fullPaths = new Set([...routeTree.matchAll(/fullPath: '([^']+)'/g)].map((m) => m[1]!.replace(/(.)\/$/, '$1')));

describe('legacy redirects', () => {
  it('match with or without a trailing slash, and only exact paths', () => {
    expect(legacyRedirectFor('/shop')).toBe('/store?tab=shop');
    expect(legacyRedirectFor('/shop/')).toBe('/store?tab=shop');
    expect(legacyRedirectFor('/builds/some-build')).toBeNull();
    expect(legacyRedirectFor('/')).toBeNull();
  });

  it.each(Object.entries(LEGACY_REDIRECTS))('%s → %s lands on a real route', (from, to) => {
    // No route of its own any more: the table is the only thing answering it.
    expect(fullPaths.has(from), `${from} still has a route file`).toBe(false);
    const target = to.split(/[?#]/)[0]!;
    expect(fullPaths.has(target), `${to} is not a route`).toBe(true);
    // Never a chain: a target is never itself a legacy path.
    expect(legacyRedirectFor(target)).toBeNull();
  });

  it('are not listed in the sitemap', () => {
    const listed = new Set(STATIC_ROUTES.map((r) => r.loc));
    for (const from of Object.keys(LEGACY_REDIRECTS)) expect(listed.has(from), from).toBe(false);
  });

  it('are answered by the root route', () => {
    const root = readFileSync(join(ROOT, 'app/routes/__root.tsx'), 'utf8');
    expect(root).toMatch(/legacyRedirectFor\(location\.pathname\)/);
    expect(existsSync(join(ROOT, 'lib/route/legacy-redirects.ts'))).toBe(true);
  });
});
