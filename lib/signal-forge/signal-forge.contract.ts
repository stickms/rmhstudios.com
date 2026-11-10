/**
 * Contracts for the Signal Forge reads (redesign audit C1, batch 8): the public
 * leaderboard and the caller's saved run. The writes (`save`, `abandon`, `score`)
 * parse their own bodies with bespoke messages and stay raw. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';

export interface SignalForgeLeaderboardRow {
  username: string;
  highScore: number;
  floorReached: number;
  gamesPlayed: number;
  updatedAt: string;
}

/** The top 100 by high score. */
export const getSignalForgeLeaderboardApi = endpoint<{
  res: SignalForgeLeaderboardRow[];
}>()({ method: 'GET', path: '/api/signal-forge/leaderboard' });

/** The caller's saved run, if any. 401 when signed out. */
export const loadSignalForgeRunApi = endpoint<{
  res: { hasSavedRun: false } | { hasSavedRun: true; runState: Record<string, unknown> };
}>()({ method: 'GET', path: '/api/signal-forge/load' });
