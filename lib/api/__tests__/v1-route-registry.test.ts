/**
 * Every developer-API route file is catalogued (s15-03). `/api/v1/**` routes are files under `app/routes/api/v1`
 * (they keep `withDeveloperApi`), and `ENDPOINTS` in `lib/api/registry.ts` drives the OpenAPI document, the SDK and
 * the docs. Two Slice It! routes shipped without an entry and were absent from all three until now, and nothing
 * noticed. A route file whose path and methods have no entry fails here, and so does an entry with no route file.
 *
 * A file name maps to a path the way TanStack does: `$name` is `{name}`, `[.]` is a literal dot, a leading `_`
 * segment or `index` is not part of the path.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENDPOINTS } from '@/lib/api/registry';

const ROOT = join(process.cwd(), 'app/routes/api/v1');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** `app/routes/api/v1/me/characters/$id.ts` is `/api/v1/me/characters/{id}`. */
function pathOf(file: string): string {
  const rel = relative(ROOT, file)
    .replace(/\\/g, '/')
    .replace(/\.(ts|tsx)$/, '');
  const parts = rel
    .split('/')
    .flatMap((seg) => seg.split(/(?<!\[)\.(?!\])/))
    .filter((seg) => seg !== 'index')
    .map((seg) => seg.replace(/\[\.\]/g, '.').replace(/^\$(.+)$/, '{$1}'));
  return `/api/v1${parts.length ? `/${parts.join('/')}` : ''}`;
}

/** The HTTP methods a route file handles (`OPTIONS` is CORS preflight and is not an endpoint). */
function methodsOf(src: string): string[] {
  const body = src.slice(src.indexOf('handlers:'));
  return [...new Set([...body.matchAll(/^\s*(GET|POST|PUT|PATCH|DELETE)\s*:/gm)].map((m) => m[1]!))];
}

const files = walk(ROOT).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'));
const routeFiles = files.filter((file) => readFileSync(file, 'utf8').includes('createFileRoute'));
const routes = routeFiles.flatMap((file) => {
  const path = pathOf(file);
  return methodsOf(readFileSync(file, 'utf8')).map((method) => ({ file: relative(process.cwd(), file), method, path }));
});
const catalogued = new Set(ENDPOINTS.map((e) => `${e.method} ${e.path}`));

describe('the developer API catalogue', () => {
  it('finds the route files (the walk is not empty)', () => {
    expect(routes.length).toBeGreaterThan(50);
    expect(routes.map((r) => `${r.method} ${r.path}`)).toContain('GET /api/v1/slice-it/charts/{id}');
  });

  it('reads at least one method from every route file, so none is skipped unseen', () => {
    const silent = routeFiles
      .filter((file) => methodsOf(readFileSync(file, 'utf8')).length === 0)
      .map((file) => relative(process.cwd(), file));
    expect(silent, 'a route file with no GET/POST/PUT/PATCH/DELETE handler the walk can read').toEqual([]);
  });

  it('has an ENDPOINTS entry for every v1 route file, by path and method', () => {
    const missing = routes
      .filter((r) => !catalogued.has(`${r.method} ${r.path}`))
      .map((r) => `${r.method} ${r.path} (${r.file})`);
    expect(missing, 'add these to ENDPOINTS in lib/api/registry.ts').toEqual([]);
  });

  it('has a route file for every ENDPOINTS entry', () => {
    const served = new Set(routes.map((r) => `${r.method} ${r.path}`));
    const orphans = [...catalogued].filter((e) => !served.has(e));
    expect(orphans, 'an entry documents a route that does not exist').toEqual([]);
  });

  it('lists the five Slice It endpoints', () => {
    const slice = ENDPOINTS.filter((e) => e.group === 'Slice It').map((e) => `${e.method} ${e.path}`);
    expect(slice.sort()).toEqual(
      [
        'GET /api/v1/me/slice-it/runs',
        'GET /api/v1/slice-it/charts',
        'GET /api/v1/slice-it/charts/{id}',
        'GET /api/v1/slice-it/leaderboard',
        'GET /api/v1/slice-it/players/{handle}',
      ].sort(),
    );
  });
});
