/**
 * `html.native-material`: the CSS-only material (the woken haze, app/jelly-material.css §3b) has no install step a
 * native-material route can skip, so those routes are marked on <html> and the material's rules are scoped off them.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runPrepaint } from './prepaint-harness';
import {
  NATIVE_MATERIAL_BASES,
  NATIVE_MATERIAL_CLASS,
  isNativeMaterialRoute,
  syncNativeMaterialClass,
} from '@/lib/native-material-routes';
import { readCss } from './css-source';

function fakeRoot() {
  const set = new Set<string>();
  return {
    set,
    classList: {
      toggle: (c: string, force?: boolean) => {
        const on = force ?? !set.has(c);
        if (on) set.add(c);
        else set.delete(c);
        return on;
      },
      remove: (...cs: string[]) => cs.forEach((c) => set.delete(c)),
    },
  };
}

describe('isNativeMaterialRoute', () => {
  it('covers /tf2 and /games and the paths under them, on segment boundaries', () => {
    for (const p of ['/tf2', '/tf2/hud-editor', '/games', '/games/hearthworks'])
      expect(isNativeMaterialRoute(p), p).toBe(true);
    for (const p of ['/', '/tf2x', '/gamesroom', '/blog', undefined, null])
      expect(isNativeMaterialRoute(p), String(p)).toBe(false);
  });
});

describe('syncNativeMaterialClass', () => {
  it('stamps the class on a native-material route and its cleanup removes it', () => {
    const root = fakeRoot();
    const cleanup = syncNativeMaterialClass(root, '/games/hearthworks');
    expect(root.set.has(NATIVE_MATERIAL_CLASS)).toBe(true);
    cleanup();
    expect(root.set.has(NATIVE_MATERIAL_CLASS)).toBe(false);
  });

  it('clears a stale class on an ordinary route (e.g. a pre-paint stamp the route no longer matches)', () => {
    const root = fakeRoot();
    root.set.add(NATIVE_MATERIAL_CLASS);
    const cleanup = syncNativeMaterialClass(root, '/explore');
    expect(root.set.has(NATIVE_MATERIAL_CLASS)).toBe(false);
    cleanup();
    expect(root.set.has(NATIVE_MATERIAL_CLASS)).toBe(false);
  });

  it('a navigation between two native routes keeps the class (cleanup then re-stamp)', () => {
    const root = fakeRoot();
    const first = syncNativeMaterialClass(root, '/tf2');
    first();
    syncNativeMaterialClass(root, '/tf2/loadout');
    expect(root.set.has(NATIVE_MATERIAL_CLASS)).toBe(true);
  });
});

describe('wiring', () => {
  const read = (f: string) => readCss(join(process.cwd(), f));

  it('Providers keeps the class in step with the pathname, next to useJellyPointer', () => {
    const src = read('components/Providers.tsx');
    expect(src).toMatch(
      /useJellyPointer\(!isNativeMaterialRoute\(pathname\)\);[\s\S]{0,400}useEffect\(\(\) => syncNativeMaterialClass\(document\.documentElement, pathname\), \[pathname\]\);/,
    );
  });

  it('the theme script stamps it before first paint, from the same route list', () => {
    // The GENERATED pre-paint code, run against every native-material base and its neighbours.
    for (const base of NATIVE_MATERIAL_BASES) {
      expect(runPrepaint({ path: base }).classes.has(NATIVE_MATERIAL_CLASS)).toBe(true);
      expect(runPrepaint({ path: `${base}/x/y` }).classes.has(NATIVE_MATERIAL_CLASS)).toBe(true);
      expect(runPrepaint({ path: `${base}x` }).classes.has(NATIVE_MATERIAL_CLASS)).toBe(false);
    }
    expect(runPrepaint({ path: '/' }).classes.has(NATIVE_MATERIAL_CLASS)).toBe(false);
  });

  it('the woken haze is scoped off it', () => {
    expect(read('app/jelly-material.css')).toContain(`html:not(.${NATIVE_MATERIAL_CLASS})`);
  });
});
