import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The vertical registry (K2).
 *
 * The registry only prevents the bug it was built for — a microsite that ships
 * without reaching the sitemap — if it is held to the routes that actually
 * exist. Both directions are failures:
 *
 *   a declared page with no route  → the sitemap advertises a 404
 *   a route with no declared page  → the page exists and nothing can find it
 *
 * The second is the one that happened twice (`/breaches`, `/sohumbum2`) and was
 * caught by the sitemap's own coverage test in CI. This moves the catch one
 * step earlier and states it in terms of the thing being added.
 */

import { VERTICALS, verticalPaths, verticalPriority, verticalsForHub } from '@/lib/verticals';
import { STATIC_ROUTES } from '@/lib/sitemap';

const ROUTES_DIR = resolve(process.cwd(), 'app/routes');

/**
 * Does a route file exist for this URL path?
 *
 * `ext` is `.tsx` for a router page and `.ts` for a vertical served as
 * standalone HTML by its own server route — Deeplink is the one of those, and
 * looking only for `.tsx` would report it missing while it is live.
 */
function routeExists(path: string, ext: '.ts' | '.tsx'): boolean {
  const rel = path.replace(/^\//, '');
  const candidates = [
    // Flat: `rmh-capital.tsx`, or dotted `rmh-capital.firm.tsx`.
    `${rel.split('/').join('.')}${ext}`,
    // Directory index: `rmh-capital/index.tsx`.
    `${rel}/index${ext}`,
    // Under the site shell, either spelling.
    `_site/${rel.split('/').join('.')}${ext}`,
    `_site/${rel}/index${ext}`,
    `_site/${rel}${ext}`,
    `${rel}${ext}`,
  ];
  return candidates.some((c) => existsSync(join(ROUTES_DIR, c)));
}

describe('every declared vertical page is a real route', () => {
  for (const v of VERTICALS) {
    it(`${v.id} — all ${v.pages.length} page(s) resolve to a route file`, () => {
      const ext = v.serverRendered ? '.ts' : '.tsx';
      const missing = verticalPaths(v).filter((p) => !routeExists(p, ext));
      expect(missing).toEqual([]);
    });
  }
});

describe('every vertical route is a declared page', () => {
  /** Route files living under a vertical's own directory. */
  function routesUnder(dir: string): string[] {
    const full = join(ROUTES_DIR, dir);
    if (!existsSync(full) || !statSync(full).isDirectory()) return [];
    return readdirSync(full)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => (f === 'index.tsx' ? '' : f.replace(/\.tsx$/, '')));
  }

  for (const v of VERTICALS) {
    const dir = v.base.replace(/^\//, '');
    const onDisk = routesUnder(dir);
    if (onDisk.length === 0) continue; // flat-file vertical; nothing to walk

    it(`${v.id} — no page on disk is missing from the registry`, () => {
      const declared = new Set(v.pages.map((p) => p.segment));
      // `route.tsx` is a layout, not a page.
      const undeclared = onDisk.filter((seg) => seg !== 'route' && !declared.has(seg));
      expect(undeclared).toEqual([]);
    });
  }
});

describe('the derived sitemap entries', () => {
  const locs = new Set(STATIC_ROUTES.map((r) => r.loc));

  it('cover every declared page', () => {
    const missing = VERTICALS.flatMap(verticalPaths).filter((p) => !locs.has(p));
    expect(missing).toEqual([]);
  });

  it('do not list any path twice', () => {
    const all = STATIC_ROUTES.map((r) => r.loc);
    const dupes = all.filter((p, i) => all.indexOf(p) !== i);
    expect(dupes).toEqual([]);
  });

  it('rank an index above its children', () => {
    for (const v of VERTICALS) {
      const index = v.pages.find((p) => !p.segment);
      if (!index) continue;
      for (const child of v.pages.filter((p) => p.segment)) {
        expect(verticalPriority(index)).toBeGreaterThan(verticalPriority(child));
      }
    }
  });
});

describe('the registry is well formed', () => {
  it('has unique ids and bases', () => {
    expect(new Set(VERTICALS.map((v) => v.id)).size).toBe(VERTICALS.length);
    expect(new Set(VERTICALS.map((v) => v.base)).size).toBe(VERTICALS.length);
  });

  it('gives every vertical an index page', () => {
    for (const v of VERTICALS) {
      expect({ id: v.id, hasIndex: v.pages.some((p) => !p.segment) }).toEqual({
        id: v.id,
        hasIndex: true,
      });
    }
  });

  it('splits across both hubs', () => {
    expect(verticalsForHub('services').length).toBeGreaterThan(0);
    expect(verticalsForHub('ventures').length).toBeGreaterThan(0);
  });
});
