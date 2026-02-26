/**
 * RMHbox — Emoji Cinema Zod Schemas
 *
 * Validation schemas for client → server actions in Emoji Cinema.
 * Used server-side to validate all player input.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §4.5
 */

import { z } from 'zod';
import { EC_MAX_EMOJIS, EC_MAX_GUESS_LENGTH } from '../constants';

// ─── Add Emoji Schema ────────────────────────────────────────────

export const AddEmojiSchema = z.object({
  emoji: z.string().min(1).max(10),
  position: z.number().int().min(0).max(EC_MAX_EMOJIS - 1),
});

// ─── Remove Emoji Schema ────────────────────────────────────────

export const RemoveEmojiSchema = z.object({
  position: z.number().int().min(0).max(EC_MAX_EMOJIS - 1),
});

// ─── Reorder Emoji Schema ───────────────────────────────────────

export const ReorderEmojiSchema = z.object({
  fromIndex: z.number().int().min(0).max(EC_MAX_EMOJIS - 1),
  toIndex: z.number().int().min(0).max(EC_MAX_EMOJIS - 1),
});

// ─── Select Movie Schema (MOVIE_SELECTION phase) ─────────────────

export const SelectMovieSchema = z.object({
  movieTitle: z.string().min(1).max(300),
});

// ─── Submit Guess Schema ────────────────────────────────────────

export const SubmitGuessSchema = z.object({
  guess: z.string().min(1).max(EC_MAX_GUESS_LENGTH).transform((s) => s.trim()),
});
