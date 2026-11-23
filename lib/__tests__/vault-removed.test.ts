/**
 * The Vault (`/secret`) is gone. Project Vega, Signal Forge and Cursed Logic are listed library games at their own
 * URLs, Satan's Library is discontinued, and every old address forwards (design: docs/superpowers/specs/
 * 2026-11-23-vault-games-migration-design.md). These hold the removal: a revived route, a stray asset or a
 * sitemap line would quietly bring the easter egg back.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_REDIRECTS, legacyRedirectFor } from '@/lib/route/legacy-redirects';

const ROOT = join(__dirname, '../..');

/** Source trees a leftover Satan's Library reference could hide in (generated route tree and docs excluded). */
const SCANNED = ['app', 'components', 'features', 'hooks', 'lib', 'locales', 'scripts', 'server', 'stores'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.cache') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|json|css|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

describe('the Vault is removed', () => {
  it('has no /secret route files left', () => {
    expect(existsSync(join(ROOT, 'app/routes/secret.tsx'))).toBe(false);
    expect(existsSync(join(ROOT, 'app/routes/secret'))).toBe(false);
  });

  it('has no Vault namespace left', () => {
    expect(existsSync(join(ROOT, 'locales/en/r-secret.json'))).toBe(false);
    expect(readFileSync(join(ROOT, 'lib/i18n/config.ts'), 'utf8')).not.toContain('r-secret');
  });

  it("has no Satan's Library asset or reference in source", () => {
    expect(existsSync(join(ROOT, 'public/images/games/satans_library.webp'))).toBe(false);
    const hits = SCANNED.flatMap((d) => walk(join(ROOT, d)))
      .filter((f) => !f.endsWith('vault-removed.test.ts'))
      .filter((f) => /satans[-_]library/i.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  it('lists no /secret page in the sitemap source', () => {
    expect(readFileSync(join(ROOT, 'lib/sitemap.ts'), 'utf8')).not.toContain('/secret');
  });

  it('serves the three games as listed library titles', async () => {
    const { games } = await import('@/lib/catalog');
    for (const [id, href] of [
      ['vega', '/vega'],
      ['signal-forge', '/signal-forge'],
      ['cursed-logic', '/cursed-logic'],
    ] as const) {
      const entry = games.find((g) => g.id === id);
      expect(entry, id).toBeDefined();
      expect(entry?.href).toBe(href);
      expect(entry?.unlisted).toBeFalsy();
      expect(entry?.authGate).toBe(true);
    }
  });

  it('keeps no redirect from the old /secret paths (the route is gone, not forwarded)', () => {
    expect(Object.keys(LEGACY_REDIRECTS).filter((k) => k === '/secret' || k.startsWith('/secret/'))).toEqual([]);
    for (const p of ['/secret', '/secret/', '/secret/vega', '/secret/signal-forge', '/secret/cursed-logic']) {
      expect(legacyRedirectFor(p), p).toBeNull();
    }
  });
});
