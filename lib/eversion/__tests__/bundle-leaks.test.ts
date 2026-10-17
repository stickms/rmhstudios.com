import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { EVERSION_RUNTIME_MODULES, eversionLeaks } from '../../../scripts/check-bundle-budget';

/**
 * The static-closure leak scan (spec S#39) is only worth anything if it can FAIL.
 * These tests give it a leak to find (positive), a clean closure (negative control)
 * and the two ways of knowing (sourcemap, fingerprint), and keep every module's
 * fingerprint honest - a fingerprint that no longer appears in its module's source
 * would silently turn the no-sourcemap check into a pass.
 */

const REPO = join(__dirname, '..', '..', '..');

const dirs: string[] = [];
function workDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'eversion-leaks-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function sourceOf(fragment: string): string | null {
  for (const ext of ['.ts', '.tsx']) {
    const file = join(REPO, `${fragment}${ext}`);
    if (existsSync(file)) return readFileSync(file, 'utf8');
  }
  return null;
}

describe('EVERSION_RUNTIME_MODULES', () => {
  // Pure-math leaves with no string literal of their own, so nothing survives
  // minification to search for. Without sourcemaps they are caught through their
  // importers (the host/core/renderer chunks carry fingerprints and import them);
  // with sourcemaps they are caught directly. A NEW module must not join this list.
  const NO_LITERAL = [
    'lib/eversion/gl/governor-tiers',
    'lib/eversion/thurston',
    'lib/eversion/timeline',
  ];

  it('gives every module a minification-proof fingerprint, bar the documented literal-free leaves', () => {
    const bare = EVERSION_RUNTIME_MODULES.filter((m) => !m.fingerprint).map((m) => m.fragment);
    expect(bare.sort()).toEqual(NO_LITERAL);
  });

  it('only fingerprints with text that is really in that module (and in no other listed one)', () => {
    for (const { fragment, fingerprint } of EVERSION_RUNTIME_MODULES) {
      if (!fingerprint || fragment.startsWith('node_modules/')) continue;
      const own = sourceOf(fragment);
      expect(own, `${fragment} has no source file`).not.toBeNull();
      expect(own!.includes(fingerprint), `${fragment} lost its fingerprint`).toBe(true);
      for (const other of EVERSION_RUNTIME_MODULES) {
        if (other.fragment === fragment || other.fragment.startsWith('node_modules/')) continue;
        const text = sourceOf(other.fragment);
        expect(text?.includes(fingerprint), `${fingerprint} is also in ${other.fragment}`).not.toBe(
          true,
        );
      }
    }
  });
});

describe('eversionLeaks', () => {
  it('finds a module by sourcemap, and reports it as such', () => {
    const out = workDir();
    mkdirSync(join(out, 'assets'));
    writeFileSync(join(out, 'assets/shell.js'), 'export{};');
    writeFileSync(
      join(out, 'assets/shell.js.map'),
      JSON.stringify({ sources: ['../../lib/eversion/gl/host.ts', '../../lib/feed.ts'] }),
    );
    const { leaks, mapped } = eversionLeaks(out, ['assets/shell.js']);
    expect(mapped).toBe(1);
    expect(leaks).toEqual([
      { chunk: 'assets/shell.js', fragment: 'lib/eversion/gl/host', via: 'sourcemap' },
    ]);
  });

  it('finds a module by fingerprint when there is no map', () => {
    const out = workDir();
    mkdirSync(join(out, 'assets'));
    writeFileSync(join(out, 'assets/shell.js'), 'throw new Error("eversion: prefetch failed")');
    const { leaks, mapped } = eversionLeaks(out, ['assets/shell.js']);
    expect(mapped).toBe(0);
    expect(leaks.map((l) => [l.fragment, l.via])).toEqual([
      ['lib/eversion/prefetch', 'fingerprint'],
    ]);
  });

  it('negative control: a closure with no eversion code has no leaks', () => {
    const out = workDir();
    mkdirSync(join(out, 'assets'));
    writeFileSync(join(out, 'assets/clean.js'), 'console.log("hello")');
    writeFileSync(join(out, 'assets/mapped.js'), 'export{};');
    writeFileSync(
      join(out, 'assets/mapped.js.map'),
      JSON.stringify({ sources: ['../../lib/feed.ts', '../../node_modules/react/index.js'] }),
    );
    const { leaks, mapped } = eversionLeaks(out, ['assets/clean.js', 'assets/mapped.js']);
    expect(leaks).toEqual([]);
    expect(mapped).toBe(1);
  });

  it('trusts a readable map over the text, and falls back to the text when the map is broken', () => {
    const out = workDir();
    mkdirSync(join(out, 'assets'));
    const text = 'x("eversion: capture sandbox did not load")';
    writeFileSync(join(out, 'assets/a.js'), text);
    writeFileSync(join(out, 'assets/a.js.map'), JSON.stringify({ sources: ['../../lib/feed.ts'] }));
    writeFileSync(join(out, 'assets/b.js'), text);
    writeFileSync(join(out, 'assets/b.js.map'), '{ not json');
    expect(eversionLeaks(out, ['assets/a.js']).leaks).toEqual([]);
    expect(eversionLeaks(out, ['assets/b.js']).leaks.map((l) => l.via)).toEqual(['fingerprint']);
  });
});
