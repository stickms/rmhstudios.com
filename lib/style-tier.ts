/**
 * Which entry stylesheet a document loads: the lean site sheet or the app-tier
 * superset. The sheets themselves, and why there are two, are documented at the
 * top of `app/site-tier.css`.
 *
 * - Every `_site` page, and the root-only 404, takes the **site** sheet.
 * - Every top-level route takes the **app** sheet (a superset, so it is always
 *   correct) unless it is listed in {@link SITE_SHEET_ROUTES}: top-level pages
 *   that render only site-shell code, where the lean sheet is enough. Forgetting
 *   to list a new page costs it bytes, never styles.
 * - Once a document holds the app sheet it keeps using it. React never removes
 *   a stylesheet it has inserted, so after a hard load on a game a later switch
 *   to a site page would otherwise insert the site sheet AFTER the superset, and
 *   on the way back to the game the site sheet's copy of `p-4` would sit after
 *   the superset's `px-2`. Staying on the superset keeps one sorted order.
 *
 * `lib/__tests__/style-tiers.test.ts` checks that nothing a site-sheet route can
 * render is excluded from the site sheet's sources.
 */

import { prefersLessData } from '@/lib/network-quality';

export type StyleTier = 'site' | 'app';

/** Top-level (non-`_site`) route ids whose whole import graph is site-tier code. */
export const SITE_SHEET_ROUTES: ReadonlySet<string> = new Set([
  '/login',
  '/offline',
  '/news/$slug',
  '/library/$slug',
  '/library/albums/$albumId',
  '/embed/post/$id',
  '/v/$slug',
  '/v/new',
  '/ref/$code',
]);

/**
 * The tier for a match list (root first). `appSheetLoaded` is whether the
 * document already holds the app sheet; pass `false` on the server.
 */
export function styleTierFor(routeIds: readonly string[], appSheetLoaded: boolean): StyleTier {
  if (appSheetLoaded) return 'app';
  const top = routeIds[1];
  // Root-only: the global 404, rendered by the root's own components.
  if (top === undefined || top === '/_site') return 'site';
  return SITE_SHEET_ROUTES.has(top) ? 'site' : 'app';
}

/** Whether this document already has the given stylesheet (always false on the server). */
export function hasStylesheet(href: string): boolean {
  if (typeof document === 'undefined') return false;
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    if (link.getAttribute('href') === href) return true;
  }
  return false;
}

interface TierRouter {
  subscribe(
    event: 'onBeforeLoad',
    fn: (e: { toLocation: { pathname: string } }) => void,
  ): () => void;
  getMatchedRoutes(pathname: string): readonly [ReadonlyArray<{ id: string }>, ...unknown[]];
  buildLocation(opts: never): { pathname: string };
  preloadRoute(opts: never): unknown;
}

/**
 * Warms the app sheet ahead of a client switch from a site page into a game or
 * app. Without it the sheet is discovered only when the new route's head
 * renders — after its chunk and loader — and React then holds the commit until
 * the sheet arrives, so the two downloads ran back to back (+0.1–0.4 s on 3G).
 *
 * Three signals, all ones the site already acts on:
 *  - the router PRELOADS an app-tier route — a hovered `<Link>`, or an on-screen
 *    link on a fast connection (`lib/viewport-prefetch.ts` decides that,
 *    honouring Data Saver): the sheet is preloaded beside the route's chunk;
 *  - a client navigation into the app tier starts: the sheet starts with it;
 *  - INTENT on a plain `<a href>` into the app tier (hover, focus, touch). The
 *    game tiles on `/games` and `/apps` are plain anchors — a full document
 *    load, by design — and before the split that new document found the one
 *    shared sheet already cached. Now it needs the app sheet, so it is fetched
 *    while the pointer is still on the tile. Discrete enter events, not
 *    pointer tracking; skipped under Data Saver.
 * Browser-only, once per document; a no-op once the sheet is in the document.
 */
export function installStyleTierPreload(router: TierRouter, appSheetHref: string): void {
  // A game or app page already has the superset — nothing to warm, ever.
  if (typeof document === 'undefined' || hasStylesheet(appSheetHref)) return;
  let requested = false;
  const warm = (pathname: string) => {
    if (requested || hasStylesheet(appSheetHref)) return;
    const ids = router.getMatchedRoutes(pathname)[0].map((r) => r.id);
    if (styleTierFor(ids, false) !== 'app') return;
    requested = true;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'style';
    link.href = appSheetHref;
    document.head.appendChild(link);
  };

  router.subscribe('onBeforeLoad', ({ toLocation }) => warm(toLocation.pathname));

  if (!prefersLessData()) {
    const intents = ['pointerover', 'focusin', 'touchstart'] as const;
    const onIntent = (e: Event) => {
      if (requested) {
        for (const type of intents) document.removeEventListener(type, onIntent, true);
        return;
      }
      const href = (e.target as Element | null)?.closest?.('a[href]')?.getAttribute('href');
      // Same-origin paths only; `//host` is protocol-relative.
      if (!href || href[0] !== '/' || href[1] === '/') return;
      warm(href.split(/[?#]/)[0]);
    };
    for (const type of intents) {
      document.addEventListener(type, onIntent, { capture: true, passive: true });
    }
  }

  const preload = router.preloadRoute.bind(router);
  router.preloadRoute = ((opts: never) => {
    try {
      warm(router.buildLocation(opts).pathname);
    } catch {
      // A location the router cannot build is one it will not preload either.
    }
    return preload(opts);
  }) as TierRouter['preloadRoute'];
}
