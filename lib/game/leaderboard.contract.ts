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

/** Void Breaker's own board: the global top ten by high score. */
export const getVoidBreakerLeaderboardApi = endpoint<{
  res: { username: string; highScore: number }[];
}>()({ method: 'GET', path: '/api/void-breaker/leaderboard' });

/** Vega's own board: the global top ten by loop, then level. */
export const getVegaLeaderboardApi = endpoint<{
  res: { username: string; highestLoop: number; highestLevel: number; updatedAt: string }[];
}>()({ method: 'GET', path: '/api/vega/leaderboard' });
