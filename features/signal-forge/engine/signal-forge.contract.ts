/**
 * Contracts for the Signal Forge routes: the public leaderboard, the caller's saved run (load / save /
 * abandon) and score submission. `save` answers 413 before it checks the session, so it stays a raw route.
 * Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { SignalForgeRunFacts } from './achievements';

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

/** The caller's saved blob, if any (a v2 `{ v, run, meta }`, or a pre-rework flat state to retire). 401 when signed out. */
export const loadSignalForgeRunApi = endpoint<{
  res: { hasSavedRun: false } | { hasSavedRun: true; runState: Record<string, unknown> };
}>()({ method: 'GET', path: '/api/signal-forge/load' });

/** Submit a finished run's score (through the shared score pipeline) and its achievement facts. */
export const submitSignalForgeScoreApi = endpoint<{
  body: { score: number; floorReached: number; durationMs?: number; facts?: SignalForgeRunFacts };
  res: { success: true; ranked: boolean; isRecord: boolean; achievements: string[] };
}>()({ method: 'POST', path: '/api/signal-forge/score' });

/** Save the in-progress run and progression. */
export const saveSignalForgeRunApi = endpoint<{
  body: { runState: Record<string, unknown> };
  res: { success: true };
}>()({ method: 'POST', path: '/api/signal-forge/save' });

/** Drop the caller's run in progress (progression is kept). */
export const abandonSignalForgeRunApi = endpoint<{
  res: { success: true };
}>()({ method: 'POST', path: '/api/signal-forge/abandon' });
