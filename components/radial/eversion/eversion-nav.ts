/**
 * Every page transition runs the Globe Eversion (amended 2026-10-21).
 *
 * The owner: "not a single page transition should be without eversion". The hub's globe was the only way in; a
 * link, a card, a nav-rail item, a button that navigates or the browser's back button changed the page without it.
 * This is the one place every one of those passes through:
 *
 * - **The router's history blocker.** Every `<Link>`, every `navigate()`, every back/forward goes through
 *   `router.history`, and a blocker sees each one before the router does. A navigation the effect should carry
 *   is held back there and handed to the effect, which REPLAYS it exactly as it was asked for once the frozen page
 *   is up (`NavigationReplay.go`: the same push with its history state, or the same traversal), past the blocker.
 *   So nothing about the navigation changes (history stack, state, scroll restoration), only how it looks.
 * - **Plain anchors.** An `<a href="/...">` no `<Link>` handles is a full page load, and a page load cannot
 *   evert; one that points at a page route is routed through the router instead (and so through the blocker).
 *
 * What is NOT a page transition, and passes untouched: a replace (redirects, URL-synced filters and tabs), a change
 * of search or hash on the same page, any navigation while a run is already on screen (the destination's own
 * redirects, a second press), and every navigation for a visitor who cannot have the effect (the site's Reduce
 * motion switch, no WebGL2: `enabled`).
 *
 * The decision is pure and unit tested (`__tests__/eversion-nav.test.ts`); the installer is a few listeners.
 */

/** The location shape the history blocker hands over (`@tanstack/history`'s `HistoryLocation`, narrowed). */
export interface NavLocation {
  href: string;
  pathname: string;
  state?: Record<string, unknown> | null;
}

export type NavAction = 'PUSH' | 'REPLACE' | 'BACK' | 'FORWARD' | 'GO';

/** The router's history key for an entry's position in the stack (`@tanstack/history` `stateIndexKey`). */
const INDEX_KEY = '__TSR_index';

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/** Is this history action a page transition the effect should carry? */
export function isPageTransition(
  current: NavLocation,
  next: NavLocation,
  action: NavAction,
): boolean {
  if (action === 'REPLACE') return false;
  return trimSlash(current.pathname) !== trimSlash(next.pathname);
}

/** How far a traversal moves in the stack, or `null` when the entries carry no index. */
export function traversalDelta(current: NavLocation, next: NavLocation): number | null {
  const a = current.state?.[INDEX_KEY];
  const b = next.state?.[INDEX_KEY];
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  const delta = b - a;
  return delta === 0 ? null : delta;
}

