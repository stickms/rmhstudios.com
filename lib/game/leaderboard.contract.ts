/**
 * Contract for the generic per-game leaderboard, /api/games/$id/leaderboard
 * (redesign audit C1). Client-safe: types only.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { LeaderboardRow } from '@/lib/game/adapters.server';

export const getGameLeaderboardApi = endpoint<{
  query: { limit?: number };
  res: {
    game: { id: string; label: string; progressLabel: string | null };
    entries: LeaderboardRow[];
  };
}>()({ method: 'GET', path: '/api/games/$id/leaderboard' });
