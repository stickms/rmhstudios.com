/**
 * Undercover Agent — Zod Validation Schemas
 *
 * Input validation for spymaster clues, operative tile guesses,
 * end-turn actions, and team-setup actions.
 */

import { z } from 'zod';

/** Schema for the Spymaster's clue submission. */
export const GiveClueSchema = z.object({
  word: z.string()
    .min(1)
    .max(30)
    .transform((s) => s.trim())
    .refine((s) => /^\S+$/.test(s), { message: 'Clue must be a single word' }),
  number: z.union([
    z.number().int().min(0).max(9),
    z.literal('unlimited'),
  ]),
});

/** Schema for an operative's tile guess. */
export const GuessTileSchema = z.object({
  position: z.number().int().min(0).max(24),
});

/** Schema for voluntarily ending a turn. */
export const EndTurnSchema = z.object({});

/** Schema for swapping a player to a different team during TEAM_SETUP. */
export const SwapPlayerSchema = z.object({
  targetUserId: z.string().min(1),
  toTeam: z.enum(['red', 'blue']),
});

/** Schema for toggling a player's role during TEAM_SETUP. */
export const SetRoleSchema = z.object({
  targetUserId: z.string().min(1),
  role: z.enum(['spymaster', 'operative']),
});
