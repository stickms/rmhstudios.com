/**
 * Hook for fetching and displaying user reputation data.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/contract/client';
import {
  getDoctrineReputationApi,
  getDoctrineReputationLeaderboardApi,
} from '@features/doctrine/engine/doctrine.contract';

export function useDoctrineReputation() {
  return useQuery({
    queryKey: ['doctrine', 'reputation'],
    queryFn: () => api(getDoctrineReputationApi, { retries: 0 }),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useDoctrineReputationLeaderboard(limit = 50) {
  return useQuery({
    queryKey: ['doctrine', 'reputation', 'leaderboard', limit],
    queryFn: () =>
      api(getDoctrineReputationLeaderboardApi, { query: { limit: String(limit) }, retries: 0 }),
    staleTime: 30_000,
  });
}
