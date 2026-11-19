/** Zod schema for the advisor endpoint. Server-side only by use (the contract imports its type). */
import { z } from 'zod';
import { ADVISOR_LIMITS } from './advisor-limits';

export const advisorBody = z.object({
  system: z.enum(['dnd5e', 'pf2e']),
  question: z.string().trim().min(1).max(ADVISOR_LIMITS.question),
  /** The character sheet as Markdown, built by the client from the rules engine. */
  sheet: z.string().max(ADVISOR_LIMITS.sheet),
  /** Earlier turns of this conversation, oldest first. */
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(ADVISOR_LIMITS.turn) }))
    .max(ADVISOR_LIMITS.turns)
    .default([]),
});

export const advisorResponse = z.object({ answer: z.string() });
