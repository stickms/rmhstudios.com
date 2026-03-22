/**
 * Hook for fetching and displaying user reputation data.
 */

import { useQuery } from '@tanstack/react-query';

export function useDoctrineReputation() {
  return useQuery({
    queryKey: ['doctrine', 'reputation'],
    queryFn: async () => {
      const res = await fetch('/api/doctrine/reputation');
      if (!res.ok) throw new Error('Failed to fetch reputation');
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useDoctrineReputationLeaderboard(limit = 50) {
  return useQuery({
    queryKey: ['doctrine', 'reputation', 'leaderboard', limit],
    queryFn: async () => {
      const res = await fetch(`/api/doctrine/reputation/leaderboard?limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch leaderboard');
      return res.json();
    },
    staleTime: 30_000,
  });
}
