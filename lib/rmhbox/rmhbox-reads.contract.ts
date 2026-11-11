/**
 * Contracts for the RMHbox leaderboard and match-history reads (redesign audit C1,
 * batch 10). Client-safe. Both routes are public and rate limited per IP (429
 * `{ error, retryAfter }`). The routes stay hand-wrapped, so these types are the
 * hand-written shapes of what they return.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { GameLog } from '@/lib/rmhbox/history-display';
import type { LeaderboardEntry } from '@/lib/rmhbox/types';

/** Ranked players: all-time from the profile table, weekly / monthly / per-minigame from match players. */
export const getRmhboxLeaderboardApi = endpoint<{
  query: {
    period?: 'all-time' | 'weekly' | 'monthly' | undefined;
    minigame?: string | undefined;
    metric?: 'score' | 'wins' | 'games' | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  };
  res: {
    entries: LeaderboardEntry[];
    total: number;
    period: string;
    metric: string;
    /** The signed-in caller's rank, or null. */
    userRank: number | null;
    minigame?: string;
  };
}>()({ method: 'GET', path: '/api/rmhbox/leaderboard' });

export interface RmhboxMatchSummary {
  id: string;
  minigameId: string;
  lobbyId: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  winnerUserId: string | null;
  playerCount: number;
  players: Array<{
    userId: string;
    userName: string;
    rank: number;
    score: number;
    wasWinner?: boolean;
  }>;
  gameLog?: GameLog;
}

/** A page of finished matches, newest first, optionally narrowed to one minigame or player. */
export const listRmhboxMatchesApi = endpoint<{
  query: {
    minigame?: string | undefined;
    userId?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  };
  res: { matches: RmhboxMatchSummary[]; total: number; limit: number; offset: number };
}>()({ method: 'GET', path: '/api/rmhbox/history' });
