'use client';

/**
 * `useResource` — the thin `useQuery` wrapper for ordinary JSON reads (plan D6).
 *
 * The global defaults in `Providers.tsx` are tuned for data the shell keeps
 * around (60s stale, 10min gc). Most *page* data wants a shorter leash: a
 * profile, a leaderboard or a comment list read a minute old looks broken, and
 * holding it for ten minutes after the user left the page is memory spent on
 * something they will not come back to at that speed. 30s / 5min is that
 * middle setting, in one place, so a call site does not have to re-justify the
 * numbers each time — and any call site with a real reason still overrides them
 * through `options`.
 *
 * Pair it with `@/lib/query/keys` so the mutation that invalidates this data
 * spells the key the same way.
 */

import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';

/** Fresh enough that a page read does not flash old data; long enough to dedupe. */
export const RESOURCE_STALE_TIME = 30_000;
/** Back-navigation within a few minutes still hits the cache. */
export const RESOURCE_GC_TIME = 5 * 60_000;

// The JSON fetcher and its typed error live in lib/http (with a timeout,
// Retry-After-aware errors and the retry policy the QueryClient uses), so a
// `queryFn` here and anywhere else fails the same way.
export { HttpError, fetchJson } from '@/lib/http';

export type ResourceOptions<TData, TError> = Omit<
  UseQueryOptions<TData, TError, TData, QueryKey>,
  'queryKey' | 'queryFn'
>;

export function useResource<TData, TError = Error>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options: ResourceOptions<TData, TError> = {},
): UseQueryResult<TData, TError> {
  return useQuery<TData, TError, TData, QueryKey>({
    staleTime: RESOURCE_STALE_TIME,
    gcTime: RESOURCE_GC_TIME,
    // Spread before the key/fn so an override cannot accidentally replace them.
    ...options,
    queryKey,
    queryFn,
  });
}
