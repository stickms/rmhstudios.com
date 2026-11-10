/**
 * Contracts for the Signal Forge reads (redesign audit C1, batch 8): the public
 * leaderboard and the caller's saved run, plus `score` and `abandon` (batch 10).
 * `save` answers 413 before it checks the session, so it stays a raw route.
 * Client-safe.
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

/** Submit a finished run's score. 401 when signed out; 400 `Invalid score` / `Invalid floor`. */
export const submitSignalForgeScoreApi = endpoint<{
  body: { score: number; floorReached: number };
  res: { success: true; profile: Record<string, unknown>; isRecord: boolean };
}>()({ method: 'POST', path: '/api/signal-forge/score' });

/** Drop the caller's saved run. */
export const abandonSignalForgeRunApi = endpoint<{
  res: { success: true };
}>()({ method: 'POST', path: '/api/signal-forge/abandon' });
