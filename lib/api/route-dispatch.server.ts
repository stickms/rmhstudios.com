/**
 * The registered API endpoints as one matcher (third-pass audit AR3).
 *
 * `app/routes/api/$.ts` asks this for the handler of a request; the in-process loader
 * read (`internal-dispatch.server.ts`) asks it for the GET handler of a contract path.
 */
import { compileRoutes, type RouteMatcher } from '@/lib/api/route-match';
import { handlerFor, type ApiRoute, type ApiRouteHandler } from '@/lib/api/route.server';
import { API_ROUTES } from '@/lib/api/route-table.server';

let matcher: RouteMatcher<ApiRoute> | undefined;
let byTemplate: Map<string, ApiRoute> | undefined;

function table(): RouteMatcher<ApiRoute> {
  return (matcher ??= compileRoutes(
    API_ROUTES.map((route) => ({ path: route.path, value: route })),
  ));
}

export interface ResolvedApiRoute {
  route: ApiRoute;
  params: Record<string, string>;
  /** `undefined` when the path is registered but not for this method. */
  handler: ApiRouteHandler | undefined;
}

/** The registered route for a request path (as the router spells it), or null. */
export function resolveApiRoute(pathname: string, method: string): ResolvedApiRoute | null {
  const found = table().match(pathname);
  if (!found) return null;
  return { route: found.value, params: found.params, handler: handlerFor(found.value, method) };
}

/** True when some registered route answers this path, whatever the method. */
export function isRegisteredApiPath(pathname: string): boolean {
  return table().match(pathname) !== null;
}

/** The registered route whose template is exactly `template` (a contract's `path`). */
export function apiRouteByTemplate(template: string): ApiRoute | undefined {
  byTemplate ??= new Map(API_ROUTES.map((route) => [route.path, route]));
  return byTemplate.get(template);
}
