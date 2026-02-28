/**
 * RMHbox — Undercover Editor Zod Validation Schemas
 *
 * Validates all client→server payloads and data file entries
 * for the Undercover Editor collaborative writing minigame.
 *
 * Redesign: round-robin writing (1 story per player per round),
 * alternating write/edit rounds (2N total), editor must change
 * exactly 2 words in the most recent sentence, host-driven reading
 * phase, then matching phase.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §2
 */

import { z } from 'zod';
import {
  UE_MIN_SENTENCE_LENGTH,
  UE_MAX_SENTENCE_LENGTH,
  UE_MAX_EDIT_WORD_LENGTH,
} from '../constants';

// ─── Client→Server Input Schemas ────────────────────────────────

/** Validates a player's sentence submission during WRITE phase. */
export const WriteSentenceSchema = z.object({
  storyId: z.string().min(1),
  text: z.string().min(UE_MIN_SENTENCE_LENGTH).max(UE_MAX_SENTENCE_LENGTH),
});

/** Validates unsubmitting a sentence (returns to editing within time limit). */
export const UnsubmitSentenceSchema = z.object({
  storyId: z.string().min(1),
});

/**
 * Validates the Editor's 2-word edit during EDIT phase.
 * The editor must change exactly 2 words in the most recent sentence.
 * Both edits are submitted together as a single action.
 */
export const EditTwoWordsSchema = z.object({
  storyId: z.string().min(1),
  edits: z.array(z.object({
    wordIndex: z.number().int().min(0),
    newWord: z.string().min(1).max(UE_MAX_EDIT_WORD_LENGTH).regex(/^\S+$/),
  })).length(2),
});

/** Validates the Editor's choice to skip editing this round. */
export const SkipEditSchema = z.object({});

/** Validates a player's matching guess during REVIEW (matching) phase. */
export const SubmitMatchingSchema = z.object({
  /** Map of storyId → guessedEditorUserId. Must be a 1-to-1 mapping. */
  guesses: z.record(z.string().min(1), z.string().min(1)),
});

/** Validates lock-in of matching during REVIEW phase. */
export const LockInMatchingSchema = z.object({});

/** Host action to advance sentence in READING phase. */
export const NextSentenceSchema = z.object({});

/** Host action to advance to next story in READING phase. */
export const NextStorySchema = z.object({});

// ─── Data Validation Schemas ────────────────────────────────────

/** Schema for each story prompt in prompts.json. */
export const StoryPromptSchema = z.object({
  text: z.string().min(10),
  genre: z.string().min(1),
  mood: z.string().min(1),
});

export type StoryPrompt = z.infer<typeof StoryPromptSchema>;
