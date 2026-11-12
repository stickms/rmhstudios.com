/**
 * Where the site's API handlers are written, for tooling (third-pass audit AR3).
 *
 * An endpoint is either a route file under `app/routes/api` or a registered module that
 * exports `route = apiRoute('/api/…', { … })` (`lib/api/route.server.ts`). Every gate
 * that used to walk `app/routes/api` walks this instead, so moving an endpoint into the
 * registry never takes it out of a scan.
 *
 * Node-only (reads the working tree): for tests, scripts and generators, never for app
 * code. The registered modules are found by scanning `lib/` and `features/`, not by
 * reading the generated table, so the table itself can be checked against this.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { templateOfRouteFile } from './route-template';

export const API_ROUTES_DIR = 'app/routes/api';
/** The generated list of registered modules. */
export const API_ROUTE_TABLE = 'lib/api/route-table.server.ts';

const REGISTERED_ROOTS = ['lib', 'features'];
const REGISTERED_FILE = /\.server\.ts$/;
/** The one spelling a registered module uses; the generator and the tests key on it. */
const REGISTRATION = /^export const route = apiRoute\(\s*'([^']+)'/m;

const posix = (p: string): string => p.split(sep).join('/');

function walk(root: string, dir: string, keep: (name: string) => boolean, acc: string[]): string[] {
  let entries;
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) walk(root, rel, keep, acc);
    else if (keep(entry.name)) acc.push(posix(rel));
  }
  return acc;
}

export interface ApiSource {
  /** Repo-relative, forward slashes. */
  file: string;
  /** TanStack-style template without a trailing slash, e.g. `/api/posts/$id`. */
  template: string;
  kind: 'route-file' | 'registered';
}

/** Every `.ts` route file under `app/routes/api`, sorted. */
export function apiRouteFiles(root: string = process.cwd()): ApiSource[] {
  return walk(root, API_ROUTES_DIR, (name) => name.endsWith('.ts'), [])
    .sort()
    .map((file) => ({ file, template: templateOfRouteFile(file), kind: 'route-file' as const }));
}

/** Every module that registers an endpoint with `apiRoute`, sorted by template. */
export function registeredApiRoutes(root: string = process.cwd()): ApiSource[] {
  const out: ApiSource[] = [];
  for (const dir of REGISTERED_ROOTS) {
    for (const file of walk(root, dir, (name) => REGISTERED_FILE.test(name), [])) {
      const match = REGISTRATION.exec(readFileSync(join(root, file), 'utf8'));
      if (match) out.push({ file, template: match[1]!, kind: 'registered' });
    }
  }
  return out.sort((a, b) => (a.template < b.template ? -1 : a.template > b.template ? 1 : 0));
}

/** Route files and registered modules together: everything that answers `/api/**`. */
export function apiSources(root: string = process.cwd()): ApiSource[] {
  return [...apiRouteFiles(root), ...registeredApiRoutes(root)];
}

/** Absolute paths of every API handler source, for scanners that only want files. */
export function apiSourcePaths(root: string = process.cwd()): string[] {
  return apiSources(root).map((s) => join(root, s.file));
}

/** Repo-relative path of an absolute one, forward slashes. */
export function repoRelative(root: string, file: string): string {
  return posix(relative(root, file));
}
