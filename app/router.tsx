import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { RoutePending } from '@/components/ui/RoutePending';
import { startViewportPrefetch } from '@/lib/viewport-prefetch';
import { installNotFoundHeadGuard } from '@/lib/router/not-found-head';
import { installStyleTierPreload } from '@/lib/style-tier';
import appTierCss from '@/app/app-tier.css?url';

// `getRouter()` runs once per client page load and once per SSR request. The
// viewport prefetcher is a browser-only, page-lifetime singleton, so it is
// started here behind a latch rather than from a component effect.
let viewportPrefetchStarted = false;

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // Jump, don't animate. globals.css sets `html { scroll-behavior: smooth }`
    // for in-page anchors, and with this option unset the router's reset
    // inherits it — so every navigation became an animated scroll to the top.
    // That animation is asynchronous: any touch/wheel input cancels it, and
    // content mounting mid-flight (skeleton → streamed loader data →
    // content-visibility feed cards) resizes the document under it, so slow
    // routes landed short of the top while fast ones looked fine. "instant"
    // makes the reset land in one frame, before paint.
    scrollRestorationBehavior: 'instant',
    // Preloads BOTH halves of a route on hover/focus, which is easy to miss:
    // the loader data *and* the route's JS chunk. TanStack Start compiles every
    // route's `component` to `lazyRouteComponent(() => import('./chunk'))`, and
    // `preloadRoute` → `loadMatches` → `loadRouteChunk` calls that component's
    // `.preload()`, which is the dynamic import — so Vite's own `__vitePreload`
    // emits the `<link rel="modulepreload">` for the chunk and its deps. A
    // hand-rolled modulepreload on the same intent signal (OPT-03 in
    // docs/optimization-ideas-2026-08-05.md) would duplicate this, so don't add
    // one without first re-checking that the compiled route options still use
    // `lazyRouteComponent`.
    defaultPreload: 'intent',
    // Wait until a hover/focus is deliberate (50ms) before prefetching a route,
    // so brushing past links on a slow connection doesn't burn bandwidth.
    defaultPreloadDelay: 50,
    // Treat preloaded route data as fresh for 30s so an intent-preload followed
    // by the actual navigation doesn't fetch the same data twice.
    defaultPreloadStaleTime: 30_000,
    // When a route loader outruns the preload cache, fall back to a skeleton
    // instead of freezing the previous page. `defaultPendingMs` holds it back
    // long enough that fast navigations never flash the skeleton, and
    // `defaultPendingMinMs` keeps it up long enough to avoid a jarring blink
    // once it does show.
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 180,
    defaultPendingMinMs: 220,
  });

  // A 404 thrown by a nested loader: the server builds <head> only up to the
  // not-found boundary, the client's hydrate() builds it for every match, and a
  // <script> the server never sent fails hydration for the whole document —
  // wiping <html>'s pre-paint attributes. This applies the server's cut on the
  // client too. See lib/router/not-found-head.ts.
  installNotFoundHeadGuard(router.routesById);

  // The intent preload above is hover-driven, so it never fires on a touch
  // device. This warms the first few links that are actually on screen instead
  // — capped, connection-aware, and only after `load`. See lib/viewport-prefetch.
  if (typeof document !== 'undefined' && !viewportPrefetchStarted) {
    viewportPrefetchStarted = true;
    startViewportPrefetch(router);
    // A switch from a site page into a game or app needs the app-tier sheet;
    // start it alongside the route's chunk rather than after (lib/style-tier.ts).
    installStyleTierPreload(router, appTierCss);
  }

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
