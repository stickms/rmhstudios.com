/** Zod schemas for the roster endpoints. Server-side by use; the contract imports types only. */
import { z } from 'zod';

/** A character sheet is plain JSON; the server re-normalises it, so the schema only bounds it. */
export const saveCharacterBody = z.object({
  character: z.record(z.string(), z.unknown()),
});

export const characterIdParams = z.object({ id: z.string().min(1).max(100) });

/** Generous for a player's roster; it bounds the one response that returns every sheet at once. */
export const MAX_CHARACTERS = 200;
