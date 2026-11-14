/**
 * Contracts for the daily puzzles (redesign audit C1, batches 3 and 10): the puzzle of
 * the day, the leaderboard, the signed-in result reads and the score POST (sent with
 * `keepalive` as the player leaves). Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { PuzzleResult } from '@/lib/daily-puzzles/persistence';

type Mode =
  string;

/** One stored run for a day, or `{ result: null }`. 400 `Invalid game mode` / `Invalid date`. */
export const getDailyPuzzleResultApi =
  endpoint<{
    query: {
      gameMode: Mode;
      date: string;
    };
    res: {
      result: PuzzleResult | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/daily-puzzles/results',
    },
  );

/** The last 30 days of runs for a mode, keyed by date. */
export const getDailyPuzzleResultsApi =
  endpoint<{
    query: {
      gameMode: Mode;
    };
    res: {
      results: Record<
        string,
        PuzzleResult
      >;
      gameMode: string;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/daily-puzzles/results',
    },
  );

/** The puzzle for a mode and day (the server generates it once and caches it). 400 on a bad mode / date / range. */
export const getDailyPuzzleApi =
  endpoint<{
    query: {
      gameMode: Mode;
      date: string;
    };
    res: {
      puzzle: unknown;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/daily-puzzles/puzzle',
    },
  );

export interface DailyPuzzleLeaderboardEntry {
  rank: number;
  score:
    | number
    | null;
  moves:
    | number
    | null;
  dnf: boolean;
  hintUsed: boolean;
  timeSeconds:
    | number
    | null;
  displayName: string;
  avatar:
    | string
    | null;
  solvedAt: string;
}

/** Top runs for a mode and day (ranked by score, moves or time depending on the mode). */
export const getDailyPuzzleLeaderboardApi =
  endpoint<{
    query: {
      gameMode: Mode;
      date: string;
    };
    res: {
      leaderboard: DailyPuzzleLeaderboardEntry[];
      dateKey: string;
      gameMode: string;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/daily-puzzles/leaderboard',
    },
  );

/**
 * One finished run. Which fields count depends on the mode (`moves` for lights-out,
 * `timeSeconds` for the timed modes, `score` for the rest); the route reads them leniently.
 */
export interface DailyPuzzleScoreBody {
  gameMode: Mode;
  dateKey: string;
  score?:
    | number
    | null
    | undefined;
  moves?:
    | number
    | null
    | undefined;
  timeSeconds?:
    | number
    | null
    | undefined;
  hintUsed?:
    | boolean
    | undefined;
  dnf?:
    | boolean
    | undefined;
  resultJson?: unknown;
}

/** Keeps the better run for the day: `improved` when it replaced one, `created` for the first. */
export const submitDailyPuzzleScoreApi =
  endpoint<{
    body: DailyPuzzleScoreBody;
    res: {
      success: true;
      improved?: boolean;
      created?: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/daily-puzzles/score',
    },
  );
