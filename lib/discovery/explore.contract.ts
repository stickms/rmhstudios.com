/** Contracts for the Explore payload, tips leaderboard and the people typeahead (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { ExploreResult } from '@/lib/explore.server';
import type { ResolvedUser } from '@/lib/user-display';

export const exploreApi = endpoint<{ res: ExploreResult }>()({
  method: 'GET',
  path: '/api/explore',
});

export const tipsLeaderboardApi = endpoint<{
  query: { range?: 'week' | 'all' };
  res: { range: 'week' | 'all'; leaders: { user: ResolvedUser; total: number }[] };
}>()({ method: 'GET', path: '/api/tips/leaderboard' });

export const searchUsersApi = endpoint<{
  query: { q: string };
  res: { users: ResolvedUser[] };
}>()({ method: 'GET', path: '/api/users/search' });
