/** Contracts for Synapse Storm's save and leaderboard reads (redesign audit C1, batch 3). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { LeaderboardEntry } from '@/lib/synapse-storm/persistence';

/** The caller's player row; null before the first score (not an error). */
export const loadSynapseStormSaveApi = endpoint<{ res: Record<string, unknown> | null }>()({
  method: 'GET',
  path: '/api/games/synapse-storm/save',
});

/** Global top scores. `limit` defaults to 20, max 50. */
export const getSynapseStormLeaderboardApi = endpoint<{
  query: { limit?: number };
  res: { leaderboard: LeaderboardEntry[] };
}>()({ method: 'GET', path: '/api/games/synapse-storm/leaderboard' });
