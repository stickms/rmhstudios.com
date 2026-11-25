/** Contract for the Vega score submit (redesign audit C1, batch 10). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { vegaScoreBody } from './score-schema';

/**
 * The run lands on the caller's VegaPlayer row (best score in `highestLevel`, best wave in `highestLoop`; see
 * features/vega/api/vega.score.server.ts) and comes back with the achievements it newly unlocked. An assisted
 * run (decided by the run claim, never by the body) leaves the row alone and answers `ranked: false`.
 */
export const submitVegaScoreApi = endpoint<{
  body: z.infer<typeof vegaScoreBody>;
  res: {
    success: true;
    isRecord: boolean;
    bestScore: number;
    bestWave: number;
    unlocked: string[];
    /** False when the server's run claim says assists were on: the run stayed off the board. */
    ranked: boolean;
  };
}>()({ method: 'POST', path: '/api/vega/score' });
