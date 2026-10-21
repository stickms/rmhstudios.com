// @vitest-environment node
/**
 * Every page transition runs the Globe Eversion (amended 2026-10-21): the interceptor's decision and its replay.
 * The browser e2e drives it end to end; this pins the rules — what is a page transition, how a held navigation is
 * replayed, that a back/forward waits for the history's own revert before the run starts, and that a visitor who
 * cannot have the effect is never held back at all.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  anchorToIntercept,
  carriesNavigation,
  inShell,
  installNavigationEversion,
  isPageRoute,
  isPageTransition,
  traversalDelta,
  type HeldNavigation,
  type NavAction,
  type NavLocation,
  type NavRouter,
} from '../eversion-nav';
import { popupCentre, popupRadius } from '../popup';

// The interceptor listens on `document` and `window`; the suite runs without a DOM (the repo's tests are node-only),
// so both are bare event targets here, which is all it touches.
const g = globalThis as unknown as Record<string, unknown>;
g.window ??= new EventTarget();
g.document ??= Object.assign(new EventTarget(), { activeElement: null, body: {} });
g.location ??= { origin: 'https://rmh.test', pathname: '/' };

/** A pointer event as the interceptor reads one. */
const pointerDown = (x: number, y: number) =>
  Object.assign(new Event('pointerdown'), { clientX: x, clientY: y });

/** A fake anchor: what `anchorToIntercept` reads off the click's target. */
function anchor(href: string, attrs: Record<string, string> = {}) {
  const a = {
    href: new URL(href, 'https://rmh.test').href,
    hasAttribute: (n: string) => n in attrs,
    getAttribute: (n: string) => attrs[n] ?? null,
    closest: () => a,
  };
  return a;
}
const clickOn = (a: ReturnType<typeof anchor>, init: Partial<MouseEvent> = {}) =>
  ({
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: a,
    ...init,
  }) as unknown as MouseEvent;

const at = (pathname: string, index = 0, search = ''): NavLocation => ({
  href: pathname + search,
  pathname,
  state: { __TSR_index: index },
});

describe('what counts as a page transition', () => {
  it.each<[string, string, NavAction, boolean]>([
    ['/', '/games', 'PUSH', true],
    ['/games', '/', 'BACK', true],
    ['/', '/games', 'FORWARD', true],
    ['/', '/games', 'GO', true],
    ['/', '/games', 'REPLACE', false],
    ['/games', '/games/', 'PUSH', false],
    ['/games', '/games', 'PUSH', false],
  ])('%s → %s (%s): %s', (from, to, action, expected) => {
    expect(isPageTransition(at(from), at(to), action)).toBe(expected);
  });

  it('a search-only change on the same page is not one', () => {
    expect(isPageTransition(at('/explore'), at('/explore', 1, '?tab=people'), 'PUSH')).toBe(false);
  });

  it('measures a traversal by the entries’ stack index', () => {
    expect(traversalDelta(at('/a', 4), at('/b', 3))).toBe(-1);
    expect(traversalDelta(at('/a', 1), at('/b', 3))).toBe(2);
    expect(traversalDelta(at('/a', 1), at('/b', 1))).toBeNull();
    expect(traversalDelta({ href: '/a', pathname: '/a' }, at('/b', 1))).toBeNull();
  });
});

describe('the pop-up globe’s geometry', () => {
  it('is fingertip-sized at least and never larger than the hub’s', () => {
    expect(popupRadius(320, 568)).toBe(48);
    expect(popupRadius(390, 844)).toBe(55);
    expect(popupRadius(2560, 1440)).toBe(112);
  });

  it('sits on the press, pulled in just enough to be whole on screen', () => {
    expect(popupCentre({ x: 400, y: 300 }, 800, 600, 50)).toEqual([400, 300]);
    expect(popupCentre({ x: 5, y: 590 }, 800, 600, 50)).toEqual([62, 538]);
    expect(popupCentre(null, 800, 600, 50)).toEqual([400, 300]);
  });
});

function routerRig() {
  type Blocker = Parameters<NavRouter['history']['block']>[0];
  let blocker: Blocker | null = null;
  const calls: string[] = [];
  const router: NavRouter = {
    history: {
      block(b) {
        blocker = b;
        return () => {
          blocker = null;
        };
      },
      push: (href, _state, opts) => void calls.push(`push:${href}:${opts?.ignoreBlocker}`),
      go: (delta, opts) => void calls.push(`go:${delta}:${opts?.ignoreBlocker}`),
    },
    navigate: ({ href }) => void calls.push(`navigate:${href}`),
    getMatchedRoutes: (pathname: string) =>
      pathname.startsWith('/api')
        ? [[{ id: '__root__' }, { id: '/api/x' }], {}, { id: '/api/x' }]
        : pathname === '/play'
          ? [[{ id: '__root__' }, { id: '/play', options: { component: {} } }], {}, { id: '/play' }]
          : [
              [
                { id: '__root__' },
                { id: '/_site' },
                { id: '/_site' + pathname, options: { component: {} } },
              ],
              {},
              { id: '/_site' + pathname },
            ],
    state: { location: { pathname: '/' } },
  };
  const block = (current: NavLocation, next: NavLocation, action: NavAction) =>
    blocker!.blockerFn({ currentLocation: current, nextLocation: next, action });
  return { router, calls, block, blocked: () => blocker !== null };
}

