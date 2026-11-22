/**
 * Contracts for the RMHbox leaderboard and match-history reads (redesign audit C1,
 * batch 10). Client-safe. All three are public reads rate limited per IP; stats and the
 * history player filter also follow the member's game-activity privacy
 * (`lib/rmhbox/player-stats.server.ts`).
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { GlobalStats, MinigameStats, RecentMatch } from '@/lib/rmhbox/player-stats';
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
}>()({
  method: 'GET',
  path: '/api/rmhbox/leaderboard',
});

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

/** A page of finished matches, newest first, optionally narrowed to one minigame or player (a player the caller may not see lists as empty). */
export const listRmhboxMatchesApi = endpoint<{
  query: {
    /** One match's detail (the log only for its players and admins): answers `{ match }` instead of a list. */
    matchId?: string | undefined;
    minigame?: string | undefined;
    /** Only the matches of this player, and only when their game-activity setting lets the caller see them. */
    userId?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  };
  res: {
    matches: RmhboxMatchSummary[];
    total: number;
    limit: number;
    offset: number;
  };
}>()({
  method: 'GET',
  path: '/api/rmhbox/history',
});

/** What the caller may see of a player's record (see `resolveStatsAccess`). */
export type RmhboxStatsAccess = 'full' | 'totals' | 'private';

export interface RmhboxStatsPlayer {
  id: string;
  name: string;
  image: string | null;
}

/**
 * A player's RMHBox record. `full` carries everything; `totals` (a signed-out visitor
 * to a public record) only `global`; `private` carries nothing but the player's name.
 * A blocked, banned or unknown player is a 404.
 */
export const getRmhboxStatsApi = endpoint<{
  query: {
    userId: string;
    /** Narrows `recentMatches` to one minigame. */
    minigame?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  };
  res: {
    access: RmhboxStatsAccess;
    player: RmhboxStatsPlayer;
    /** Null for a member who has never finished a match. */
    global: GlobalStats | null;
    minigames: Record<string, MinigameStats>;
    recentMatches: RecentMatch[];
  };
}>()({
  method: 'GET',
  path: '/api/rmhbox/stats',
});
