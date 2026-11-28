/**
 * The member's own XP ledger and activity days (sprint 14 05), read through React Query over `api()`.
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/contract/client';
import { getDoctrineActivityApi, getDoctrineLedgerApi } from '@features/doctrine/engine/doctrine.contract';

/** The zone the browser reports; the server checks it and falls back to UTC. */
export { deviceTimeZoneOrUtc as browserTimeZone } from '@/lib/core/zoned-time';

export function useDoctrineLedger() {
  return useInfiniteQuery({
    queryKey: ['doctrine', 'reputation', 'ledger'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api(getDoctrineLedgerApi, {
        query: pageParam ? { cursor: pageParam } : {},
        retries: 0,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useDoctrineActivity(tz: string) {
  return useQuery({
    queryKey: ['doctrine', 'reputation', 'activity', tz],
    queryFn: () =>
      api(getDoctrineActivityApi, {
        query: { tz },
        retries: 0,
      }),
    staleTime: 60_000,
  });
}
