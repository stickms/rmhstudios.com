/** Request schema for POST /api/games/synapse-storm/score. Client-safe. */
import { z } from 'zod';

export const synapseStormScoreBody = z
  .object({
    score: z.number().int().min(0).max(10_000_000),
    puzzlesSolved: z.number().int().min(0).max(10_000),
    maxCombo: z.number().int().min(0).max(10_000),
    // The game tracks difficulty as a float (the leaderboard shows it as "Lv.1.6"); the adapter rounds it.
    peakDifficulty: z.number().finite().min(1).max(100),
    totalTime: z.number().finite().min(0).max(86_400),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.puzzlesSolved === 0 && value.score > 0)
      ctx.addIssue({ code: 'custom', message: 'Score requires solved puzzles' });
    if (value.maxCombo > value.puzzlesSolved)
      ctx.addIssue({ code: 'custom', message: 'Combo exceeds solved puzzles' });
  });
