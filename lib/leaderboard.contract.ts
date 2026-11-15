/** Contract for the player leaderboard (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { getLeaderboard } from '@/lib/leaderboard.server';

export const playerLeaderboardApi =
  endpoint<{
    query: {
      scope?:
        | 'global'
        | 'friends';
    };
    res: Awaited<
      ReturnType<
        typeof getLeaderboard
      >
    >;
  }>()(
    {
      method:
        'GET',
      path: '/api/leaderboards/players',
    },
  );