/** A plain-anchor click the browser would turn into a full page load of one of this site's pages. */
export function anchorToIntercept(event: MouseEvent, origin: string): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const a = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a) return null;
  if (a.hasAttribute('download') || a.hasAttribute('data-no-evert')) return null;
  const target = a.getAttribute('target');
  if (target && target !== '_self') return null;
  let url: URL;
  try {
    url = new URL(a.href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  return a;
}

/** The slice of the router the interceptor needs. */
export interface NavRouter {
  history: {
    block(blocker: {
      blockerFn: (args: {
        currentLocation: NavLocation;
        nextLocation: NavLocation;
        action: NavAction;
      }) => boolean | Promise<boolean>;
      enableBeforeUnload?: boolean | (() => boolean);
    }): () => void;
    push(href: string, state?: unknown, opts?: { ignoreBlocker?: boolean }): void;
    go(delta: number, opts?: { ignoreBlocker?: boolean }): void;
  };
  navigate(opts: { href: string }): unknown;
  getMatchedRoutes(
    pathname: string,
  ): readonly [
    ReadonlyArray<{ id: string; options?: { component?: unknown } }>,
    unknown,
    { id: string; options?: { component?: unknown } } | undefined,
  ];
  readonly state: { readonly location: { readonly pathname: string } };
}

/** A navigation held back for the effect. */
export interface HeldNavigation {
  href: string;
  pathname: string;
  /** Issue it as asked, past the blocker. */
  go(): void;
  traverses: boolean;
  /** Where it was asked from (the press, or the focused control a key was pressed on); `null` = no idea. */
  origin: { x: number; y: number } | null;
}

export interface NavigatorDeps {
  router: NavRouter;
  /** The visitor can have the effect at all (flag, Reduce motion, WebGL2). */
  enabled(): boolean;
  /** A run (or a hub hand-off) is already on: let navigations through untouched. */
  busy(): boolean;
  /** Carry `held` through the effect. Must end in `held.go()` one way or another. */
  evert(held: HeldNavigation): void;
}

/** How recent a press has to be to count as where a navigation came from. */
const ORIGIN_MS = 1500;

/** Whether `pathname` renders inside the `_site` shell (the hub's layout). */
export function inShell(router: Pick<NavRouter, 'getMatchedRoutes'>, pathname: string): boolean {
  try {
    const [routes] = router.getMatchedRoutes(pathname);
    return routes.some((r) => r.id === '/_site' || r.id.startsWith('/_site/'));
  } catch {
    return false;
  }
}

/** Whether `pathname` is one of the router's pages (not an API route, a file, or nothing at all). */
export function isPageRoute(
  router: Pick<NavRouter, 'getMatchedRoutes'>,
  pathname: string,
): boolean {
  try {
    const [routes, , found] = router.getMatchedRoutes(pathname);
    if (!found || found.id === '__root__') return false;
    return routes.some((r) => r.options?.component !== undefined && r.id !== '__root__');
  } catch {
    return false;
  }
}

/** Install the interceptor; returns the remover. */
export function installNavigationEversion(deps: NavigatorDeps): () => void {
  const { router } = deps;
  let press: { x: number; y: number; at: number } | null = null;
  let key: { el: Element; at: number } | null = null;

  const onPointerDown = (e: PointerEvent) => {
    press = { x: e.clientX, y: e.clientY, at: performance.now() };
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = document.activeElement;
    if (el && el !== document.body) key = { el, at: performance.now() };
  };
  const origin = (): HeldNavigation['origin'] => {
    const now = performance.now();
    const k = key && now - key.at < ORIGIN_MS ? key : null;
    const p = press && now - press.at < ORIGIN_MS ? press : null;
    if (k && (!p || k.at > p.at)) {
      const r = k.el.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return p ? { x: p.x, y: p.y } : null;
  };

  const hold = (held: HeldNavigation) => {
    press = null;
    key = null;
    deps.evert(held);
  };

  const unblock = router.history.block({
    enableBeforeUnload: false,
    blockerFn: ({ currentLocation, nextLocation, action }) => {
      if (!isPageTransition(currentLocation, nextLocation, action)) return false;
      if (!deps.enabled() || deps.busy()) return false;
      if (action === 'PUSH') {
        const at = origin();
        const state = nextLocation.state ?? undefined;
        // Off this task: the router's own `navigate()` is still on the stack, waiting for this answer.
        queueMicrotask(() =>
          hold({
            href: nextLocation.href,
            pathname: nextLocation.pathname,
            go: () => router.history.push(nextLocation.href, state, { ignoreBlocker: true }),
            traverses: false,
            origin: at,
          }),
        );
        return true;
      }
      const delta = traversalDelta(currentLocation, nextLocation);
      if (delta === null) return false;
      // Blocked, the history puts the browser back where it was with a `history.go(-delta)` of its own. That
      // `popstate` must have landed before the run starts listening for the visitor's, or the run would take it
      // for a second back/forward.
      let started = false;
      const start = () => {
        if (started) return;
        started = true;
        window.removeEventListener('popstate', onRevert);
        clearTimeout(timer);
        setTimeout(
          () =>
            hold({
              href: nextLocation.href,
              pathname: nextLocation.pathname,
              go: () => router.history.go(delta, { ignoreBlocker: true }),
              traverses: true,
              origin: null,
            }),
          0,
        );
      };
      const onRevert = () => start();
      window.addEventListener('popstate', onRevert);
      const timer = setTimeout(start, 400);
      return true;
    },
  });

  const onClick = (e: MouseEvent) => {
    const a = anchorToIntercept(e, location.origin);
    if (!a) return;
    const url = new URL(a.href, location.origin);
    if (!isPageRoute(router, url.pathname)) return;
    if (trimSlash(url.pathname) === trimSlash(location.pathname)) return;
    e.preventDefault();
    // Through the router, so through the blocker above (or, if the effect cannot run, as a plain SPA navigation).
    void router.navigate({ href: url.pathname + url.search + url.hash });
  };

  const opts = { capture: true, passive: true } as const;
  document.addEventListener('pointerdown', onPointerDown, opts);
  document.addEventListener('keydown', onKeyDown, opts);
  // Bubble phase on window: after React's root listener, so a `<Link>` that handled the click has prevented it.
  window.addEventListener('click', onClick);
  return () => {
    unblock();
    document.removeEventListener('pointerdown', onPointerDown, opts);
    document.removeEventListener('keydown', onKeyDown, opts);
    window.removeEventListener('click', onClick);
  };
}
