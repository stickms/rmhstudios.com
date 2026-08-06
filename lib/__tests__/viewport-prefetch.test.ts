/**
 * OPT-33 — viewport prefetch guards (lib/viewport-prefetch.ts).
 *
 * These cover the parts that are *silently* wrong when broken: a guard that
 * stops firing costs bandwidth on exactly the metered connections the feature
 * is supposed to protect, and nothing in the UI shows it. Vitest runs in the
 * `node` environment here, so every browser API is stubbed explicitly — which
 * doubles as the check that the module never assumes one exists.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  prefersLessData,
  prefetchTarget,
  shouldSpeculate,
  startViewportPrefetch,
  type PrefetchRouter,
} from '@/lib/viewport-prefetch';

type Connection = { saveData?: boolean; effectiveType?: string };

function stubConnection(connection: Connection | undefined) {
  vi.stubGlobal('navigator', connection ? { connection } : {});
}

function stubReducedData(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-data'),
  }));
}

// ── A minimal DOM good enough to drive the observer loop ───────────────────

class FakeElement {
  constructor(private readonly attrs: Record<string, string>) {}
  hasAttribute(name: string) {
    return name in this.attrs;
  }
  getAttribute(name: string) {
    return this.attrs[name] ?? null;
  }
}

function anchor(attrs: Record<string, string>) {
  return new FakeElement(attrs) as unknown as Element;
}

type ObserverCallback = (entries: { target: Element; isIntersecting: boolean }[]) => void;

/**
 * Installs a fake `document`/`window`/`IntersectionObserver` and returns the
 * handle used to drive intersections. `readyState: 'complete'` so the module's
 * post-`load` gate passes without simulating the event.
 */
function stubDom(anchors: Element[]) {
  let callback: ObserverCallback = () => {};
  const observed: Element[] = [];
  const unobserved: Element[] = [];

  class FakeIntersectionObserver {
    constructor(cb: ObserverCallback) {
      callback = cb;
    }
    observe(el: Element) {
      observed.push(el);
    }
    unobserve(el: Element) {
      unobserved.push(el);
    }
    disconnect() {}
  }

  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal('document', {
    readyState: 'complete',
    querySelectorAll: () => anchors,
  });
  vi.stubGlobal('window', {
    location: { pathname: '/' },
    addEventListener: () => {},
    removeEventListener: () => {},
  });

  return {
    observed,
    unobserved,
    /** Report every observed anchor as on screen. */
    enter: (els: Element[] = anchors) =>
      callback(els.map((target) => ({ target, isIntersecting: true }))),
    leave: (els: Element[]) => callback(els.map((target) => ({ target, isIntersecting: false }))),
  };
}

