/**
 * Contracts for the signed-in daily-puzzle result reads (redesign audit C1, batch 3).
 * The score POST stays a raw keepalive fetch (it fires as the player leaves). Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { PuzzleResult } from '@/lib/daily-puzzles/persistence';

type Mode = string;

/** One stored run for a day, or `{ result: null }`. 400 `Invalid game mode` / `Invalid date`. */
export const getDailyPuzzleResultApi = endpoint<{
  query: { gameMode: Mode; date: string };
  res: { result: PuzzleResult | null };
}>()({ method: 'GET', path: '/api/daily-puzzles/results' });

/** The last 30 days of runs for a mode, keyed by date. */
export const getDailyPuzzleResultsApi = endpoint<{
  query: { gameMode: Mode };
  res: { results: Record<string, PuzzleResult>; gameMode: string };
}>()({ method: 'GET', path: '/api/daily-puzzles/results' });
