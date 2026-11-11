/**
 * In-process GET of the site's own API, for route loaders (third-pass audit AR2).
 *
 * A server-rendered page used to need its read written twice: once as the GET route
 * (session, rate limit, validation, load) and once as a `createServerFn` that repeated
 * the session check and the load so the loader could run it without HTTP. The two were
 * kept the same by hand. This calls the route's own handler instead, with the page
 * request's headers (so its cookie, and therefore its session), in the same process:
 * no socket, no second definition, and every check the route makes is made.
 *
 * The handler is found from the contract's path template, which is the route file's
 * path (`/api/series/$id` is `app/routes/api/series/$id.ts` or `.../$id/index.ts`).
 */
import { getRequest } from '@tanstack/react-start/server';
import { HttpError } from '@/lib/http';
import { markInternalRequest } from '@/lib/api/internal-request.server';

type Handler = (args: {
  request: Request;
  params: Record<string, string>;
}) => Promise<Response> | Response;
type RouteModule = {
  Route?: { options?: { server?: { handlers?: Record<string, Handler | undefined> } } };
};

const modules = import.meta.glob<RouteModule>('/app/routes/api/**/*.ts');

/** `/app/routes/api/tf2-hud/$id.download.ts` -> `/api/tf2-hud/$id/download`. */
export function templateOfRouteFile(file: string): string {
  // An escaped literal dot (`races[.]csv`) is not a path separator: split around it.
  return file
    .replace(/^\/app\/routes/, '')
    .replace(/\.ts$/, '')
    .split('[.]')
    .map((part) => part.replace(/\./g, '/'))
    .join('.')
    .replace(/\/index$/, '');
}

let byTemplate: Map<string, () => Promise<RouteModule>> | undefined;
function routeModules(): Map<string, () => Promise<RouteModule>> {
  byTemplate ??= new Map(
    Object.entries(modules).map(([file, load]) => [templateOfRouteFile(file), load]),
  );
  return byTemplate;
}

/**
 * Run the GET handler registered for `template` and return its parsed JSON body.
 * A non-2xx answer throws the same `HttpError` the browser's `api()` call would.
 */
export async function readInternal<T>(
  template: string,
  params: Record<string, string> | undefined,
  pathWithQuery: string,
): Promise<T> {
  const load = routeModules().get(template);
  if (!load) throw new Error(`no API route file for ${template}`);
  const handler = (await load()).Route?.options?.server?.handlers?.GET;
  if (!handler) throw new Error(`${template} has no GET handler`);

  const page = getRequest();
  const request = markInternalRequest(
    new Request(new URL(pathWithQuery, page.url), { method: 'GET', headers: page.headers }),
  );
  const response = await handler({ request, params: params ?? {} });
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    throw new HttpError(
      response.status,
      undefined,
      undefined,
      body === undefined ? { text } : { body },
    );
  }
  return body as T;
}
