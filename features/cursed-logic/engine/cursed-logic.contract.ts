/** Contracts for Cursed Logic's score submit and board. Client-safe: types only. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { cursedLogicScoreBody } from './score-schema';

/** Opaque result-moment payload (first score / personal best); read it with `parseScoreMoment`. */
export type ScoreMoment = unknown;

export const submitCursedLogicScoreApi = endpoint<{
  body: z.infer<typeof cursedLogicScoreBody>;
  res: { success: true; ranked: boolean; moment: ScoreMoment; unlocked: string[] };
}>()({ method: 'POST', path: '/api/cursed-logic/score' });

export interface CursedLogicBoardRow {
  rank: number;
  username: string;
  score: number;
  /** Duels won in the record run. */
  duels: number;
  /** Sector reached in the record run, and whether it beat NULL//ROOT. */
  sector: number;
  victory: boolean;
  /** Pacts signed in the record run. */
  pacts: number;
}

export const getCursedLogicLeaderboardApi = endpoint<{
  res: { entries: CursedLogicBoardRow[] };
}>()({ method: 'GET', path: '/api/cursed-logic/leaderboard' });
