import { createFileRoute, notFound } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { isRegisteredApiPath, resolveApiRoute } from '@/lib/api/route-dispatch.server';

/**
 * /api/** — the registered API endpoints (third-pass audit AR3).
 *
 * An endpoint whose handlers are `implement()` or `defineHandler()` calls is not a file in
 * this directory: it is a module in its domain's `api/` folder that exports
 * `route = apiRoute('/api/…', { GET: implement(…) })`, listed in
 * `lib/api/route-table.server.ts`. This splat is where they are served. The
 * router still prefers every route file that remains here (a splat is its last choice),
 * and `lib/api/__tests__/route-table.test.ts` proves no route file can answer a
 * registered path.
 *
 * What a route file used to do, kept exactly:
 *
 *  - path and method found: the handler runs with `{ request, params }`;
 *  - path found, method not handled: the request falls through to the app render, as it
 *    did for a route file without that handler (`next()`);
 *  - path not found: the same fall-through, and the loader below turns it into the
 *    site's 404, which is what an unknown `/api/…` path was before this route existed.
 *
 * `ANY` because the set of methods is per endpoint; HEAD falls back to GET in
 * `handlerFor`, as the router did. The component is what lets a handler defer to the app
 * render at all (the router only passes a working `next` to a route that can render); it
 * draws nothing, like the component-less route files this replaces.
 */

// createIsomorphicFn so the registry import is dropped from the browser build with the
// `.server()` half. The browser only reaches this loader by navigating to an /api path
// inside the app, which is never a page.
const isRegistered = createIsomorphicFn()
  .server((pathname: string): boolean => isRegisteredApiPath(pathname))
  .client((): boolean => false);

export const Route = createFileRoute('/api/$')({
  loader: ({ location }) => {
    if (!isRegistered(location.pathname)) throw notFound();
  },
  component: () => null,
  server: {
    handlers: {
      ANY: ({ request, pathname, next }) => {
        const found = resolveApiRoute(pathname, request.method);
        if (!found?.handler) return next();
        return found.handler({ request, params: found.params });
      },
    },
  },
});
