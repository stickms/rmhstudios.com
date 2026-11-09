import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The hook's mode logic is plain module state and one layout effect, so it runs here without a
// DOM: `useLayoutEffect` is made to run its callback at once (keeping the cleanup), and the few
// browser globals it reads are stubbed. Only the painting of <html> and the heavy `Providers`
// module are replaced.
let cleanup: void | (() => void);
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useLayoutEffect: (fn: () => void | (() => void)) => {
    cleanup = fn();
  },
}));
vi.mock('@/components/Providers', () => ({ isAppThemeRoute: () => false }));
vi.mock('@/stores/themeStore', async (orig) => ({
  ...(await orig<typeof import('@/stores/themeStore')>()),
  paintDocumentGround: vi.fn(),
}));

import { paintDocumentGround } from '@/stores/themeStore';
import { MODE_STORAGE_KEY } from '@/lib/rmhmusic/learn/mode';
import { setMode, subscribeMode, useRmhMusicModeRoot } from './useRmhMusicMode';

const paint = vi.mocked(paintDocumentGround);
/** What the document was last painted as: the `dark` flag of the last paint. */
const painted = () => paint.mock.lastCall?.[1];

/** A localStorage that can be told to refuse writes (full / blocked) or reads (cookies blocked). */
function fakeStorage() {
  const data = new Map<string, string>();
  const state = { failWrites: false, failReads: false };
  const storage = {
    getItem(key: string) {
      if (state.failReads) throw new DOMException('blocked', 'SecurityError');
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (state.failWrites) throw new DOMException('full', 'QuotaExceededError');
      data.set(key, value);
    },
  };
  return { storage, state, data };
}

/** A matchMedia whose dark-scheme answer can change, notifying the hook like the browser does. */
function fakeSystem(initialDark: boolean) {
  const query = {
    matches: initialDark,
    handlers: new Set<() => void>(),
    addEventListener: (_type: string, fn: () => void) => query.handlers.add(fn),
    removeEventListener: (_type: string, fn: () => void) => query.handlers.delete(fn),
  };
  return {
    query,
    matchMedia: () => query,
    setDark(dark: boolean) {
      query.matches = dark;
      for (const fn of [...query.handlers]) fn();
    },
  };
}

describe('RMH Music mode: a choice that storage will not keep', () => {
  let store: ReturnType<typeof fakeStorage>;
  let system: ReturnType<typeof fakeSystem>;

  const mount = (systemDark: boolean) => {
    system = fakeSystem(systemDark);
    vi.stubGlobal('window', {
      matchMedia: system.matchMedia,
      location: { pathname: '/rmhmusic' },
    });
    // Not a component: `useLayoutEffect` is mocked above to run its callback on the spot.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useRmhMusicModeRoot();
  };

  beforeEach(() => {
    paint.mockClear();
    store = fakeStorage();
    vi.stubGlobal('localStorage', store.storage);
  });

  afterEach(() => {
    // Unmount (drops the system listener and the current mode), then release any held choice by a
    // successful save: the held value is module state shared with the next test.
    if (typeof cleanup === 'function') cleanup();
    cleanup = undefined;
    vi.stubGlobal('localStorage', fakeStorage().storage);
    setMode('light');
    vi.unstubAllGlobals();
  });

  it('follows the system while nothing is stored', () => {
    mount(true);
    expect(painted()).toBe(true);
    system.setDark(false);
    expect(painted()).toBe(false);
  });

  it('a saved choice wins over the system', () => {
    mount(false);
    setMode('dark');
    expect(store.data.get(MODE_STORAGE_KEY)).toBe('{"dark":true}');
    system.setDark(false);
    system.setDark(true);
    system.setDark(false);
    expect(painted()).toBe(true);
  });

  it('a choice storage would not keep still applies, and a later system change does not undo it', () => {
    mount(false);
    store.state.failWrites = true;
    expect(() => setMode('dark')).not.toThrow();
    expect(painted()).toBe(true);
    expect(store.data.size).toBe(0);
    system.setDark(true);
    system.setDark(false);
    expect(painted()).toBe(true);
  });

  it('the held choice is released once a later save succeeds', () => {
    mount(false);
    store.state.failWrites = true;
    setMode('dark');
    store.state.failWrites = false;
    setMode('light');
    // The stored light choice now wins; the old held dark is gone.
    system.setDark(true);
    expect(painted()).toBe(false);
  });

  it('blocked reads fall back to the system without throwing', () => {
    store.state.failReads = true;
    expect(() => mount(true)).not.toThrow();
    expect(painted()).toBe(true);
    system.setDark(false);
    expect(painted()).toBe(false);
  });

  it('tells subscribers when the mode changes', () => {
    mount(false);
    const seen = vi.fn();
    const off = subscribeMode(seen);
    setMode('dark');
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    setMode('light');
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