describe('the interceptor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds a push back and replays it, as asked, past the blocker', async () => {
    const r = routerRig();
    const held: HeldNavigation[] = [];
    const off = installNavigationEversion({
      router: r.router,
      enabled: () => true,
      busy: () => false,
      evert: (h) => held.push(h),
    });
    expect(await r.block(at('/', 0), at('/games', 1), 'PUSH')).toBe(true);
    await Promise.resolve();
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ href: '/games', pathname: '/games', traverses: false });
    held[0]!.go();
    expect(r.calls).toEqual(['push:/games:true']);
    off();
    expect(r.blocked()).toBe(false);
  });

  it('remembers where the press was', async () => {
    const r = routerRig();
    const held: HeldNavigation[] = [];
    const off = installNavigationEversion({
      router: r.router,
      enabled: () => true,
      busy: () => false,
      evert: (h) => held.push(h),
    });
    document.dispatchEvent(pointerDown(120, 340));
    await r.block(at('/'), at('/games', 1), 'PUSH');
    await Promise.resolve();
    expect(held[0]!.origin).toEqual({ x: 120, y: 340 });
    off();
  });

  it('a back/forward starts only after the history has reverted it, and replays the same traversal', async () => {
    const r = routerRig();
    const held: HeldNavigation[] = [];
    const off = installNavigationEversion({
      router: r.router,
      enabled: () => true,
      busy: () => false,
      evert: (h) => held.push(h),
    });
    expect(await r.block(at('/games', 3), at('/', 2), 'BACK')).toBe(true);
    vi.advanceTimersByTime(50);
    expect(held).toHaveLength(0);
    window.dispatchEvent(new Event('popstate'));
    vi.advanceTimersByTime(1);
    expect(held).toHaveLength(1);
    expect(held[0]!.traverses).toBe(true);
    held[0]!.go();
    expect(r.calls).toEqual(['go:-1:true']);
    off();
  });

  it.each([
    ['the visitor cannot have the effect', { enabled: false, busy: false }],
    ['a run is already on screen', { enabled: true, busy: true }],
  ])('lets everything through when %s', async (_label, s) => {
    const r = routerRig();
    const evert = vi.fn();
    const off = installNavigationEversion({
      router: r.router,
      enabled: () => s.enabled,
      busy: () => s.busy,
      evert,
    });
    expect(await r.block(at('/'), at('/games', 1), 'PUSH')).toBe(false);
    expect(await r.block(at('/games', 1), at('/', 0), 'BACK')).toBe(false);
    vi.runAllTimers();
    expect(evert).not.toHaveBeenCalled();
    off();
  });

  it('never holds a replace (redirects, URL-synced state)', async () => {
    const r = routerRig();
    const evert = vi.fn();
    const off = installNavigationEversion({
      router: r.router,
      enabled: () => true,
      busy: () => false,
      evert,
    });
    expect(await r.block(at('/'), at('/login'), 'REPLACE')).toBe(false);
    off();
  });

  it('takes a plain anchor click to one of the site’s pages, and leaves the rest alone', () => {
    const origin = 'https://rmh.test';
    expect(anchorToIntercept(clickOn(anchor('/games')), origin)).not.toBeNull();
    expect(anchorToIntercept(clickOn(anchor('https://elsewhere.example/x')), origin)).toBeNull();
    expect(anchorToIntercept(clickOn(anchor('/games'), { metaKey: true }), origin)).toBeNull();
    expect(anchorToIntercept(clickOn(anchor('/games'), { button: 1 }), origin)).toBeNull();
    expect(
      anchorToIntercept(clickOn(anchor('/games'), { defaultPrevented: true }), origin),
    ).toBeNull();
    expect(anchorToIntercept(clickOn(anchor('/games', { target: '_blank' })), origin)).toBeNull();
    expect(anchorToIntercept(clickOn(anchor('/file.zip', { download: '' })), origin)).toBeNull();
    expect(
      anchorToIntercept(clickOn(anchor('/games', { 'data-no-evert': '' })), origin),
    ).toBeNull();
    const { router } = routerRig();
    expect(isPageRoute(router, '/games')).toBe(true);
    expect(isPageRoute(router, '/api/thing')).toBe(false);
  });
});

/** A click as the window listener sees one (Event's own `defaultPrevented` is read-only, so redefine it). */
function clickEvent(a: ReturnType<typeof anchor>, preventDefault: () => void): Event {
  const ev = new Event('click');
  for (const [k, v] of Object.entries({ ...clickOn(a), preventDefault })) {
    Object.defineProperty(ev, k, { value: v, configurable: true });
  }
  return ev;
}

