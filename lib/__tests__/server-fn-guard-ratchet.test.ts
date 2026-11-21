/**
 * Privileged server functions check their caller inside the handler.
 *
 * A `createServerFn` is its own HTTP endpoint, so a route's `beforeLoad` (the admin layout's `checkAdminAuth`)
 * does not protect it: anyone can call the function directly. In the privileged areas below, every
 * `createServerFn` must therefore contain a recognised admin guard of its own, in its own handler.
 *
 * Recognised: `requireAdminServerFn()` (lib/auth/server-fn-guards.server.ts, the one to use), the older
 * `requireAdminSession()` in lib/security-reports.ts, or an explicit read of the session user's `isAdmin`.
 * The allowlist is for functions that are deliberately not admin-only and it only shrinks.
 */
import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

/** Every file under these globs is privileged: all of its server functions need an admin guard. */
const PRIVILEGED_GLOBS = ['app/routes/_site/admin/**/*.{ts,tsx}', 'app/routes/admin/**/*.{ts,tsx}'];

/** Individual files outside the admin tree whose server functions are admin-only. */
const PRIVILEGED_FILES = [
  'lib/security-reports.ts',
  'app/routes/_site/rmhladder/health.tsx',
  'app/routes/_site/rmhladder/companies.tsx',
  'app/routes/_site/rmhladder/review.tsx',
];

/**
 * `file:ordinal` (0-based position of the createServerFn in the file) that are intentionally not admin-only.
 * `lib/security-reports.ts:0` is the public "report a vulnerability" form, rate-limited by IP.
 */
const ALLOWED = new Set<string>(['lib/security-reports.ts:0']);

const GUARD = /\b(?:requireAdminServerFn|requireAdminSession)\s*\(|\buser\b[^;]{0,40}\bisAdmin\b|\bisAdmin\b\s*(?:\)|!==|===|\?)|admin\??\.isAdmin/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The source of each `createServerFn` in a file: up to the next one, or the route definition. */
function serverFnChunks(src: string): string[] {
  const code = stripComments(src);
  const starts = [...code.matchAll(/\bcreateServerFn\s*\(/g)].map((m) => m.index ?? 0);
  return starts.map((start, i) => {
    const next = starts[i + 1] ?? code.length;
    const route = code.indexOf('export const Route', start);
    return code.slice(start, route >= 0 && route < next ? route : next);
  });
}

function privilegedFiles(): string[] {
  const found = PRIVILEGED_GLOBS.flatMap((g) => globSync(g, { cwd: ROOT }));
  return [...new Set([...found, ...PRIVILEGED_FILES])].sort();
}

describe('privileged server functions guard themselves', () => {
  it('the privileged file list is not stale', () => {
    for (const f of PRIVILEGED_FILES) expect(() => readFileSync(resolve(ROOT, f), 'utf8'), f).not.toThrow();
  });

  it('every createServerFn in an admin area has an in-handler admin guard', () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const file of privilegedFiles()) {
      serverFnChunks(readFileSync(resolve(ROOT, file), 'utf8')).forEach((chunk, i) => {
        seen++;
        if (ALLOWED.has(`${file}:${i}`)) return;
        if (!GUARD.test(chunk)) offenders.push(`${file} (createServerFn #${i})`);
      });
    }
    expect(seen).toBeGreaterThan(5);
    expect(
      offenders,
      'These server functions are directly callable over HTTP and have no admin check in their handler. ' +
        'Call `await requireAdminServerFn()` from lib/auth/server-fn-guards.server.ts first.',
    ).toEqual([]);
  });

  it('the allowlist has no dead entries', () => {
    for (const key of ALLOWED) {
      const [file, n] = [key.slice(0, key.lastIndexOf(':')), Number(key.slice(key.lastIndexOf(':') + 1))];
      expect(serverFnChunks(readFileSync(resolve(ROOT, file), 'utf8')).length, key).toBeGreaterThan(n);
    }
  });

  it('the guard recogniser rejects an unguarded function', () => {
    const bad = `const f = createServerFn({ method: 'GET' }).handler(async () => { return listDrafts(); });`;
    expect(serverFnChunks(bad).every((c) => GUARD.test(c))).toBe(false);
  });
});
