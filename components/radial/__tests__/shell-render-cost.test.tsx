/**
 * B7 step 3 — the radial shell must not re-render on router churn it does not
 * read. There is no DOM renderer in this node suite, so the evidence is two
 * layers:
 *
 *  1. A REAL router (memory history) is driven through a navigation sequence and
 *     each subscription strategy is counted the way `useSyncExternalStore`
 *     counts it: a component re-renders when its selected value changes under
 *     `Object.is`. The old `useLocation()` selects the whole `location` object
 *     (new on every navigation); the shell's selectors select a string.
 *  2. The shell's chrome is `React.memo`, so a parent re-render with equal props
 *     (the shell re-renders on each page commit) skips it.
 */
import { describe, expect, it } from 'vitest';
import { memo } from 'react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import {
  selectPathname,
  selectRenderedHref,
  selectRenderedPathname,
  type ShellRouterState,
} from '../shell-router-state';
import { RadialHub } from '../RadialHub';
import { RadialNavRail } from '../RadialNavRail';
import { RadialGlobeDock } from '../RadialGlobeDock';
import { RadialLiveRail } from '../RadialLiveRail';
import { LiquidGlobe } from '../LiquidGlobe';

const MEMO = Symbol.for('react.memo');
const isMemo = (c: unknown) => (c as { $$typeof?: symbol }).$$typeof === MEMO;

function makeRouter() {
  const root = createRootRoute();
  const feed = createRoute({
    getParentRoute: () => root,
    path: '/',
    validateSearch: (s: Record<string, unknown>) => ({ tab: typeof s.tab === 'string' ? s.tab : 'a' }),
  });
  const games = createRoute({ getParentRoute: () => root, path: '/games' });
  return createRouter({
    routeTree: root.addChildren([feed, games]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
}

/**
 * Re-renders a `useSyncExternalStore` subscriber selecting `select` would incur
 * across 3 search-only navigations on the same page and then one page change.
 */
async function reRenders(select: (s: ShellRouterState) => unknown) {
  const router = makeRouter();
  await router.load();
  const read = () => select(router.state as unknown as ShellRouterState);
  let last = read();
  let renders = 0;
  // After each commit, a `useSyncExternalStore` subscriber re-renders iff its selection changed.
  const go = async (url: string) => {
    router.history.push(url);
    await router.load();
    const next = read();
    if (!Object.is(next, last)) {
      last = next;
      renders++;
    }
  };
  for (const tab of ['b', 'c', 'd']) await go(`/?tab=${tab}`);
  const afterSearchOnly = renders;
  await go('/games');
  return { afterSearchOnly, total: renders };
}

describe('shell router subscriptions', () => {
  it('pathname selectors ignore search-only navigation', async () => {
    const before = await reRenders((s) => s.location); // what `useLocation()` subscribed to
    const pathname = await reRenders(selectPathname);
    const rendered = await reRenders(selectRenderedPathname);

    // Before: every navigation re-rendered each subscriber.
    expect(before.afterSearchOnly).toBeGreaterThanOrEqual(3);
    // After: search-only navigation costs nothing; the real page change costs one.
    expect(pathname).toEqual({ afterSearchOnly: 0, total: 1 });
    expect(rendered.afterSearchOnly).toBe(0);
    // Over 3 search-only navigations + 1 page change: useLocation re-rendered 4x, the pathname selector 1x.
    expect(before.total).toBe(4);
  });

  it('selectors read the committed page while a navigation is pending', () => {
    const state: ShellRouterState = {
      location: { pathname: '/games', href: '/games' },
      resolvedLocation: { pathname: '/', href: '/' },
    };
    expect(selectPathname(state)).toBe('/games');
    expect(selectRenderedPathname(state)).toBe('/');
    expect(selectRenderedHref(state)).toBe('/');
    expect(selectRenderedPathname({ location: state.location })).toBe('/games');
  });

  it('is referentially stable for unrelated state', () => {
    const a: ShellRouterState = { location: { pathname: '/x', href: '/x?a=1' } };
    const b: ShellRouterState = { location: { pathname: '/x', href: '/x?a=2' } };
    expect(Object.is(selectPathname(a), selectPathname(b))).toBe(true);
    expect(Object.is(selectRenderedPathname(a), selectRenderedPathname(b))).toBe(true);
  });
});

describe('shell chrome is memoised', () => {
  it.each([
    ['RadialHub', RadialHub],
    ['RadialNavRail', RadialNavRail],
    ['RadialGlobeDock', RadialGlobeDock],
    ['RadialLiveRail', RadialLiveRail],
    ['LiquidGlobe', LiquidGlobe],
  ])('%s is React.memo', (_name, component) => {
    expect(isMemo(component)).toBe(true);
  });

  it('the matcher recognises a real memo wrapper', () => {
    expect(isMemo(memo(() => null))).toBe(true);
  });
});
