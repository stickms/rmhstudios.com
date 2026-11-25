/**
 * RMHbox — Identity Crisis Zod schemas: the three client-to-server inputs and
 * the settings as the handler reads them. Server-side only.
 *
 * `ask` and `guess` carry member text. The handler cleans it (control
 * characters stripped, whitespace collapsed) before it checks the length, so
 * the schemas only bound what is read at all.
 */

import { z } from 'zod';
import {
  IC_MAX_ASK_SECONDS,
  IC_MAX_GUESS_LENGTH,
  IC_MAX_QUESTION_LENGTH,
  IC_MAX_QUESTIONS_PER_PLAYER,
  IC_MIN_ASK_SECONDS,
  IC_MIN_QUESTIONS_PER_PLAYER,
} from './settings';

/** Raw text is read up to a few times the longest accepted text; the rest is not looked at. */
const RAW_QUESTION_LIMIT = IC_MAX_QUESTION_LENGTH * 4;
const RAW_GUESS_LIMIT = IC_MAX_GUESS_LENGTH * 4;

export const AskInputSchema = z.object({
  text: z.string().max(RAW_QUESTION_LIMIT),
});
export type AskInput = z.infer<typeof AskInputSchema>;

export const VOTES = ['yes', 'no', 'maybe'] as const;
export type Vote = (typeof VOTES)[number];

export const VoteInputSchema = z.object({
  vote: z.enum(VOTES),
});
export type VoteInput = z.infer<typeof VoteInputSchema>;

export const GuessInputSchema = z.object({
  text: z.string().max(RAW_GUESS_LIMIT),
});
export type GuessInput = z.infer<typeof GuessInputSchema>;

/** The host's settings as the handler reads them (the lobby has already clamped them). */
export const IdentityCrisisSettingsSchema = z.object({
  questionsPerPlayer: z.number().int().min(IC_MIN_QUESTIONS_PER_PLAYER).max(IC_MAX_QUESTIONS_PER_PLAYER),
  askSeconds: z.number().int().min(IC_MIN_ASK_SECONDS).max(IC_MAX_ASK_SECONDS),
  hardIdentities: z.boolean(),
});
export type IdentityCrisisSettings = z.infer<typeof IdentityCrisisSettingsSchema>;
