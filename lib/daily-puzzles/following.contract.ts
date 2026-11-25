/**
 * Contracts for the friends board of the daily puzzles: how the viewer's mutual follows did on one mode and day, and
 * one line per mode for a day. Client-safe (types only).
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { DailyMode } from '@/lib/daily-puzzles/following-schema';

/** One friend's run (or the viewer's own, `isYou`). Names and results only: no id, no handle. */
export interface FollowingBoardEntry {
  rank: number;
  isYou: boolean;
  score: number | null;
  moves: number | null;
  dnf: boolean;
  hintUsed: boolean;
  timeSeconds: number | null;
  displayName: string;
  avatar: string | null;
  solvedAt: string;
}

/** The viewer and their mutual follows with a score for the mode and day, ranked by the mode's own axis. */
export const getDailyFollowingBoardApi = endpoint<{
  query: {
    gameMode: DailyMode;
    date: string;
  };
  res: {
    entries: FollowingBoardEntry[];
    dateKey: string;
    gameMode: string;
  };
}>()({
  method: 'GET',
  path: '/api/daily-puzzles/following',
});

/** A friend's best result for a mode and day, as the summary line shows it. */
export interface FollowingSummaryBest {
  displayName: string;
  score: number | null;
  moves: number | null;
  timeSeconds: number | null;
}

/** The viewer's own result for a mode and day. */
export interface FollowingSummaryYou {
  score: number | null;
  moves: number | null;
  dnf: boolean;
  timeSeconds: number | null;
}

export interface FollowingSummaryMode {
  gameMode: string;
  /** Friends (not the viewer) who finished the mode that day. */
  finished: number;
  /** The best friend result, or `null` when no friend finished. */
  best: FollowingSummaryBest | null;
  /** The viewer's own result, or `null` when they have none. */
  you: FollowingSummaryYou | null;
}

/** One entry per daily mode for the day, in the hub's mode order. */
export const getDailyFollowingSummaryApi = endpoint<{
  query: {
    date: string;
  };
  res: {
    dateKey: string;
    modes: FollowingSummaryMode[];
  };
}>()({
  method: 'GET',
  path: '/api/daily-puzzles/following/summary',
});
