/**
 * RMHbox — Undercover Editor Zod Validation Schemas
 *
 * Validates all client→server payloads and data file entries
 * for the Undercover Editor collaborative writing minigame.
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

/** Validates a player's sentence submission during WRITE phase. */
export const WriteSentenceSchema = z.object({
  text: z.string().min(UE_MIN_SENTENCE_LENGTH).max(UE_MAX_SENTENCE_LENGTH),
});

/** Validates the Editor's word edit during EDIT phase. */
export const EditWordSchema = z.object({
  sentenceIndex: z.number().int().min(0),
  wordIndex: z.number().int().min(0),
  newWord: z.string().min(1).max(UE_MAX_EDIT_WORD_LENGTH).regex(/^\S+$/),
});

/** Validates the Editor's choice to skip editing this turn. */
export const SkipEditSchema = z.object({});

/** Validates a player's accusation vote during ACCUSATION phase. */
export const CastAccusationSchema = z.object({
  targetUserId: z.string().min(1),
});

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
