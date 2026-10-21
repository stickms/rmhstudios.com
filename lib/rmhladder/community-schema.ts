/**
 * RMHLadder community features (F6, F8) — the zod input schemas for the
 * referral-board and interview-report API routes. Split from `./community`,
 * which the forms import for the limits and vocabularies.
 */
import { z } from 'zod';

import { OUTCOMES, QUESTION_TYPES, REFERRAL_MAX_CAPACITY } from './community';

export const createOfferSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  roles: z.string().trim().min(2).max(200),
  note: z.string().trim().max(500).optional(),
  capacity: z.number().int().min(1).max(REFERRAL_MAX_CAPACITY),
});

export const createRequestSchema = z.object({
  pitch: z.string().trim().min(20, 'Say a little more — at least 20 characters.').max(600),
});

export const respondSchema = z.object({ action: z.enum(['accept', 'pass', 'withdraw']) });

export const createInterviewReportSchema = z.object({
  companyId: z.string().min(1).max(64),
  roleTitle: z.string().trim().min(2).max(120),
  rounds: z.number().int().min(1).max(10),
  questionTypes: z.array(z.enum(QUESTION_TYPES)).min(1).max(QUESTION_TYPES.length),
  outcome: z.enum(OUTCOMES),
  difficulty: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional(),
});

export const interviewReportQuerySchema = z.object({ companyId: z.string().min(1).max(64) });
