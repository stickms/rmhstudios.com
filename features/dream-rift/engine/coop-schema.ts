/**
 * Request schemas for the co-op board, the host's finish and "Your co-op runs" (sprint 15 09). The contracts import
 * these by `import type`, so no zod ships to the client.
 */
import { z } from 'zod';
import { COOP_MAX_SLOTS } from './coop-runs';

export const COOP_DIFFICULTIES = ['easy', 'normal', 'hard', 'lunatic'] as const;
export const COOP_METRICS = ['combined', 'time'] as const;

/** 4 players * 10M per-player cap. */
export const MAX_COMBINED_SCORE = 40_000_000;
/** 6 h sanity ceiling, in seconds (also the finish window). */
export const MAX_TIME_SURVIVED = 6 * 60 * 60;
const MAX_PLAYER_SCORE = 10_000_000;

/**
 * The host's post. There is no account anywhere in it: the accounts of a run are the ones the hub recorded by slot
 * (`memberIds`), and a slot names which of them a score belongs to.
 */
export const coopFinishBody = z.object({
  runId: z.string().min(1).max(64),
  difficulty: z.string().max(16),
  combinedScore: z.number().min(0).max(MAX_COMBINED_SCORE),
  timeSurvived: z.number().min(0).max(MAX_TIME_SURVIVED),
  stageReached: z.number().min(1).max(99),
  cleared: z.boolean(),
  players: z
    .array(
      z.object({
        slot: z
          .number()
          .int()
          .min(0)
          .max(COOP_MAX_SLOTS - 1),
        name: z.string().max(40),
        charId: z.string().min(1).max(16),
        score: z.number().min(0).max(MAX_PLAYER_SCORE),
      }),
    )
    .min(2)
    .max(COOP_MAX_SLOTS)
    .refine((list) => new Set(list.map((p) => p.slot)).size === list.length, 'Each slot appears once'),
});

export const coopBoardQuery = z.object({
  difficulty: z.enum(COOP_DIFFICULTIES).optional(),
  metric: z.enum(COOP_METRICS).optional(),
});

export const coopMineQuery = z.object({
  cursor: z.string().min(1).max(200).optional(),
});
