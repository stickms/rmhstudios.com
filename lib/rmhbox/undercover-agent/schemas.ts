/**
 * Undercover Agent — Zod Validation Schemas
 *
 * Input validation for spymaster clues, operative tile guesses,
 * end-turn actions, and team-setup actions.
 */

import { z } from 'zod';

/** Schema for the Spymaster's clue submission. */
export const GiveClueSchema = z.object({
  word: z
    .string()
    .min(1)
    .max(30)
    .transform((s) => s.trim())
    .refine((s) => /^\S+$/.test(s), {
      message: 'Clue must be a single word',
    }),
  number: z.union([z.number().int().min(0).max(9), z.literal('unlimited')]),
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

/** Schema for toggling a tile highlight. */
export const HighlightTileSchema = z.object({
  position: z.number().int().min(0).max(24),
  highlighted: z.boolean(),
});

// ─── Game-local constants ────────────────────────────────────────

/**
 * How long a disconnected spymaster has to come back (a reload, a Discord
 * Activity restart) before a connected operative takes over the role.
 */
export const UA_SPYMASTER_RECONNECT_GRACE_SECONDS = 10;

/** Most recent action-log entries carried by a state snapshot (the full log stays server-side). */
export const UA_SNAPSHOT_LOG_LIMIT = 150;

/** Points each player receives when the game ends in a draw (max passes). */
export const UA_DRAW_POINTS = 300;
