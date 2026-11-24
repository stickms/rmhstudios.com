import { z } from 'zod';

// The same pattern as `SLUG_RE` in `read.server.ts`, restated so this module (and its tests) do not load Prisma.
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

/** The body of `POST /api/medschools/me/ask` (server and contract types only; the contract imports the type). */
export const askBody = z.object({
  question: z
    .string()
    .trim()
    .min(3)
    .max(400)
    // NUL and other control characters (newline and tab are fine in a question).
    .refine((s) => !/[^\P{Cc}\n\r\t]/u.test(s), 'control characters'),
  /** The school page's panel pins its school; the route call still runs. */
  slug: z.string().regex(SLUG_RE).optional(),
  /** Think it through (plan R20; absent means false): the answer call uses DeepSeek's reasoning. Ignored when `MEDSCHOOLS_QA_THINKING` is off. */
  think: z.boolean().optional(),
});
export type AskBody = z.infer<typeof askBody>;

const noControl = (s: string) => !/[^\P{Cc}\n\r\t]/u.test(s);

/** Body of `POST /api/medschools/me/qa-limit-request` (plan R19): the applicant's optional reason, never a question. */
export const limitRequestBody = z.object({
  note: z.string().trim().max(500).refine(noControl, 'control characters').optional(),
});
export type LimitRequestBody = z.infer<typeof limitRequestBody>;

/** Body of `POST /api/admin/medschools/qa-limit-requests`: approve or decline a pending request, or revoke an approval. */
export const limitDecisionBody = z.object({
  id: z.string().min(1).max(64),
  action: z.enum(['approve', 'decline', 'revoke']),
  adminNote: z.string().trim().max(500).refine(noControl, 'control characters').optional(),
});
export type LimitDecisionBody = z.infer<typeof limitDecisionBody>;

/**
 * Body of `POST /api/medschools/me/interview/followups`: one question (a stored school question or a general one), the
 * member's optional notes (used for this one call, never stored) and, for a school question, the school's slug (checked
 * against the active schools on the server). `think` is the same switch as the Q&A's.
 */
export const followupsBody = z.object({
  question: z.string().trim().min(3).max(500).refine(noControl, 'control characters'),
  notes: z.string().trim().max(2000).refine(noControl, 'control characters').optional(),
  slug: z.string().regex(SLUG_RE).optional(),
  think: z.boolean().optional(),
});
export type FollowupsBody = z.infer<typeof followupsBody>;
