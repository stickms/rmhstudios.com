/**
 * The device registry is held by a source scan (sprint 07, feature 03): every IndexedDB database and every Web
 * Storage key the site names must be covered by a line in `lib/device-data/registry.ts`, and every line must be used
 * somewhere, so a new store cannot appear without the device page and the sign-out clear knowing about it.
 *
 * What the scan reads is the names, not the calls: a `const XYZ_KEY = 'rmh-...'`, a `setItem('literal', ...)`, an
 * `openDB('literal', ...)` or a template such as `` `prefix:${id}` `` returned by a key function. That is how every
 * store in the repo names itself today; a store that builds its name some other way is the thing to add a line for by
 * hand, and the "no dead lines" half of the test is what notices a name that stopped being used.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { deviceStoreText } from '@/components/settings/device-data-labels';
import { DEVICE_STORES, storeForKey } from '@/lib/device-data/registry';

const ROOTS = ['lib', 'features', 'components', 'hooks', 'stores'];
const STORAGE_MARKER = /\.setItem\(|openDB\(|indexedDB\.open\(/;
const KEY_SHAPE = /^[a-z][a-z0-9]*[-:._][\w:.-]+$/;

/** Not Web Storage keys: constants of the same shape that live in the server tier or name something else. */
const NOT_BROWSER_STORAGE: ReadonlySet<string> = new Set([
  // Header and query names, test-mode switches and the feedback report kind are named like keys but never stored.
  'rmh_test_',
  'jam-feedback',
  'allow-scripts',
  // Redis keys in the casino hub (`features/casino/server/`), skipped by path below as well.
  'casino:table:',
  'casino:tables:',
]);

/** Template prefixes in storage-writing files that are values, URLs or markup rather than keys. */
const NOT_A_KEY_TEMPLATE: ReadonlySet<string> = new Set([
  '',
  'c',
  'p_',
  'share:',
  'draft:',
  'cloud:',
  '/tf2/play?',
  '/rmh/mp/packs/',
  'matrix3d(',
]);

function sourceFiles(): string[] {
  return ROOTS.flatMap((root) => globSync(`${root}/**/*.{ts,tsx}`)).filter(
    (f) =>
      !/\.(test|server)\.|\.d\.ts$|__tests__|\/server\/|generated|node_modules/.test(f) &&
      // Test-only copies of the Source engine are excluded the same way.
      !f.endsWith('.test.ts'),
  );
}

interface Found {
  idb: Map<string, string>;
  keys: Map<string, string>;
}

function scan(): Found {
  const idb = new Map<string, string>();
  const keys = new Map<string, string>();
  for (const file of sourceFiles()) {
    const src = readFileSync(file, 'utf8');
    const marked = STORAGE_MARKER.test(src);
    // Named constants: any file that touches storage, and key-shaped ones anywhere (a constants module that a hook
    // imports, such as lib/access/prefs.ts).
    for (const m of src.matchAll(
      /\b(?:const|let|var)\s+([A-Za-z_0-9]*(?:KEY|STORAGE|PREFIX|DB)[A-Za-z_0-9]*)\s*(?::[^=]+)?=\s*(['"`])([a-z][^'"`$]*)\2/g,
    )) {
      const name = m[1] as string;
      const value = m[3] as string;
      if (!marked && !KEY_SHAPE.test(value)) continue;
      if (NOT_BROWSER_STORAGE.has(value)) continue;
      if (/(^|_)DB(_NAME)?$|DB$|^SNAPSHOT_DB$|REPLAY_DB|CACHE_DB/.test(name)) idb.set(value, file);
      else keys.set(value, file);
    }
    if (!marked) continue;
    for (const m of src.matchAll(/openDB\(\s*(['"`])([^'"`$]+)\1|indexedDB\.open\(\s*(['"`])([^'"`$]+)\3/g))
      idb.set((m[2] ?? m[4]) as string, file);
    for (const m of src.matchAll(/\.setItem\(\s*(['"`])([^'"`$]+)/g)) keys.set(m[2] as string, file);
    for (const m of src.matchAll(/(?:=>|return|prefix\s*=)\s*`([^`$]*)\$\{/g)) {
      const prefix = m[1] as string;
      if (NOT_A_KEY_TEMPLATE.has(prefix) || /[\s;()]/.test(prefix)) continue;
      keys.set(prefix, file);
    }
  }
  return { idb, keys };
}

const found = scan();

describe('device registry', () => {
  it('covers every IndexedDB database the site opens', () => {
    const known = new Set(DEVICE_STORES.filter((s) => s.kind === 'indexeddb').flatMap((s) => [...s.names]));
    const missing = [...found.idb].filter(([name]) => !known.has(name)).map(([n, f]) => `${n} (${f})`);
    expect(missing, 'add a line to lib/device-data/registry.ts').toEqual([]);
  });

  it('covers every Web Storage key or prefix the site names', () => {
    const missing = [...found.keys].filter(([key]) => !storeForKey(key)).map(([k, f]) => `${k} (${f})`);
    expect(missing, 'add a line to lib/device-data/registry.ts').toEqual([]);
  });

  it('has no dead lines: every database and key name is still used somewhere', () => {
    const dead: string[] = [];
    for (const s of DEVICE_STORES) {
      if (s.kind === 'indexeddb') {
        for (const n of s.names) if (!found.idb.has(n)) dead.push(`${s.id}: ${n}`);
      } else if (s.kind === 'localstorage-prefix') {
        for (const n of s.names)
          if (![...found.keys.keys()].some((k) => k.startsWith(n) || n.startsWith(k))) dead.push(`${s.id}: ${n}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('names the service worker caches the worker really opens', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    const opened = [...sw.matchAll(/=\s*`(rmh-[a-z]+-)\$\{/g)].map((m) => m[1] as string);
    const registered = DEVICE_STORES.filter((s) => s.kind === 'cache-prefix').flatMap((s) => [...s.names]);
    expect(opened.length).toBeGreaterThan(0);
    expect(registered.slice().sort()).toEqual(opened.slice().sort());
  });

  it('has unique ids, non-empty names and no name claimed twice', () => {
    const ids = DEVICE_STORES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const seen = new Set<string>();
    for (const s of DEVICE_STORES) {
      expect(s.names.length).toBeGreaterThan(0);
      for (const n of s.names) {
        const k = `${s.kind === 'localstorage-prefix' ? 'ls' : s.kind}:${n}`;
        expect(seen.has(k), k).toBe(false);
        seen.add(k);
      }
    }
  });

  it('keeps unsent work out of the personal-only automatic clear unless asked for', () => {
    const unsent = DEVICE_STORES.filter((s) => s.unsent);
    expect(unsent.map((s) => s.id).sort()).toEqual(['draft-keys', 'drafts', 'studio']);
    for (const s of unsent) expect(s.personal).toBe(true);
  });

  it('keeps the sign-out switch and the theme out of the personal data', () => {
    expect(storeForKey('rmh-device-clear-on-sign-out')?.personal).toBe(false);
    expect(storeForKey('rmh-user-theme')?.personal).toBe(false);
    expect(storeForKey('rmh-lang-picked-v1')?.personal).toBe(false);
  });

  it('has a translated label and hint for every registry id', () => {
    const echo = ((_k: string, o: { defaultValue: string }) => o.defaultValue) as never;
    const text = deviceStoreText(echo);
    expect(Object.keys(text).sort()).toEqual(DEVICE_STORES.map((s) => s.id).sort());
    for (const v of Object.values(text)) {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.hint.length).toBeGreaterThan(0);
    }
  });
});
