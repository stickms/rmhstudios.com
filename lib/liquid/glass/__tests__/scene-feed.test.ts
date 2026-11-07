/**
 * The snapshot-only scene feed (lib/liquid/glass/scene-feed.ts): what the liquid globe refracts once the glass engine
 * is no longer installed. One refcounted provider per document, woken only by acquire, route, theme, resize and the tab
 * becoming visible — never by scroll — and gated off while the tab is hidden, the hub is open, or the page is printing.
 *
 * Runs in the node environment against a tiny fake document/window; the page snapshot and the scene store are mocked
 * (the capture itself is `scene.ts`'s concern, not the feed's).
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SceneOptions, SceneShot } from '../scene';

// ── Mocks: the provider and the store ────────────────────────────────────────

const calls: string[] = [];
const providers: { options: SceneOptions }[] = [];

vi.mock('../scene', async (importOriginal) => {
  const real = await importOriginal<typeof import('../scene')>();
  return {
    ...real,
    createSceneProvider: vi.fn((options: SceneOptions) => {
      providers.push({ options });
      return {
        request: (reason?: string) => calls.push(`request:${reason}`),
        reset: () => calls.push('reset'),
        dispose: () => calls.push('dispose'),
        failures: 0,
      };
    }),
  };
});
vi.mock('../scene-store', () => ({
  publishScene: vi.fn(() => Promise.resolve()),
  clearScene: vi.fn(() => calls.push('clearScene')),
  currentScene: () => null,
  onSceneChange: () => () => {},
}));

import { createSceneProvider } from '../scene';
import { clearScene, publishScene } from '../scene-store';
import { acquireSceneFeed } from '../scene-feed';

// ── A tiny fake document and window ──────────────────────────────────────────

type Listener = (e?: unknown) => void;

class FakeTarget {
  listeners = new Map<string, Set<Listener>>();
  added: string[] = [];
  addEventListener(type: string, fn: Listener) {
    this.added.push(type);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }
  dispatch(type: string) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }
  count(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

interface ObserverRec {
  cb: () => void;
  target: unknown;
  options: MutationObserverInit | undefined;
  connected: boolean;
}

function fakeEnv() {
  const observers: ObserverRec[] = [];
  const media: Record<string, boolean> = { print: false };
  const win = Object.assign(new FakeTarget(), {
    matchMedia: (q: string) => ({ matches: media[q] ?? false, media: q }),
    MutationObserver: class {
      rec: ObserverRec;
      constructor(cb: () => void) {
        this.rec = { cb, target: null, options: undefined, connected: false };
        observers.push(this.rec);
      }
      observe(target: unknown, options?: MutationObserverInit) {
        this.rec.target = target;
        this.rec.options = options;
        this.rec.connected = true;
      }
      disconnect() {
        this.rec.connected = false;
      }
    },
  });
  const root = { matches: (_sel: string) => false, getAttribute: () => null };
  const present = new Set<string>();
  const doc = Object.assign(new FakeTarget(), {
    hidden: false,
    documentElement: root,
    defaultView: win,
    querySelector: (sel: string) => (present.has(sel) ? {} : null),
  });
  return { doc, win, root, media, present, observers };
}

let env: ReturnType<typeof fakeEnv>;
const asDoc = () => env.doc as unknown as Document;
const options = () => providers[0]!.options;

beforeEach(() => {
  calls.length = 0;
  providers.length = 0;
  vi.mocked(createSceneProvider).mockClear();
  vi.mocked(publishScene).mockClear();
  vi.mocked(clearScene).mockClear();
  env = fakeEnv();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('acquireSceneFeed', () => {
  it('requests an activation picture once and shares one provider between acquirers', () => {
    const a = acquireSceneFeed(asDoc());
    const b = acquireSceneFeed(asDoc());
    expect(createSceneProvider).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c === 'request:activate')).toHaveLength(1);
    a.release();
    b.release();
  });

  it('disposes the provider and clears the scene only after the last release', () => {
    const a = acquireSceneFeed(asDoc());
    const b = acquireSceneFeed(asDoc());
    a.release();
    expect(calls).not.toContain('dispose');
    expect(clearScene).not.toHaveBeenCalled();
    // Releasing the same handle twice must not release the other acquirer's share.
    a.release();
    expect(calls).not.toContain('dispose');
    b.release();
    expect(calls).toContain('dispose');
    expect(clearScene).toHaveBeenCalledTimes(1);
    expect(env.win.count('resize')).toBe(0);
    expect(env.doc.count('visibilitychange')).toBe(0);
    expect(env.observers.every((o) => !o.connected)).toBe(true);
    // A fresh acquire after the last release builds a new provider.
    const c = acquireSceneFeed(asDoc());
    expect(createSceneProvider).toHaveBeenCalledTimes(2);
    c.release();
  });

  it('publishes each shot to the scene store, then closes the bitmap', async () => {
    const feed = acquireSceneFeed(asDoc());
    const order: string[] = [];
    vi.mocked(publishScene).mockImplementationOnce(() => {
      order.push('publish');
      return Promise.resolve();
    });
    const bitmap = { close: vi.fn(() => order.push('close')) } as unknown as ImageBitmap;
    const shot: SceneShot = { bitmap, width: 800, height: 600, scrollX: 3, scrollY: 40, at: 1 };
    options().onShot(shot);
    await Promise.resolve();
    await Promise.resolve();
    expect(publishScene).toHaveBeenCalledWith(bitmap, {
      width: 800,
      height: 600,
      scrollX: 3,
      scrollY: 40,
    });
    expect(order).toEqual(['publish', 'close']);
    feed.release();
  });

  it("request('route') forgets failures before asking for the new page", () => {
    const feed = acquireSceneFeed(asDoc());
    calls.length = 0;
    feed.request('route');
    expect(calls).toEqual(['reset', 'request:route']);
    feed.release();
  });

  it('never listens to scroll; wakes on resize and on the tab becoming visible', () => {
    const feed = acquireSceneFeed(asDoc());
    calls.length = 0;
    env.win.dispatch('resize');
    expect(calls).toEqual(['request:resize']);
    calls.length = 0;
    env.doc.hidden = true;
    env.doc.dispatch('visibilitychange');
    expect(calls).toEqual([]);
    env.doc.hidden = false;
    env.doc.dispatch('visibilitychange');
    expect(calls).toEqual(['request:visible']);
    expect(env.win.added).not.toContain('scroll');
    expect(env.doc.added).not.toContain('scroll');
    feed.release();
  });

  it('a theme attribute change on <html> requests a theme picture', () => {
    const feed = acquireSceneFeed(asDoc());
    const theme = env.observers.find((o) => o.target === env.root);
    expect(theme).toBeDefined();
    expect(theme!.options?.attributes).toBe(true);
    expect([...(theme!.options?.attributeFilter ?? [])].sort()).toEqual(
      ['class', 'data-theme', 'style'].sort(),
    );
    calls.length = 0;
    theme!.cb();
    expect(calls).toEqual(['request:theme']);
    feed.release();
  });

  it('refuses to capture while hidden, while the hub is open, or while printing', () => {
    const feed = acquireSceneFeed(asDoc());
    const can = options().canCapture;
    expect(can()).toBe(true);
    env.doc.hidden = true;
    expect(can()).toBe(false);
    env.doc.hidden = false;
    env.present.add('.radial-hub:not([data-phase="closed"])');
    expect(can()).toBe(false);
    env.present.clear();
    env.media.print = true;
    expect(can()).toBe(false);
    env.media.print = false;
    expect(can()).toBe(true);
    feed.release();
  });
});
