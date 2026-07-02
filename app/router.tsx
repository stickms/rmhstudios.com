import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // Wait until a hover/focus is deliberate (50ms) before prefetching a route,
    // so brushing past links on a slow connection doesn't burn bandwidth.
    defaultPreloadDelay: 50,
    // Treat preloaded route data as fresh for 30s so an intent-preload followed
    // by the actual navigation doesn't fetch the same data twice.
    defaultPreloadStaleTime: 30_000,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
