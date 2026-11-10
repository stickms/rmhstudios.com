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
import type { QueryClient, QueryKey, UseQueryOptions } from '@tanstack/react-query';

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
): Promise<void> {
  await queryClient.prefetchQuery(ON_SERVER ? { ...options, retry: false } : options);
}
