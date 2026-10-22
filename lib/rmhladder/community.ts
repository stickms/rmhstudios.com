/**
 * RMHLadder community features — referral board (F6) and interview reports (F8).
 * Client-safe plain data (zod-free), shared by the API routes and the forms.
 * The input schemas are in `./community-schema`.
 */

export const REFERRAL_MAX_OPEN_OFFERS = 3;
export const REFERRAL_MAX_PENDING_REQUESTS = 8;
export const REFERRAL_MAX_CAPACITY = 10;

export const QUESTION_TYPES = [
  'behavioral',
  'technical',
  'coding',
  'case',
  'brainteaser',
  'fit',
  'presentation',
  'other',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const OUTCOMES = ['offer', 'rejected', 'withdrew', 'pending'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const MAX_REPORTS_PER_COMPANY = 3;

