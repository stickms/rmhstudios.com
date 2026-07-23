import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { RoutePending } from '@/components/ui/RoutePending';

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

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
