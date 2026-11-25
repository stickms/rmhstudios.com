/**
 * Every page says what it is (docs/autonomous/sprint-12/features/11-route-announce.md).
 *
 * The route announcer reads the resolved page title aloud after every navigation, so a page
 * with no title is announced as nothing and two pages with one title are announced as the
 * same page. This holds, for every page route file under `app/routes/`:
 *
 *   1. its `head()` gives a title: a literal `title`, or a helper that always sets one
 *      (`buildMeta`, `definePage`, `noindexHead`, the catalog heads);
 *   2. no two static pages (no `$param` in the path) share one literal title.
 *
 * `ROUTE_TITLE_DUPLICATES` and `ROUTE_TITLE_MISSING` are the pages that break the rule today.
 * They only shrink: an entry comes out when its page is fixed (the test fails until it does),
 * and nothing goes in.
 *
 * The announcer files are held too: mounted once in the root route, and free of
 * `MutationObserver` and `requestAnimationFrame` (B3, R5).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const ROUTES_DIR = resolve(ROOT, 'app/routes');

/** Static pages that share a title: the shared title (lower case, site suffix removed) to the files. */
export const ROUTE_TITLE_DUPLICATES: Record<string, string[]> = {};

/** Pages with no title of their own, each with the reason. */
export const ROUTE_TITLE_MISSING: Record<string, string> = {
  'app/routes/embed.post.$id.tsx': 'a frame embedded in other sites; the host page names it',
  'app/routes/embed.replay.$id.tsx': 'a frame embedded in other sites; the host page names it',
};

function routeFiles(dir = ROUTES_DIR, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'api') routeFiles(full, acc);
    } else if (entry.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

/** The URL path a route file serves (TanStack file naming; see og-page-coverage.test.ts). */
function urlPathFor(file: string): string | null {
  const rel = relative(ROUTES_DIR, file)
    .replaceAll('\\', '/')
    .replace(/\.tsx$/, '');
  if (rel === '__root' || rel === '_site') return null;
  const segments = rel
    .split('[.]')
    .join('__ESCAPED_DOT__')
    .split('/')
    .flatMap((s) => s.split('.'))
    .map((s) => s.split('__ESCAPED_DOT__').join('.'))
    .filter((s) => s !== '' && !s.startsWith('_'))
    .map((s) => (s.endsWith('_') ? s.slice(0, -1) : s));
  const last = segments[segments.length - 1];
  if (last === 'index' || last === 'route') segments.pop();
  return `/${segments.join('/')}`;
}

/** A layout (`route.tsx`, or `x.tsx` beside an `x/` directory) renders no page of its own. */
function isLayout(file: string): boolean {
  if (file.endsWith('/route.tsx')) return true;
  try {
    return statSync(file.replace(/\.tsx$/, '')).isDirectory();
  } catch {
    return false;
  }
}

/** Helpers that always set a title. */
const TITLE_HELPER = /\b(buildMeta|definePage|noindexHead|gameRouteHead|appRouteHead|appHubHead)(<[\w, ]+>)?\(/;

/** The source of the `head:` property's value, by bracket matching (strings are skipped whole). */
export function headBlock(src: string): string {
  const start = src.search(/\bhead\s*:/);
  if (start < 0) return '';
  let depth = 0;
  let i = src.indexOf(':', start) + 1;
  const from = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break;
      depth--;
    } else if (c === ',' && depth === 0) break;
  }
  return src.slice(from, i);
}

/** True when the page's head gives a title. */
export function hasTitle(src: string): boolean {
  if (TITLE_HELPER.test(src)) return true;
  return /\btitle\s*[:,}]/.test(headBlock(src));
}

