/**
 * Route loaders that seed React Query (redesign audit B4).
 *
 * The rule: a page's primary data is fetched in its route loader, so it renders
 * on the server and starts on an intent preload; React Query then owns that data
 * on the client (tabs, refetch after a mutation, invalidation). The loader and
 * the component share one `queryOptions`, so the page never fetches twice.
 *
 * ```ts
 * // feature.queries.ts
 * export const thingsQuery = () => queryOptions({
 *   queryKey: ['things'],
 *   queryFn: routeQueryFn(() => fetchThingsOnServer(), () => api(listThingsApi)),
 *   staleTime: 30_000,
 * });
 * // route
 * loader: ({ context }) => prefetchRouteQuery(context.queryClient, thingsQuery()),
 * // component
 * const { data, isPending } = useQuery(thingsQuery());
 * ```
 *
 * Client-safe: the server half is a `createServerFn` stub that only the SSR
 * loader ever calls.
 */
import {
  queryOptions,
  type QueryClient,
  type QueryKey,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { createIsomorphicFn } from '@tanstack/react-start';
import { api, apiUrl, type ApiInput } from '@/lib/contract/client';
import type { Endpoint, ResOf } from '@/lib/contract/endpoint';

const ON_SERVER = typeof window === 'undefined';

/**
 * A `queryFn` with two transports for one result. On the server (the SSR
 * loader) it calls `onServer`, a `createServerFn` that runs the same server
 * logic the API route does and reads the request's own session cookie; in the
 * browser it calls `onClient`, the existing typed contract call, so client
 * behaviour (rate limit, cache headers, retries) is exactly what it was. The
 * server result is round-tripped through JSON so Dates and the like have the
 * wire shape the client branch returns.
 */
export function routeQueryFn<T>(
  onServer: () => Promise<unknown>,
  onClient: () => Promise<T>,
): () => Promise<T> {
  return async () => {
    if (!ON_SERVER) return onClient();
    return JSON.parse(JSON.stringify(await onServer())) as T;
  };
}

/**
 * Await a query into the cache from a route loader. Unlike `ensureQueryData`
 * this never throws: a failed fetch (signed out, a 5xx) leaves the cache empty
 * and the component renders the same error / signed-out state it always did.
 * On the server it does not retry (a retry with backoff would hold the whole
 * document); fresh data already in the cache is reused.
 */
export async function prefetchRouteQuery<TData, TKey extends QueryKey>(
  queryClient: QueryClient,
  options: UseQueryOptions<TData, Error, TData, TKey>,
): Promise<undefined> {
  await queryClient.prefetchQuery(ON_SERVER ? { ...options, retry: false } : options);
  // `undefined`, not void: a loader returning this keeps `loaderData: undefined`, which is what
  // `definePage`'s head context expects.
  return undefined;
}

// createIsomorphicFn, not a `typeof window` branch: Start's compiler drops the `.server()`
// half, and with it the `.server` import, from the client graph (see app/router.tsx).
const readOnServer = createIsomorphicFn()
  .server(
    async (
      template: string,
      params: Record<string, string> | undefined,
      url: string,
    ): Promise<unknown> =>
      (await import('@/lib/api/internal-dispatch.server')).readInternal(template, params, url),
  )
  .client(async (): Promise<unknown> => {
    throw new Error('readOnServer called in the browser');
  });

/**
 * `queryOptions` for one GET contract, written once (third-pass audit AR2).
 *
 * In the browser the `queryFn` is the typed `api()` call. In a route loader on the
 * server it runs the SAME route handler in-process with the page request's cookie, so
 * the session check, validation and load exist in one place: the route. No
 * `createServerFn` twin.
 *
 * ```ts
 * export const adminFlagsQuery = () =>
 *   contractQuery(['admin', 'flags'], listAdminFlagsApi, undefined, { staleTime: 15_000 });
 * ```
 */
export function contractQuery<E extends Endpoint, const TKey extends QueryKey>(
  queryKey: TKey,
  contract: E,
  input?: Pick<ApiInput<E>, 'params' | 'query'> & { retries?: number; timeoutMs?: number },
  options?: { staleTime?: number; enabled?: boolean; retry?: boolean | number },
) {
  const { params, query, ...transport } = (input ?? {}) as {
    params?: Record<string, string>;
    query?: Record<string, unknown>;
    retries?: number;
    timeoutMs?: number;
  };
  return queryOptions({
    queryKey,
    queryFn: async ({ signal }): Promise<ResOf<E>> => {
      if (ON_SERVER) {
        const url = apiUrl(contract, {
          ...(params ? { params } : {}),
          ...(query ? { query } : {}),
        });
        return (await readOnServer(contract.path, params, url)) as ResOf<E>;
      }
      return (api as (e: Endpoint, i: unknown) => Promise<ResOf<E>>)(contract, {
        ...(params ? { params } : {}),
        ...(query ? { query } : {}),
        ...transport,
        signal,
      });
    },
    ...options,
  });
}
