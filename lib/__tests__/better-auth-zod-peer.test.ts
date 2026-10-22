/**
 * Regression: production `/api/auth/*` 500'd on every request carrying
 * `x-forwarded-for` ("TypeError: (void 0) is not a function at isIPv4").
 *
 * Cause: @better-auth/core validates client IPs with `z.validate()`, which zod
 * only has from 4.5. Better Auth depends on `zod ^4.5.4` (so pnpm installs its
 * own 4.6.x copy and dev works), but the repo's own `zod` was pinned at 4.4.3.
 * Nitro's production bundle holds ONE zod chunk, built from the app's copy, so
 * Better Auth's namespace import hit a missing export, which the bundler
 * compiles to `(void 0)`. Apache's mod_proxy adds `X-Forwarded-For` by default,
 * so production hit it; the dev server never did.
 *
 * The app's zod must satisfy the range Better Auth declares.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type Pkg = { version: string; dependencies?: Record<string, string> };
const readPkg = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Pkg;
const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
function gte(a: string, b: string): boolean {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return true;
}

describe("the app's zod vs Better Auth", () => {
  const root = process.cwd();
  const baDir = realpathSync(join(root, 'node_modules', 'better-auth'));
  const corePkg = readPkg(join(dirname(baDir), '@better-auth', 'core', 'package.json'));
  const appZod = join(realpathSync(join(root, 'node_modules', 'zod')), 'package.json');

  it('satisfies the zod range @better-auth/core declares', () => {
    const range = corePkg.dependencies?.zod ?? '';
    const min = range.replace(/^[\^~>=\s]+/, '');
    expect(min).toMatch(/^\d+\.\d+\.\d+/);
    const { version } = readPkg(appZod);
    expect(gte(version, min), `app zod ${version} < Better Auth's ${range}`).toBe(true);
  });

  it('has z.validate, which getIP() -> isIPv4() calls', () => {
    const z = createRequire(appZod)('zod') as { validate?: unknown };
    expect(typeof z.validate).toBe('function');
  });
});
