/**
 * RMHbox — Undercover Editor Zod Validation Schemas
 *
 * Validates all client→server payloads and data file entries
 * for the Undercover Editor collaborative writing minigame.
 *
 * Parallel design: all players write for all stories simultaneously.
 * Each player is the undercover editor for exactly one story.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §2.5
 */

import { z } from 'zod';
import {
  UE_MIN_SENTENCE_LENGTH,
  UE_MAX_SENTENCE_LENGTH,
  UE_MAX_EDIT_WORD_LENGTH,
} from '../constants';

// ─── Client→Server Input Schemas ────────────────────────────────

/** Validates a player's sentence submission during WRITE phase (per-story). */
export const WriteSentenceSchema = z.object({
  storyId: z.string().min(1),
  text: z.string().min(UE_MIN_SENTENCE_LENGTH).max(UE_MAX_SENTENCE_LENGTH),
});

/** Validates unsubmitting a sentence (returns to editing within time limit). */
export const UnsubmitSentenceSchema = z.object({
  storyId: z.string().min(1),
});

/** Validates the Editor's word edit during EDIT phase. */
export const EditWordSchema = z.object({
  storyId: z.string().min(1),
  sentenceIndex: z.number().int().min(0),
  wordIndex: z.number().int().min(0),
  newWord: z.string().min(1).max(UE_MAX_EDIT_WORD_LENGTH).regex(/^\S+$/),
});

/** Validates the Editor's choice to skip editing this turn. */
export const SkipEditSchema = z.object({});

/** Validates a player's matching guess during REVIEW phase. */
export const SubmitMatchingSchema = z.object({
  /** Map of storyId → guessedEditorUserId. */
  guesses: z.record(z.string().min(1), z.string().min(1)),
});

/** Validates lock-in of matching during REVIEW phase. */
export const LockInMatchingSchema = z.object({});

// ─── Data Validation Schemas ────────────────────────────────────

/** Schema for each story prompt in prompts.json. */
export const StoryPromptSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(10),
  genre: z.string().min(1),
  mood: z.string().min(1),
});

/** Schema for each keyword in keywords.json. */
export const KeywordSchema = z.object({
  id: z.string().min(1),
  word: z.string().min(1),
  category: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

export type StoryPrompt = z.infer<typeof StoryPromptSchema>;
export type Keyword = z.infer<typeof KeywordSchema>;