/** The first literal title in the head, without the site suffix and lower-cased; null when it is not a literal. */
export function literalTitle(src: string): string | null {
  const block = headBlock(src);
  const m = block.match(/(?:\btitle:|noindexHead\()\s*(['"`])((?:\\.|(?!\1).)*)\1/);
  const raw = m?.[2];
  if (!raw || raw.includes('${')) return null;
  return raw
    .toLowerCase()
    .replace(/\s*[|—–-]\s*rmh studios$/, '')
    .trim();
}

/** The same lookup over the noindexHead call, which is outside a `head:` block when a const holds it. */
function titleOf(src: string): string | null {
  return literalTitle(src) ?? literalTitle(`head: ${src.match(/noindexHead\([^)]*\)/)?.[0] ?? ''}`);
}

const pages = routeFiles()
  .filter((file) => urlPathFor(file) !== null)
  .map((file) => ({ file: relative(ROOT, file), path: urlPathFor(file) as string, src: readFileSync(file, 'utf8') }))
  .filter(({ file, src }) => /component:/.test(src) && !isLayout(resolve(ROOT, file)));

const missing = pages.filter((p) => !hasTitle(p.src)).map((p) => p.file);

const byTitle = new Map<string, string[]>();
for (const p of pages) {
  if (p.path.includes('$')) continue;
  const title = titleOf(p.src);
  if (title === null) continue;
  byTitle.set(title, [...(byTitle.get(title) ?? []), p.file]);
}
const duplicates = [...byTitle.entries()].filter(([, files]) => files.length > 1);

describe('every page route has a title', () => {
  it('finds the page routes it is meant to check', () => {
    expect(pages.length).toBeGreaterThan(300);
  });

  it('gives each page a head() title, apart from the baseline', () => {
    const fresh = missing.filter((f) => !(f in ROUTE_TITLE_MISSING));
    expect(fresh, `page routes with no head() title:\n${fresh.join('\n')}`).toEqual([]);
  });

  it('keeps ROUTE_TITLE_MISSING honest: an entry is still a page with no title', () => {
    const stale = Object.keys(ROUTE_TITLE_MISSING).filter((f) => !missing.includes(f));
    expect(stale, `titled now, remove from ROUTE_TITLE_MISSING:\n${stale.join('\n')}`).toEqual([]);
  });

  it('fails a page route fixture with no title', () => {
    const untitled = `export const Route = createFileRoute('/x')({ head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }), component: X });`;
    const titled = `export const Route = createFileRoute('/x')({ head: () => ({ meta: [{ title: 'X | RMH Studios' }] }), component: X });`;
    const noHead = `export const Route = createFileRoute('/x')({ component: X });\nconst a = { title: 'not the head' };`;
    expect(hasTitle(untitled)).toBe(false);
    expect(hasTitle(noHead)).toBe(false);
    expect(hasTitle(titled)).toBe(true);
    expect(hasTitle(`export const Route = f({ head: () => ({ meta: buildMeta({ title: x }) }) });`)).toBe(true);
  });
});

describe('no two static pages share a title', () => {
  it('lists every duplicate in ROUTE_TITLE_DUPLICATES, and nothing else', () => {
    const fresh = duplicates.filter(([title]) => !(title in ROUTE_TITLE_DUPLICATES));
    expect(
      fresh.map(([title, files]) => `${title}: ${files.join(', ')}`),
      'static pages with the same title',
    ).toEqual([]);
  });

  it('keeps ROUTE_TITLE_DUPLICATES honest: an entry is still a duplicate, and only shrinks', () => {
    const live = new Map(duplicates);
    for (const [title, files] of Object.entries(ROUTE_TITLE_DUPLICATES)) {
      const now = live.get(title) ?? [];
      expect(now.length, `"${title}" is no longer shared: remove it from ROUTE_TITLE_DUPLICATES`).toBeGreaterThan(1);
      for (const f of files) expect(now, `${f} no longer has "${title}"`).toContain(f);
      expect(files.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('finds a duplicate in fixtures', () => {
    expect(literalTitle(`head: () => ({ meta: [{ title: 'Security | RMH Studios' }] })`)).toBe('security');
    expect(literalTitle(`head: () => ({ meta: buildMeta({ title: 'SECURITY', path: '/s' }) })`)).toBe('security');
    expect(literalTitle('head: () => ({ meta: [{ title: `${name} | RMH Studios` }] })')).toBeNull();
  });
});

describe('the route announcer', () => {
  const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const files = [
    'lib/router/route-announce.ts',
    'lib/router/route-announce-client.ts',
    'components/shell/RouteAnnouncer.tsx',
  ];

  it('is mounted once, in the root route', () => {
    const root = stripComments(read('app/routes/__root.tsx'));
    expect(root.match(/<RouteAnnouncer\s*\/>/g) ?? []).toHaveLength(1);
    const others = routeFiles()
      .filter((f) => !f.endsWith('__root.tsx'))
      .filter((f) => /<RouteAnnouncer\b/.test(stripComments(readFileSync(f, 'utf8'))));
    expect(others).toEqual([]);
  });

  it('is installed by the router, once', () => {
    const router = stripComments(read('app/router.tsx'));
    // The router passes its own instance first; later arguments (the pre-install recorder's replay, s13-19) vary.
    expect(router.match(/installRouteAnnouncer\(router[,)]/g) ?? []).toHaveLength(1);
  });

  it('observes nothing and schedules no frame or timer', () => {
    for (const f of files) {
      const src = stripComments(read(f));
      expect(src, f).not.toMatch(/MutationObserver|requestAnimationFrame|setTimeout|setInterval/);
    }
  });
});
