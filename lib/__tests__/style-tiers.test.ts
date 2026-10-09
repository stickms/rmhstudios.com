/**
 * The two entry stylesheets stay correct and lean — `app/site-tier.css`
 * explains the split, `lib/style-tier.ts` picks a sheet per route.
 *
 * The site sheet is told which source directories to skip (`@source not`). A
 * skipped directory that a site page DOES render would leave that page without
 * the utilities it uses — a broken layout nothing else would catch, because the
 * class names still look right in the code. So this walks the import graph
 * from everything that takes the site sheet (`__root`, `_site/**`, the
 * SITE_SHEET_ROUTES pages) and fails on any import that lands in a skipped path.
 *
 * The reverse also fails: a components/ or lib/ directory that only game and
 * app routes import, but that the site sheet still scans. That is a new game's
 * utilities back on every page's critical path — add the line the test prints.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { SITE_SHEET_ROUTES, styleTierFor } from '@/lib/style-tier';

const ROOT = join(__dirname, '..', '..');
const APP = join(ROOT, 'app');
const ROUTES = join(APP, 'routes');
const EXTS = ['.tsx', '.ts', '.mts', '.jsx', '.js', '.mjs'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  base = base.replace(/\?.*$/, '');
  for (const c of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, 'index' + e))]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const IMPORT_RE =
  /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const depCache = new Map<string, string[]>();
function deps(file: string): string[] {
  let out = depCache.get(file);
  if (out) return out;
  out = [];
  if (EXTS.some((e) => file.endsWith(e))) {
    for (const m of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
      const r = resolveImport(file, m[1] ?? m[2] ?? m[3]);
      if (r) out.push(r);
    }
  }
  depCache.set(file, out);
  return out;
}

function reach(roots: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...roots];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...deps(f));
  }
  return seen;
}

function sourceNots(sheet: string): string[] {
  const css = readFileSync(join(APP, sheet), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/@source\s+not\s+["']([^"']+)["']/g)].map((m) =>
    relative(ROOT, resolve(APP, m[1])),
  );
}

/** `/news/$slug` → its route file(s): `news.$slug.tsx` and/or a `news.$slug/` directory. */
function routeFiles(id: string): string[] {
  const base = join(ROUTES, id.slice(1).replace(/\//g, '.'));
  const files: string[] = [];
  if (existsSync(base + '.tsx')) files.push(base + '.tsx');
  if (existsSync(base) && statSync(base).isDirectory()) files.push(...walk(base));
  return files;
}

const pages = walk(ROUTES).filter((f) => /\.(tsx|ts)$/.test(f) && !f.includes(`${join('routes', 'api')}`));
const isSiteRoute = (f: string) => {
  const r = relative(ROUTES, f);
  return r === '__root.tsx' || r === '_site.tsx' || r.startsWith('_site/');
};
const siteRoots = [...pages.filter(isSiteRoute), ...[...SITE_SHEET_ROUTES].flatMap(routeFiles)];
// Page routes only: a top-level `.ts` route is a server handler and renders no classes.
const appRoots = pages.filter((f) => !isSiteRoute(f) && f.endsWith('.tsx'));
const siteReach = reach(siteRoots);
const appReach = reach(appRoots);

// The infrastructure exclusions (scripts, docs, …) live in globals.css and
// apply to both sheets; the tier exclusions are what site-tier.css adds.
const tierExcluded = sourceNots('site-tier.css');
const under = (file: string, path: string) => {
  const r = relative(ROOT, file);
  return r === path || r.startsWith(path + '/');
};

describe('entry stylesheet tiers', () => {
  it('every SITE_SHEET_ROUTES entry is a real top-level route', () => {
    for (const id of SITE_SHEET_ROUTES) expect(routeFiles(id), id).not.toEqual([]);
  });

  it('no page that takes the site sheet renders code the site sheet does not scan', () => {
    const offenders: string[] = [];
    for (const file of siteReach) {
      const path = tierExcluded.find((p) => under(file, p));
      if (path) offenders.push(`${relative(ROOT, file)}  (excluded by @source not "${path}")`);
    }
    expect(
      offenders,
      'a site page imports code app/site-tier.css skips, so its utilities are missing there — remove that `@source not` line, or keep the import out of the site shell',
    ).toEqual([]);
  });

  it('every exclusion still names something that exists', () => {
    const stale = tierExcluded.filter((p) => !existsSync(join(ROOT, p)));
    expect(stale, 'delete these `@source not` lines from app/site-tier.css').toEqual([]);
  });

  it('game- and app-only directories are excluded from the site sheet', () => {
    const missing = new Set<string>();
    for (const file of appReach) {
      if (siteReach.has(file)) continue;
      const parts = relative(ROOT, file).split('/');
      if (!(parts[0] === 'components' || parts[0] === 'lib') || parts.length < 3) continue;
      const dir = parts.slice(0, 2).join('/');
      if (tierExcluded.some((p) => dir === p || dir.startsWith(p + '/'))) continue;
      const dirHasSiteFile = [...siteReach].some((f) => under(f, dir));
      if (!dirHasSiteFile) missing.add(`@source not "../${dir}";`);
    }
    expect(
      [...missing].sort(),
      'only full-screen routes import these directories, yet the site sheet scans them — add the lines to app/site-tier.css',
    ).toEqual([]);
  });

  it('the app-tier sheet is the unfiltered superset', () => {
    expect(sourceNots('app-tier.css')).toEqual([]);
    const css = readFileSync(join(APP, 'app-tier.css'), 'utf8');
    expect(css).toMatch(/@import 'tailwindcss';\s*@import '\.\/globals\.css';/);
    expect(readFileSync(join(APP, 'site-tier.css'), 'utf8')).toMatch(
      /@import 'tailwindcss';\s*@import '\.\/globals\.css';/,
    );
    // The body must not pull Tailwind in itself, or each entry would emit it twice.
    expect(readFileSync(join(APP, 'globals.css'), 'utf8')).not.toMatch(/@import\s+['"]tailwindcss['"]/);
  });

  it('picks the sheet by route, and keeps the superset once it is loaded', () => {
    expect(styleTierFor(['__root__'], false)).toBe('site');
    expect(styleTierFor(['__root__', '/_site', '/_site/'], false)).toBe('site');
    expect(styleTierFor(['__root__', '/login'], false)).toBe('site');
    expect(styleTierFor(['__root__', '/altair'], false)).toBe('app');
    expect(styleTierFor(['__root__', '/a-route-added-later'], false)).toBe('app');
    expect(styleTierFor(['__root__', '/_site', '/_site/'], true)).toBe('app');
  });
});