function stubRouter() {
  const preloaded: string[] = [];
  let onResolved: (() => void) | null = null;
  const router = {
    preloadRoute: (opts: { to: string }) => {
      preloaded.push(opts.to);
      return Promise.resolve(undefined);
    },
    subscribe: (event: string, listener: () => void) => {
      if (event === 'onResolved') onResolved = listener;
      return () => {
        onResolved = null;
      };
    },
  } as unknown as PrefetchRouter;
  return { router, preloaded, navigate: () => onResolved?.() };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('shouldSpeculate', () => {
  it('refuses when Save-Data is on — the user explicitly asked for less data', () => {
    stubConnection({ saveData: true, effectiveType: '4g' });
    expect(shouldSpeculate()).toBe(false);
    expect(prefersLessData()).toBe(true);
  });

  it('allows a 4g connection with Save-Data off', () => {
    stubConnection({ saveData: false, effectiveType: '4g' });
    expect(shouldSpeculate()).toBe(true);
    expect(prefersLessData()).toBe(false);
  });

  it.each(['slow-2g', '2g', '3g'])('refuses on a %s connection', (effectiveType) => {
    stubConnection({ effectiveType });
    expect(shouldSpeculate()).toBe(false);
  });

  it('assumes yes when navigator.connection is missing (Safari/Firefox)', () => {
    stubConnection(undefined);
    expect(shouldSpeculate()).toBe(true);
  });

  it('assumes yes when connection exists but reports no effectiveType', () => {
    stubConnection({ saveData: false });
    expect(shouldSpeculate()).toBe(true);
  });

  it('refuses on prefers-reduced-data even without a connection API', () => {
    stubConnection(undefined);
    stubReducedData(true);
    expect(shouldSpeculate()).toBe(false);
    expect(prefersLessData()).toBe(true);
  });

  it('ignores a matchMedia that does not know the feature', () => {
    stubConnection({ effectiveType: '4g' });
    stubReducedData(false);
    expect(shouldSpeculate()).toBe(true);
  });

  it('survives a matchMedia that throws', () => {
    stubConnection({ effectiveType: '4g' });
    vi.stubGlobal('matchMedia', () => {
      throw new Error('unsupported');
    });
    expect(shouldSpeculate()).toBe(true);
  });
});

describe('prefetchTarget', () => {
  it('accepts a plain in-app path', () => {
    expect(prefetchTarget(anchor({ href: '/blog/hello' }), '/')).toBe('/blog/hello');
  });

  it('strips a hash but keeps the path', () => {
    expect(prefetchTarget(anchor({ href: '/blog/hello#notes' }), '/')).toBe('/blog/hello');
  });

  it.each([
    ['an external URL', 'https://example.com/x'],
    ['a protocol-relative URL', '//example.com/x'],
    ['an API endpoint', '/api/feed'],
    ['the login route', '/login'],
    ['the checkout route', '/checkout/pro'],
    ['an admin route', '/admin/blog'],
    ['a query string', '/explore?tab=games'],
    ['a static file', '/sitemap.xml'],
  ])('rejects %s', (_label, href) => {
    expect(prefetchTarget(anchor({ href }), '/')).toBeNull();
  });

  it('rejects the page we are already on', () => {
    expect(prefetchTarget(anchor({ href: '/wallet' }), '/wallet')).toBeNull();
  });

  it.each([
    ['target=_blank', { href: '/x', target: '_blank' }],
    ['download', { href: '/x', download: '' }],
    ['rel=nofollow', { href: '/x', rel: 'noopener nofollow' }],
    ['data-no-prefetch', { href: '/x', 'data-no-prefetch': '' }],
  ])('rejects a link marked %s', (_label, attrs) => {
    expect(prefetchTarget(anchor(attrs), '/')).toBeNull();
  });
});

describe('startViewportPrefetch', () => {
  it('does nothing at all when Save-Data is on', () => {
    vi.useFakeTimers();
    stubConnection({ saveData: true });
    const dom = stubDom([anchor({ href: '/a' })]);
    const { router, preloaded } = stubRouter();

    startViewportPrefetch(router, { dwellMs: 10 });
    dom.enter();
    vi.advanceTimersByTime(100);

    expect(dom.observed).toHaveLength(0);
    expect(preloaded).toEqual([]);
  });

  it('does nothing on a slow connection', () => {
    vi.useFakeTimers();
    stubConnection({ effectiveType: '2g' });
    const dom = stubDom([anchor({ href: '/a' })]);
    const { router, preloaded } = stubRouter();

    startViewportPrefetch(router, { dwellMs: 10 });
    dom.enter();
    vi.advanceTimersByTime(100);

    expect(preloaded).toEqual([]);
  });

  it('requires the link to dwell on screen before prefetching', () => {
    vi.useFakeTimers();
    stubConnection(undefined);
    const link = anchor({ href: '/a' });
    const dom = stubDom([link]);
    const { router, preloaded } = stubRouter();

    startViewportPrefetch(router, { dwellMs: 200 });
    dom.enter();
    vi.advanceTimersByTime(199);
    expect(preloaded).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(preloaded).toEqual(['/a']);
  });

  it('cancels the prefetch when a fast scroll takes the link off screen', () => {
    vi.useFakeTimers();
    stubConnection(undefined);
    const link = anchor({ href: '/a' });
    const dom = stubDom([link]);
    const { router, preloaded } = stubRouter();

    startViewportPrefetch(router, { dwellMs: 200 });
    dom.enter();
    vi.advanceTimersByTime(150);
    dom.leave([link]);
    vi.advanceTimersByTime(500);

    expect(preloaded).toEqual([]);
  });

  it('enforces the hard cap even when the whole feed is on screen', () => {
    vi.useFakeTimers();
    stubConnection(undefined);
    const links = Array.from({ length: 30 }, (_, i) => anchor({ href: `/post/${i}` }));
    const dom = stubDom(links);
    const { router, preloaded } = stubRouter();

    startViewportPrefetch(router, { dwellMs: 10, max: 4 });
    dom.enter();
    vi.advanceTimersByTime(50);

    expect(preloaded).toEqual(['/post/0', '/post/1', '/post/2', '/post/3']);
  });

  it('bounds how many anchors it observes', () => {
    vi.useFakeTimers();
    stubConnection(undefined);
    const links = Array.from({ length: 500 }, (_, i) => anchor({ href: `/post/${i}` }));
    const dom = stubDom(links);
    const { router } = stubRouter();

    startViewportPrefetch(router, { scanLimit: 12 });

    expect(dom.observed).toHaveLength(12);
  });

  it('prefetches each href once, however many links point at it', () => {
    vi.useFakeTimers();
    stubConnection(undefined);
    const links = [
      anchor({ href: '/profile/rmh' }),
      anchor({ href: '/profile/rmh' }),
      anchor({ href: '/profile/rmh#posts' }),
      anchor({ href: '/games' }),
    ];
    const dom = stubDom(links);
    const { router, preloaded } = stubRouter();

    startViewportPrefetch(router, { dwellMs: 10 });
    dom.enter();
    vi.advanceTimersByTime(50);
    // A second intersection of the same links (scrolled away and back).
    dom.enter();
    vi.advanceTimersByTime(50);

    expect(preloaded).toEqual(['/profile/rmh', '/games']);
  });

  it('skips links it is not allowed to prefetch without spending budget', () => {
    vi.useFakeTimers();
    stubConnection(undefined);
    const links = [
      anchor({ href: '/api/feed' }),
      anchor({ href: 'https://example.com' }),
      anchor({ href: '/login' }),
      anchor({ href: '/a' }),
      anchor({ href: '/b' }),
    ];
    const dom = stubDom(links);
    const { router, preloaded } = stubRouter();

    startViewportPrefetch(router, { dwellMs: 10, max: 2 });
    dom.enter();
    vi.advanceTimersByTime(50);

    expect(preloaded).toEqual(['/a', '/b']);
  });

  it('waits for load before observing anything', () => {
    vi.useFakeTimers();
    stubConnection(undefined);
    const dom = stubDom([anchor({ href: '/a' })]);
    let onLoad: (() => void) | null = null;
    vi.stubGlobal('document', {
      readyState: 'loading',
      querySelectorAll: () => [anchor({ href: '/a' })],
    });
    vi.stubGlobal('window', {
      location: { pathname: '/' },
      addEventListener: (event: string, handler: () => void) => {
        if (event === 'load') onLoad = handler;
      },
      removeEventListener: () => {},
    });
    const { router } = stubRouter();

    startViewportPrefetch(router, { dwellMs: 10 });
    expect(dom.observed).toHaveLength(0);
    expect(onLoad).toBeTypeOf('function');

    onLoad!();
    expect(dom.observed).toHaveLength(1);
  });

  it('re-arms with a fresh budget after a navigation, but keeps the dedupe', () => {
    vi.useFakeTimers();
    stubConnection(undefined);
    const links = [anchor({ href: '/a' }), anchor({ href: '/b' }), anchor({ href: '/c' })];
    const dom = stubDom(links);
    const { router, preloaded, navigate } = stubRouter();

    startViewportPrefetch(router, { dwellMs: 10, max: 2 });
    dom.enter();
    vi.advanceTimersByTime(50);
    expect(preloaded).toEqual(['/a', '/b']);

    // Second page view: budget resets, so /c is now reachable — but /a and /b
    // stay deduped for the page's lifetime (they are in the nav on every page).
    navigate();
    vi.advanceTimersByTime(200);
    dom.enter();
    vi.advanceTimersByTime(50);

    expect(preloaded).toEqual(['/a', '/b', '/c']);
  });

  it('does not re-scan before the incoming page has rendered', () => {
    vi.useFakeTimers();
    stubConnection(undefined);
    const dom = stubDom([anchor({ href: '/a' })]);
    const { router, navigate } = stubRouter();

    startViewportPrefetch(router, { dwellMs: 10 });
    expect(dom.observed).toHaveLength(1);

    navigate();
    expect(dom.observed).toHaveLength(1); // still the first arm — no sync re-scan
    vi.advanceTimersByTime(200);
    expect(dom.observed).toHaveLength(2);
  });

  it('stops cleanly and never fires after stop()', () => {
    vi.useFakeTimers();
    stubConnection(undefined);
    const dom = stubDom([anchor({ href: '/a' })]);
    const { router, preloaded } = stubRouter();

    const stop = startViewportPrefetch(router, { dwellMs: 50 });
    dom.enter();
    stop();
    vi.advanceTimersByTime(500);

    expect(preloaded).toEqual([]);
  });

  it('swallows a router that throws rather than breaking the page', () => {
    vi.useFakeTimers();
    stubConnection(undefined);
    const dom = stubDom([anchor({ href: '/a' }), anchor({ href: '/b' })]);
    const router = {
      preloadRoute: () => {
        throw new Error('no such route');
      },
    } as unknown as PrefetchRouter;

    expect(() => {
      startViewportPrefetch(router, { dwellMs: 10 });
      dom.enter();
      vi.advanceTimersByTime(50);
    }).not.toThrow();
  });
});
