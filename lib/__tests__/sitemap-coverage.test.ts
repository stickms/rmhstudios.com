import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  STATIC_ROUTES,
  EXCLUDED_ROUTES,
  DYNAMIC_ROUTES,
  SITEMAP_SECTION_NAMES,
  catalogRoutes,
  renderUrlset,
  renderSitemapIndex,
  parseChunkName,
  chunkPath,
  SITEMAP_CHUNK_SIZE,
} from '@/lib/sitemap';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';

/**
 * The sitemap, as a gate.
 *
 * Everything checked here is a failure the old sitemap actually shipped, and
 * every one of them is invisible from inside the app: the page renders fine,
 * the nav link works, and only a crawler ever notices. Specifically, the
 * fourteen-entry hand-written list was advertising `/games` and `/apps` (no
 * such routes — both 404) and `/blog` and `/user-builds` (both redirect), while
 * omitting profiles, posts, communities, vibe pages and ~60 static pages.
 *
 * None of that was a typo. It was a list that had no way to notice the site had
 * moved on. This file is that way.
 */

const ROUTES_DIR = resolve(process.cwd(), 'app/routes');

/** Every page route file (not API routes, not the root/layout shells). */
function pageRouteFiles(dir = ROUTES_DIR, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'api') continue;
      pageRouteFiles(full, acc);
    } else if (entry.endsWith('.tsx')) {
      acc.push(full);
    }
  }
  return acc;
}

const ESCAPED_DOT = '__ESCAPED_DOT__';

/**
 * A route file's URL path, by TanStack's file-naming rules: `.` and `/` are
 * both separators, a leading `_` is a pathless layout, a trailing `_` opts out
 * of parent nesting, `[.]` is an escaped literal dot, and `index` is the
 * directory's own path.
 */
function urlPathFor(file: string): string | null {
  let rel = file.slice(ROUTES_DIR.length + 1).replace(/\.tsx$/, '');
  if (rel === '__root' || rel === '_site') return null;
  // `[.]` is a literal dot in a route filename, so it has to survive the
  // split-on-dot below. A named sentinel rather than a control character —
  // which is unreadable in a diff and trips `no-control-regex`.
  rel = rel.split('[.]').join(ESCAPED_DOT);
  const segments = rel
    .split('/')
    .flatMap((s) => s.split('.'))
    .map((s) => s.split(ESCAPED_DOT).join('.'))
    .filter((s) => s !== '')
    // Pathless layouts (`_site`) contribute no segment; `$param` names may not
    // start with `_`, so this can't eat a real one.
    .filter((s) => !s.startsWith('_'))
    .map((s) => (s.endsWith('_') ? s.slice(0, -1) : s));
  const last = segments[segments.length - 1];
  if (last === 'index' || last === 'route') segments.pop();
  return `/${segments.join('/')}`;
}

function sourceFor(file: string): string {
  return readFileSync(file, 'utf8');
}

/**
 * A route whose only job is to `throw redirect(...)` before it renders.
 *
 * Two signals, and both are required. A `throw redirect(` under `beforeLoad`
 * alone is not enough: a route that renders a page can still redirect one
 * *search param* elsewhere — `/create` sends `?tab=apps` to `/apps` now that
 * the apps catalog is its own page — and that route's own URL is perfectly
 * indexable. What makes a route redirect-*only* is that it has no component to
 * render, which is exactly the shape of every stub in `app/routes/_site`
 * (`shop`, `pricing`, `market`, `profile/$id`, `arcade`, `leaderboard`, …).
 */
