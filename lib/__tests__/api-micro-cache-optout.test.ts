/**
 * Belt and braces next to the generation counter (api-micro-cache.test.ts), which
 * already drops the micro-cache on any `apiCache` invalidation. This scan covers
 * what that cannot see: a write that never touches apiCache.
 *
 * A public `auth: 'none'` route whose data has a write path that invalidates an
 * in-process cache (or can flip visibility) must opt out of the per-worker
 * response micro-cache with `microCache: false`: `apiCache.invalidate*` does not
 * reach it, so the route would serve the pre-write body for up to 30 s.
 * See lib/api/response-cache.server.ts.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });

/** Cache/auth plumbing: defines invalidate(), says nothing about the route's own data. */
const INFRA = new Set(['lib/cache', 'lib/cached.server', 'lib/auth']);

/** Whole-file signal that the route's own data source clears an in-process cache. */
function invalidates(src: string): boolean {
  return /\binvalidate\w*\s*\(/.test(src);
}

describe('micro-cache opt-out', () => {
  const routes = walk(join(ROOT, 'app/routes/api')).filter((f) => {
    const s = readFileSync(f, 'utf8');
    return /auth: 'none'/.test(s) && /(visibility: 'public'|CACHE_POLICY\.)/.test(s);
  });

  it('finds the public routes', () => expect(routes.length).toBeGreaterThan(30));

  it('every public route whose lib data source invalidates declares microCache: false', () => {
    const offenders: string[] = [];
    for (const f of routes) {
      const src = readFileSync(f, 'utf8');
      const libs = [...src.matchAll(/from '@\/(lib\/[^']+)'/g)]
        .filter((m) => !INFRA.has(m[1]))
        .map((m) => join(ROOT, `${m[1]}.ts`));
      const dataInvalidates =
        invalidates(src) || libs.some((l) => existsSync(l) && invalidates(readFileSync(l, 'utf8')));
      if (dataInvalidates && !/microCache:\s*false/.test(src)) offenders.push(f.replace(ROOT, ''));
    }
    expect(offenders).toEqual([]);
  });

  it('visibility-flippable and write-then-read routes opt out', () => {
    for (const f of [
      'app/routes/api/users/$id.wishlist.ts',
      'app/routes/api/tournaments/index.ts',
      'app/routes/api/achievements/$userId.ts',
    ])
      expect(readFileSync(join(ROOT, f), 'utf8')).toMatch(/microCache:\s*false/);
  });
});
