import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * `lib/stale-build.ts` is what keeps a deploy from breaking every open tab.
 *
 * The blue/green hotswap (deploy/hotswap-web.sh) deletes the old web container,
 * and with it the old build's ~950 content-hashed `/assets/*` chunks. A tab
 * that loaded the previous HTML then 404s on the next lazily-loaded route,
 * component or stylesheet and lands on "Something went wrong". The router only
 * self-heals the route-component case, and only for three exact messages — not
 * Vite's CSS-preload failure, not `React.lazy`, not a split loader. The two
 * behaviours that matter, because getting either wrong is user-visible on every
 * deploy:
 *
 *  - every browser's spelling of "that chunk is gone" is recognised, and an
 *    ordinary bug is NOT (reloading on a real error would hide it and lose
 *    the user's unsaved state);
 *  - the reload is bounded: a chunk that is broken on the CURRENT build too
 *    must surface the error page, not reload the tab forever.
 */

async function freshModule() {
  vi.resetModules();
  return import('@/lib/stale-build');
}

let store: Map<string, string>;
let reload: ReturnType<typeof vi.fn>;
let listeners: Map<string, (e: Event) => void>;

beforeEach(() => {
  store = new Map();
  reload = vi.fn();
  listeners = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('window', {
    location: { reload },
    addEventListener: (type: string, fn: (e: Event) => void) => listeners.set(type, fn),
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('isStaleBuildError', () => {
  it.each([
    // Chromium
    'Failed to fetch dynamically imported module: https://rmhstudios.com/assets/feed-AbC123.js',
    // Firefox
    'error loading dynamically imported module: https://rmhstudios.com/assets/feed-AbC123.js',
    // Safari
    'Importing a module script failed.',
    // Vite's preload helper, when a lazy chunk's stylesheet 404s
    'Unable to preload CSS for https://rmhstudios.com/assets/feed-AbC123.css',
    // A 404 answered with the SSR HTML page instead of JS
    "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of 'text/html'.",
  ])('recognises %s', async (message) => {
    const { isStaleBuildError } = await freshModule();
    expect(isStaleBuildError(new TypeError(message))).toBe(true);
  });

  it('recognises webpack-style ChunkLoadError by name', async () => {
    const { isStaleBuildError } = await freshModule();
    const err = new Error('Loading chunk 42 failed.');
    err.name = 'ChunkLoadError';
    expect(isStaleBuildError(err)).toBe(true);
  });

  it.each([
    new TypeError("Cannot read properties of undefined (reading 'map')"),
    new Error('Failed to fetch'), // a plain API fetch failure is not a stale build
    'Unable to preload CSS', // a string, not an Error
    null,
    undefined,
    { message: 42 },
  ])('ignores %s', async (err) => {
    const { isStaleBuildError } = await freshModule();
    expect(isStaleBuildError(err)).toBe(false);
  });
});

describe('reloadForStaleBuild', () => {
  it('reloads the first time', async () => {
    const { reloadForStaleBuild } = await freshModule();
    expect(reloadForStaleBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('refuses a second reload inside the guard window (no reload loop)', async () => {
    const { reloadForStaleBuild } = await freshModule();
    reloadForStaleBuild();
    // The reload lands on a page that still 404s: a fresh module copy, same
    // sessionStorage — exactly what the next document sees.
    const again = await freshModule();
    vi.advanceTimersByTime(5_000);
    expect(again.reloadForStaleBuild()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('allows a reload again after the guard window (the next deploy)', async () => {
    const { reloadForStaleBuild, STALE_BUILD_RELOAD_GUARD_MS } = await freshModule();
    reloadForStaleBuild();
    vi.advanceTimersByTime(STALE_BUILD_RELOAD_GUARD_MS + 1);
    const later = await freshModule();
    expect(later.reloadForStaleBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload when sessionStorage is unavailable (cannot bound it)', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    const { reloadForStaleBuild } = await freshModule();
    expect(reloadForStaleBuild()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('installStaleBuildRecovery', () => {
  it('reloads on vite:preloadError and suppresses the throw', async () => {
    const { installStaleBuildRecovery } = await freshModule();
    installStaleBuildRecovery();
    const handler = listeners.get('vite:preloadError');
    expect(handler).toBeDefined();
    const event = { preventDefault: vi.fn() } as unknown as Event;
    handler!(event);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('lets the error through to the boundary when the guard refuses', async () => {
    const { installStaleBuildRecovery, reloadForStaleBuild } = await freshModule();
    reloadForStaleBuild(); // a reload already happened moments ago
    installStaleBuildRecovery();
    const event = { preventDefault: vi.fn() } as unknown as Event;
    listeners.get('vite:preloadError')!(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