describe('the eversion level (amended 2026-10-21)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const rig = (level: () => 'all' | 'globe', hubOpen = () => false) => {
    const r = routerRig();
    const evert = vi.fn();
    const off = installNavigationEversion({
      router: r.router,
      enabled: () => true,
      busy: () => false,
      evert,
      level,
      hubOpen,
    });
    return { r, evert, off };
  };

  it('decides: all carries everything, globe only with the hub open', () => {
    expect(carriesNavigation('all', false)).toBe(true);
    expect(carriesNavigation('all', true)).toBe(true);
    expect(carriesNavigation('globe', false)).toBe(false);
    expect(carriesNavigation('globe', true)).toBe(true);
  });

  it('globe: never holds a push, a back or a forward off the hub, and starts nothing', async () => {
    const { r, evert, off } = rig(() => 'globe');
    expect(await r.block(at('/'), at('/games', 1), 'PUSH')).toBe(false);
    expect(await r.block(at('/games', 1), at('/', 0), 'BACK')).toBe(false);
    expect(await r.block(at('/', 0), at('/games', 1), 'FORWARD')).toBe(false);
    expect(await r.block(at('/', 0), at('/games', 1), 'GO')).toBe(false);
    await Promise.resolve();
    vi.runAllTimers();
    expect(evert).not.toHaveBeenCalled();
    expect(r.calls).toEqual([]);
    off();
  });

  it('globe: a plain anchor click is left to the browser, not rerouted', () => {
    const { r, off } = rig(() => 'globe');
    const preventDefault = vi.fn();
    window.dispatchEvent(clickEvent(anchor('/games'), preventDefault));
    expect(preventDefault).not.toHaveBeenCalled();
    expect(r.calls).toEqual([]);
    off();
  });

  it('all: unchanged, holds the push and reroutes the anchor', async () => {
    const { r, evert, off } = rig(() => 'all');
    expect(await r.block(at('/'), at('/games', 1), 'PUSH')).toBe(true);
    await Promise.resolve();
    expect(evert).toHaveBeenCalledTimes(1);
    const preventDefault = vi.fn();
    window.dispatchEvent(clickEvent(anchor('/games'), preventDefault));
    expect(preventDefault).toHaveBeenCalled();
    expect(r.calls).toEqual(['navigate:/games']);
    off();
  });

  it('globe with the hub open: the hub’s globe still carries a navigation', async () => {
    const { r, evert, off } = rig(
      () => 'globe',
      () => true,
    );
    expect(await r.block(at('/'), at('/games', 1), 'PUSH')).toBe(true);
    await Promise.resolve();
    expect(evert).toHaveBeenCalledTimes(1);
    off();
  });

  it('switching the level applies to the very next navigation, with no reinstall', async () => {
    let level: 'all' | 'globe' = 'all';
    const { r, evert, off } = rig(() => level);
    expect(await r.block(at('/'), at('/games', 1), 'PUSH')).toBe(true);
    await Promise.resolve();
    expect(evert).toHaveBeenCalledTimes(1);
    level = 'globe';
    expect(await r.block(at('/'), at('/games', 1), 'PUSH')).toBe(false);
    await Promise.resolve();
    expect(evert).toHaveBeenCalledTimes(1);
    level = 'all';
    expect(await r.block(at('/'), at('/games', 1), 'PUSH')).toBe(true);
    off();
  });

  it('with no level given, behaves as all (existing callers)', async () => {
    const r = routerRig();
    const off = installNavigationEversion({
      router: r.router,
      enabled: () => true,
      busy: () => false,
      evert: vi.fn(),
    });
    expect(await r.block(at('/'), at('/games', 1), 'PUSH')).toBe(true);
    off();
  });

  it('the root reads the level from the store at navigation time', () => {
    const src = readFileSync(
      join(process.cwd(), 'components/radial/eversion/EversionRoot.tsx'),
      'utf8',
    );
    expect(src).toMatch(/level: \(\) => useThemeStore\.getState\(\)\.eversionLevel/);
  });
});

describe('which layer a run draws in', () => {
  it('knows the shell’s routes from the full-screen ones', () => {
    const { router } = routerRig();
    expect(inShell(router, '/games')).toBe(true);
    expect(inShell(router, '/play')).toBe(false);
  });
});

describe('the effect plays by default (owner, 2026-10-21)', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('eligibility reads the site’s Reduce motion switch, never the OS preference', () => {
    const src = read('components/radial/eversion/useBeforeCapture.ts').replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      '',
    );
    expect(src).toMatch(/reducedMotion: siteReducedMotion\(\)/);
    expect(src).not.toMatch(/prefersReducedMotion|prefers-reduced-motion/);
    expect(read('components/radial/RadialHub.tsx')).not.toMatch(/useReducedMotion/);
    expect(read('components/settings/AppearancePanel.tsx')).not.toMatch(/useReducedMotion/);
  });

  it('every run takes the generous waits that used to be "Always evert globe"’s', () => {
    expect(read('components/radial/eversion/useEversionController.ts')).toMatch(
      /const alwaysEvert = \(\): boolean => true;/,
    );
  });
});
