/** Request schema for POST /api/signal-forge/score. Client-safe. */
import { z } from 'zod';

export const signalForgeScoreBody = z.object({
  score: z.number().min(0).max(1_000_000),
  floorReached: z.number().min(1).max(100),
});

/** The old route's two bespoke 400 texts, chosen by the field that failed. */
export function signalForgeScoreMessage(error: z.ZodError): string {
  return error.issues[0]?.path[0] === 'floorReached' ? 'Invalid floor' : 'Invalid score';
}