function isRedirectOnly(src: string): boolean {
  const redirectsEarly = /beforeLoad:[\s\S]{0,240}?throw redirect\(/.test(src);
  const rendersSomething = /\bcomponent:\s*\w/.test(src);
  return redirectsEarly && !rendersSomething;
}

const ROUTE_FILES = pageRouteFiles();
const BY_PATH = new Map<string, string[]>();
for (const file of ROUTE_FILES) {
  const path = urlPathFor(file);
  if (path === null) continue;
  BY_PATH.set(path, [...(BY_PATH.get(path) ?? []), file]);
}

const STATIC_LOCS = new Set(STATIC_ROUTES.map((r) => r.loc));

describe('every page route is classified', () => {
  it('leaves no route unaccounted for', () => {
    const unclassified: string[] = [];
    for (const [path, files] of BY_PATH) {
      const isDynamic = path.includes('$');
      const known = isDynamic
        ? path in DYNAMIC_ROUTES
        : STATIC_LOCS.has(path) || path in EXCLUDED_ROUTES;
      // Catalog-derived paths (`/isleworks`, `/games/…`, `/builds/…`) are
      // generated rather than listed, so check those too.
      if (!known && !CATALOG_LOCS.has(path)) unclassified.push(`${path}  (${files.join(', ')})`);
    }
    expect(
      unclassified,
      'Add each to STATIC_ROUTES (indexable) or EXCLUDED_ROUTES / DYNAMIC_ROUTES ' +
        '(with a reason) in lib/sitemap.ts.',
    ).toEqual([]);
  });

  it('classifies nothing that no longer exists', () => {
    const ghosts = [...STATIC_LOCS, ...Object.keys(EXCLUDED_ROUTES)].filter(
      (path) =>
        !BY_PATH.has(path) &&
        !CATALOG_LOCS.has(path) &&
        // `.ts` server routes that render raw HTML have no `.tsx` file.
        !SERVER_RENDERED_PAGES.has(path),
    );
    expect(ghosts, 'These are listed in lib/sitemap.ts but have no route.').toEqual([]);
  });
});

/** Paths served by a `.ts` server route rather than a React page. */
const SERVER_RENDERED_PAGES = new Set(['/deeplink', '/rmh-internal-affairs']);

const CATALOG_LOCS = new Set(catalogRoutes().map((r) => r.loc));

/**
 * Whether a concrete URL resolves to *some* route — either its own file, or a
 * parameterised one that matches it.
 *
 * The catalog emits concrete paths (`/games/isleworks`), and those are served
 * by `/games/$gameId`. Matching literally would flag every one of them as a
 * 404 while missing the actual bug this test exists for.
 */
const ROUTE_PATTERNS = [...BY_PATH.keys()].map((path) => ({
  path,
  regex: new RegExp(
    `^${path
      .split('/')
      .map((seg) => (seg.startsWith('$') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/')}$`,
  ),
}));

/** The route files that could serve `path` — its own, or a matching pattern. */
function filesFor(path: string): string[] {
  const exact = BY_PATH.get(path);
  if (exact) return exact;
  const pattern = ROUTE_PATTERNS.find((r) => r.path.includes('$') && r.regex.test(path));
  return pattern ? (BY_PATH.get(pattern.path) ?? []) : [];
}

function routeExistsFor(path: string): boolean {
  return filesFor(path).length > 0;
}

describe('the sitemap never advertises a broken URL', () => {
  it('lists no path that has no route', () => {
    const missing = [...STATIC_LOCS, ...CATALOG_LOCS].filter(
      (path) => !routeExistsFor(path) && !SERVER_RENDERED_PAGES.has(path),
    );
    // The original bug: `/games` and `/apps` sat at priority 0.9 for months
    // while neither route existed. Both 404'd for every crawler that followed
    // them, and nothing in the app could tell.
    expect(missing, 'Sitemap entries with no matching route (they would 404).').toEqual([]);
  });

  it('lists no route that only redirects', () => {
    const redirects: string[] = [];
    for (const path of [...STATIC_LOCS, ...CATALOG_LOCS]) {
      for (const file of filesFor(path)) {
        if (isRedirectOnly(sourceFor(file))) redirects.push(`${path}  (${file})`);
      }
    }
    // `/blog` → `/library` and `/user-builds` → `/builds` → `/create` were both
    // listed. A sitemap URL that redirects is an indexing error, and the
    // two-hop chain was two of them for one URL.
    expect(redirects, 'Sitemap entries that redirect. List the destination instead.').toEqual([]);
  });

  it('emits every loc exactly once', () => {
    const all = [...STATIC_ROUTES, ...catalogRoutes()].map((r) => r.loc);
    const dupes = all.filter((loc, i) => all.indexOf(loc) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });

  it('gives every loc a site-relative path, never an absolute URL', () => {
    const bad = [...STATIC_ROUTES, ...catalogRoutes()]
      .map((r) => r.loc)
      .filter((loc) => !loc.startsWith('/') || loc.startsWith('//'));
    expect(bad).toEqual([]);
  });

  it('keeps query strings out of the sitemap', () => {
    // A `?tab=` URL canonicalises to the page without it, so listing one asks a
    // crawler to index a duplicate of a page already in the list.
    const withQuery = [...STATIC_ROUTES, ...catalogRoutes()]
      .map((r) => r.loc)
      .filter((loc) => loc.includes('?') || loc.includes('#'));
    expect(withQuery).toEqual([]);
  });
});

describe('dynamic routes name a real section', () => {
  it('points every listed dynamic route at a section that exists', () => {
    const known = new Set<string>(SITEMAP_SECTION_NAMES);
    const unknown = Object.entries(DYNAMIC_ROUTES)
      .filter(([, section]) => section !== null && !known.has(section))
      .map(([route, section]) => `${route} → "${section}"`);
    expect(unknown).toEqual([]);
  });

  it('gives every section at least one route that uses it', () => {
    const used = new Set(Object.values(DYNAMIC_ROUTES).filter(Boolean));
    const orphans = SITEMAP_SECTION_NAMES.filter(
      // `pages` is the static + catalog section; it has no dynamic route.
      (name) => name !== 'pages' && !used.has(name),
    );
    expect(orphans).toEqual([]);
  });

  it('implements exactly the sections it declares', () => {
    // The two halves are declared separately (the names are client-safe, the
    // queries are not), so nothing but this stops them drifting apart — and a
    // section named in the index but missing from the server is a 404 that
    // only a crawler would ever hit.
    const server = readFileSync(resolve(process.cwd(), 'lib/sitemap.server.ts'), 'utf8');
    const body = server.slice(server.indexOf('export const SITEMAP_SECTIONS'));
    for (const name of SITEMAP_SECTION_NAMES) {
      expect(body, `lib/sitemap.server.ts has no "${name}" section`).toMatch(
        new RegExp(`^\\s{2}(?:/\\*\\*[\\s\\S]*?\\*/\\s*)?${name}: \\{`, 'm'),
      );
    }
  });
});

describe('every indexable page can be found and described', () => {
  /**
   * A route resolves a head if it declares one or inherits it from an ancestor
   * layout route — `/rmhtube/$roomId` gets its head from `/rmhtube`.
   */
  function resolvesHead(path: string): boolean {
    const parts = path.split('/').filter(Boolean);
    for (let i = parts.length; i >= 0; i--) {
      const candidate = `/${parts.slice(0, i).join('/')}`;
      for (const file of filesFor(candidate)) {
        if (/^\s*head:/m.test(sourceFor(file))) return true;
      }
    }
    return false;
  }

  it('gives every sitemap-listed page a head()', () => {
    const headless = [...STATIC_LOCS, ...CATALOG_LOCS].filter(
      (path) => routeExistsFor(path) && !resolvesHead(path),
    );
    expect(headless, 'Listed in the sitemap but renders no title or description.').toEqual([]);
  });

  it('gives every sitemap-listed page a description and a canonical', () => {
    const thin: string[] = [];
    for (const path of [...STATIC_LOCS, ...CATALOG_LOCS]) {
      const files = filesFor(path);
      if (files.length === 0) continue; // server-rendered page, checked separately
      const src = files.map(sourceFor).join('\n');
      // `gameRouteHead`/`appRouteHead` supply both from the catalog.
      const viaHelper = /gameRouteHead|appRouteHead/.test(src);
      const hasDescription = viaHelper || /buildMeta|name: 'description'/.test(src);
      const hasCanonical = viaHelper || /buildCanonical|rel: 'canonical'/.test(src);
      if (!hasDescription || !hasCanonical) {
        thin.push(
          `${path} — missing ${[!hasDescription && 'description', !hasCanonical && 'canonical']
            .filter(Boolean)
            .join(' + ')}`,
        );
      }
    }
    expect(thin).toEqual([]);
  });

  it('does not mark a sitemap-listed page noindex', () => {
    // The contradiction is silent from both sides: the sitemap asks a crawler
    // to index a page the page itself tells it not to.
    const contradictory: string[] = [];
    for (const path of [...STATIC_LOCS, ...CATALOG_LOCS]) {
      for (const file of filesFor(path)) {
        const src = sourceFor(file);
        // Only an unconditional noindex is a contradiction — the dynamic routes
        // legitimately branch (a draft guide, a private deck).
        if (/head: \(\) => \([\s\S]{0,400}?content: 'noindex/.test(src)) {
          contradictory.push(`${path}  (${file})`);
        }
      }
    }
    expect(contradictory).toEqual([]);
  });
});

describe('the catalog drives the game and app pages', () => {
  it('lists every playable first-party game and its hub', () => {
    const locs = new Set(catalogRoutes().map((r) => r.loc));
    for (const game of games) {
      if (!game.href.startsWith('/') || game.unlisted) continue;
      expect(locs.has(game.href), `${game.id}: playable route missing`).toBe(true);
      expect(locs.has(`/games/${game.id}`), `${game.id}: hub missing`).toBe(true);
    }
  });

  it('skips external and unlisted entries', () => {
    const locs = catalogRoutes().map((r) => r.loc);
    expect(locs.some((l) => l.startsWith('http'))).toBe(false);
    for (const game of games.filter((g) => g.unlisted)) {
      expect(locs).not.toContain(game.href);
    }
    for (const app of apps.filter((a) => a.unlisted || a.hidden)) {
      expect(locs).not.toContain(app.href);
    }
  });
});

describe('XML rendering', () => {
  const origin = 'https://rmhstudios.com';

  it('escapes characters that would break the document', () => {
    const xml = renderUrlset([{ loc: '/u/a&b<c' }], origin);
    expect(xml).toContain('<loc>https://rmhstudios.com/u/a&amp;b&lt;c</loc>');
    expect(xml).not.toContain('a&b<c');
  });

  it('emits lastmod as ISO 8601', () => {
    const xml = renderUrlset([{ loc: '/x', lastmod: new Date('2026-01-02T03:04:05Z') }], origin);
    expect(xml).toContain('<lastmod>2026-01-02T03:04:05.000Z</lastmod>');
  });

  it('omits optional fields rather than emitting empty ones', () => {
    const xml = renderUrlset([{ loc: '/x' }], origin);
    expect(xml).not.toContain('<lastmod>');
    expect(xml).not.toContain('<priority>');
    expect(xml).not.toContain('<changefreq>');
  });

  it('renders an index whose children are absolute', () => {
    const xml = renderSitemapIndex(['/sitemaps/users-2.xml'], origin, new Date(0));
    expect(xml).toContain('<loc>https://rmhstudios.com/sitemaps/users-2.xml</loc>');
    expect(xml).toContain('<sitemapindex');
  });

  it('stays under the protocol limit', () => {
    // 50,000 is the hard ceiling; over it the whole file is rejected rather
    // than truncated, which is why the index exists at all.
    expect(SITEMAP_CHUNK_SIZE).toBeLessThanOrEqual(50_000);
  });
});

describe('chunk names round-trip', () => {
  it('parses a first chunk with no suffix', () => {
    expect(parseChunkName('users.xml')).toEqual({ section: 'users', chunk: 1 });
  });

  it('parses a numbered chunk', () => {
    expect(parseChunkName('posts-12.xml')).toEqual({ section: 'posts', chunk: 12 });
  });

  it('round-trips through chunkPath', () => {
    for (const [section, chunk] of [
      ['users', 1],
      ['posts', 7],
    ] as const) {
      const path = chunkPath(section, chunk);
      expect(parseChunkName(path.replace('/sitemaps/', ''))).toEqual({ section, chunk });
    }
  });

  it('rejects anything that is not a chunk name', () => {
    // The param is user-controlled, so a traversal or an absurd chunk index
    // must not reach the section lookup.
    for (const bad of [
      '../../etc/passwd',
      'users.xml/../..',
      'users-0.xml',
      'users-99999.xml',
      'users-1.XML',
      'Users.xml',
      'users',
      'users-.xml',
      '',
    ]) {
      expect(parseChunkName(bad), bad).toBeNull();
    }
  });
});

describe('robots.txt', () => {
  const robots = readFileSync(resolve(process.cwd(), 'public/robots.txt'), 'utf8');
  const lines = robots
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  it('lets crawlers fetch the dynamic share cards', () => {
    // Twitterbot and LinkedInBot both check robots.txt before fetching
    // og:image, and every generated card is under /api/og/. A blanket
    // "Disallow: /api/" meant no post, profile, job or game link showed an
    // image on either network.
    expect(lines).toContain('Allow: /api/og/');
    expect(lines).toContain('Allow: /api/vibe/thumb/');
  });

  it('puts the Allow rules before the /api/ Disallow', () => {
    // Google resolves by longest match so order is cosmetic there, but several
    // smaller crawlers take the first match — cheap insurance either way.
    const allow = lines.indexOf('Allow: /api/og/');
    const disallow = lines.indexOf('Disallow: /api/');
    expect(allow).toBeGreaterThanOrEqual(0);
    expect(disallow).toBeGreaterThan(allow);
  });

  it('points at the sitemap', () => {
    expect(robots).toMatch(/^Sitemap: https:\/\/rmhstudios\.com\/sitemap\.xml$/m);
  });

  it('does not block a page the sitemap asks to have indexed', () => {
    const disallowed = lines
      .filter((l) => l.startsWith('Disallow: '))
      .map((l) => l.slice('Disallow: '.length))
      .filter((p) => p !== '/');
    const allowed = lines
      .filter((l) => l.startsWith('Allow: '))
      .map((l) => l.slice('Allow: '.length));

    const conflicts: string[] = [];
    for (const loc of [...STATIC_LOCS, ...CATALOG_LOCS]) {
      const block = disallowed.find((rule) => loc === rule || loc.startsWith(`${rule}/`));
      if (!block) continue;
      // A more specific Allow wins.
      const override = allowed.find((rule) => loc.startsWith(rule) && rule.length > block.length);
      if (!override) conflicts.push(`${loc} blocked by "Disallow: ${block}"`);
    }
    expect(conflicts).toEqual([]);
  });

  it('blocks the per-viewer pages the registry marks personal', () => {
    const disallowed = new Set(
      lines.filter((l) => l.startsWith('Disallow: ')).map((l) => l.slice('Disallow: '.length)),
    );
    // Not every personal route needs its own line — nested ones are covered by
    // a parent — so this checks the top-level ones a crawler would actually
    // reach from the nav.
    for (const path of ['/settings', '/wallet', '/messages', '/notifications', '/drafts']) {
      expect(disallowed.has(path), `robots.txt should disallow ${path}`).toBe(true);
    }
  });
});

describe('the OG default card exists', () => {
  it('has the file every unlisted route falls back to', () => {
    expect(existsSync(resolve(process.cwd(), 'public/images/og/default.png'))).toBe(true);
  });
});
