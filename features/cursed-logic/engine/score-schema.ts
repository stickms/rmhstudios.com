/** Request schema for POST /api/cursed-logic/score. Client-safe. */
import { z } from 'zod';
import { TOTAL_DUELS } from './data';
import { MAX_RUN_SCORE } from './score';

export const PACT_IDS = ['chaosRun', 'glassCannon', 'doubleDown', 'blackout'] as const;

/**
 * One finished run. Every field is bounded by what a run can produce; the route also checks the fields against
 * each other (a score above what the claimed duels could earn, a victory without nine duels) before anything is
 * stored or any achievement is granted.
 */
export const cursedLogicScoreBody = z
  .object({
    score: z.number().int().min(0).max(MAX_RUN_SCORE),
    duelsWon: z.number().int().min(0).max(TOTAL_DUELS),
    /** The sector the run ended in (1-5). */
    sector: z.number().int().min(1).max(5),
    victory: z.boolean(),
    pacts: z.array(z.enum(PACT_IDS)).max(PACT_IDS.length),
    flawlessDuels: z.number().int().min(0).max(TOTAL_DUELS),
    /** Fewest rounds any won duel took; 0 when none was won. */
    fastestDuel: z.number().int().min(0).max(30),
    neverBelowHalf: z.boolean(),
    durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  })
  .strict();

export type CursedLogicScoreBody = z.infer<typeof cursedLogicScoreBody>;
