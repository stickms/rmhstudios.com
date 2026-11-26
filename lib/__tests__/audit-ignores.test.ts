import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `pnpm audit` matches version ranges, so a dependency fixed by a pnpm patch
 * (patches/, `pnpm.patchedDependencies`) still reports as vulnerable, and the
 * only way to let the deploy gate pass is `pnpm.auditConfig.ignoreGhsas`. An
 * ignore hides every copy of the package, though, not just the patched one: on
 * 2026-11-17 the picomatch ignore was also hiding an unpatched picomatch 2.3.2
 * that i18next-cli pulled in.
 *
 * So an ignore is allowed only for an advisory listed here, and only while
 * EVERY version of its package in the lockfile is a patched one. A new copy of
 * the package, or a version bump without its patch, fails this test and the
 * audit is back to blocking. When upstream ships a fix, remove the patch, the
 * ignore and the entry here together (patches/README.md).
 */
const PATCHED_ADVISORIES: Record<string, string> = {
  'GHSA-fc5q-39xc-vjpf': 'picomatch', // patches/picomatch@4.0.7.patch
};

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  pnpm?: {
    patchedDependencies?: Record<string, string>;
    auditConfig?: {
      ignoreGhsas?: string[];
    };
  };
};
const lockfile = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');

/** Every version of `name` the lockfile installs (from its `packages:` keys). */
function lockedVersions(name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(`^  '?${escaped}@([^:(']+)`, 'gm');
  return [...new Set([...lockfile.matchAll(re)].map((m) => m[1]))];
}

describe('audit ignores are only for patched dependencies', () => {
  const ignored = pkg.pnpm?.auditConfig?.ignoreGhsas ?? [];
  const patched = pkg.pnpm?.patchedDependencies ?? {};

  it('every ignored advisory is a known, patched one', () => {
    expect(ignored.filter((ghsa) => !(ghsa in PATCHED_ADVISORIES))).toEqual([]);
  });

  for (const ghsa of ignored) {
    const name = PATCHED_ADVISORIES[ghsa];
    if (!name) continue;
    it(`${ghsa}: every ${name} in the lockfile is patched`, () => {
      const versions = lockedVersions(name);
      expect(versions.length).toBeGreaterThan(0);
      expect(versions.filter((v) => !(`${name}@${v}` in patched))).toEqual([]);
      // pnpm records the applied patch on the lockfile entry itself.
      for (const v of versions) {
        expect(lockfile).toMatch(new RegExp(`${name}@${v.replace(/\./g, '\\.')}\\(patch_hash=`));
      }
    });
  }
});
