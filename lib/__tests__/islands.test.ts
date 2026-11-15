/**
 * Islands (redesign audit B1): a feature with `features/<id>/island.tsx` is
 * built by `vite.islands.config.ts` as its own client entry and served by its
 * route as a bare document (`lib/islands/document.server.ts`). These are the
 * invariants that make that true and keep it true:
 *
 *  1. the manifest says `delivery: 'island'` and the route serves the island
 *     document — and nothing else (no component: no dual delivery);
 *  2. the island's import graph never reaches the site's shell — the router
 *     tree, the site `Providers`, the radial shell, the site stylesheets — or
 *     the island would quietly load the site again;
 *  3. every component file the island reaches is scanned by the island's own
 *     sheet (`features/<id>/island.css`), or it renders without its utilities;
 *  4. the head the document emits is the router's merge of the same heads.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { FeatureManifestSchema } from '@/lib/core/feature';
import { renderHead } from '@/lib/islands/head';
import { packageImports, reach, ROOT } from './import-graph';

const islands = readdirSync(join(ROOT, 'features')).filter((id) =>
  existsSync(join(ROOT, 'features', id, 'island.tsx')),
);

/** Repo paths an island must never reach: each one IS the site shell, or drags it in. */
const FORBIDDEN = ['app/', 'components/Providers.tsx', 'components/feed/', 'lib/auth-client.ts'];
/** Packages that only the site document needs. */
const FORBIDDEN_PACKAGES = [/^@tanstack\/react-start/, /^@tanstack\/react-query/];

describe('islands', () => {
  it('there is at least one island (B1 has started)', () => {
    expect(islands.length).toBeGreaterThan(0);
  });

  it.each(islands)('%s: manifest and route agree that it is an island', async (id) => {
    const mod = (await import(`@features/${id}/feature`)) as { default: unknown };
    const manifest = FeatureManifestSchema.parse(mod.default);
    expect(manifest.delivery).toBe('island');
    // `/secret/vega` is `secret.vega.tsx` (flat) or `secret/vega.tsx` (nested): either spelling.
    const segments = manifest.basePath.slice(1);
    const candidates = [
      join(ROOT, 'app', 'routes', `${segments.replace(/\//g, '.')}.tsx`),
      join(ROOT, 'app', 'routes', `${segments}.tsx`),
    ];
    const route = candidates.find((f) => existsSync(f)) ?? candidates[0]!;
    expect(existsSync(route), relative(ROOT, route)).toBe(true);
    const src = readFileSync(route, 'utf8');
    expect(src, 'the route serves the island document').toMatch(
      new RegExp(`renderIslandDocument\\('${id}'`),
    );
    expect(src, 'and reloads the document on a client navigation').toMatch(
      /beforeLoad: islandBeforeLoad/,
    );
    // No dual delivery: the route renders nothing and imports nothing of the feature.
    expect(src).not.toMatch(/\bcomponent:/);
    expect(src).not.toMatch(/\bhead:/);
    expect(src).not.toContain(`@features/${id}/`);
  });

  it.each(islands)('%s: the island never reaches the site shell', (id) => {
    const files = reach([join(ROOT, 'features', id, 'island.tsx')]);
    const offenders = [...files]
      .map((f) => relative(ROOT, f))
      .filter((f) => FORBIDDEN.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)));
    expect(
      offenders,
      'an island imports site-shell code; take the shared piece into a leaf',
    ).toEqual([]);
    const pkgs = [...packageImports(files)].filter((p) =>
      FORBIDDEN_PACKAGES.some((re) => re.test(p)),
    );
    expect(pkgs, 'an island imports a site-document-only package').toEqual([]);
    // The router package is allowed for its context alone (hooks/useSiteNavigate).
    const routerUsers = [...files].filter((f) =>
      /from '@tanstack\/react-router'/.test(readFileSync(f, 'utf8')),
    );
    expect(routerUsers.map((f) => relative(ROOT, f)).sort()).toEqual(['hooks/useSiteNavigate.ts']);
  });

  it.each(islands)('%s: its sheet scans every component file it reaches', (id) => {
    const sheetPath = join(ROOT, 'features', id, 'island.css');
    expect(existsSync(sheetPath), `features/${id}/island.css`).toBe(true);
    const sheet = readFileSync(sheetPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sheet).toMatch(/@import 'tailwindcss' source\(none\);/);
    const sources = [...sheet.matchAll(/@source\s+["']([^"']+)["']/g)].map((m) =>
      relative(ROOT, resolve(ROOT, 'features', id, m[1])),
    );
    const covered = (f: string) =>
      sources.some((s) => f === s || f.startsWith(s + '/') || s === '');
    const missing = [...reach([join(ROOT, 'features', id, 'island.tsx')])]
      .map((f) => relative(ROOT, f))
      .filter((f) => f.endsWith('.tsx') && !covered(f))
      .map((f) => `@source "${relative(join(ROOT, 'features', id), join(ROOT, f))}";`);
    expect(missing, `add these to features/${id}/island.css`).toEqual([]);
  });

  it('the island document merges heads the way the router does', () => {
    const html = renderHead([
      {
        meta: [
          { charSet: 'utf-8' },
          { title: 'Root' },
          { name: 'description', content: 'root' },
          { property: 'og:type', content: 'website' },
        ],
        links: [{ rel: 'icon', href: '/favicon.svg' }],
        scripts: [{ type: 'application/ld+json', children: '{"a":1}' }],
      },
      {
        meta: [
          { title: 'Leaf | RMH Studios' },
          { name: 'description', content: 'leaf & "quoted"' },
        ],
        links: [
          { rel: 'canonical', href: 'https://rmhstudios.com/x' },
          { rel: 'icon', href: '/favicon.svg' },
        ],
      },
    ]);
    // Deepest title and description win; the root's untouched tags stay, in the root's
    // order; the title leads (the router pushes it last, then reverses the list).
    expect(html).toBe(
      '<title>Leaf | RMH Studios</title>' +
        '<meta charset="utf-8"><meta property="og:type" content="website">' +
        '<meta name="description" content="leaf &amp; &quot;quoted&quot;">' +
        '<link rel="icon" href="/favicon.svg"><link rel="canonical" href="https://rmhstudios.com/x">' +
        '<script type="application/ld+json">{"a":1}</script>',
    );
  });

  it('stamps the CSP nonce on every script and link, and names it in a csp-nonce meta', () => {
    const html = renderHead(
      [{ links: [{ rel: 'canonical', href: '/x' }], scripts: [{ children: 'x()' }] }],
      'n0nce',
    );
    expect(html).toBe(
      '<meta property="csp-nonce" content="n0nce">' +
        '<link rel="canonical" href="/x" nonce="n0nce">' +
        '<script nonce="n0nce">x()</script>',
    );
  });
});
