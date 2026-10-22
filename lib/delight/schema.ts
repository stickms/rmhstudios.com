/**
 * The zod input schemas for the delight package (Z2, Z3, Z4, Z6, Z8, Y4).
 * The helpers and types live in `./shared` (re-exported below); components
 * import that module directly so the hunt, photo and fortune pages stay
 * zod-free.
 */
import { z } from 'zod';

import { FORTUNE_MAX } from './shared';

export * from './shared';

export const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Only same-site, absolute paths: where a clue marker may appear. */
export const sitePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^\/[A-Za-z0-9\-._~/]*$/, 'Use a path like /news')
  .refine((p) => !p.startsWith('//'), 'Use a path like /news');

export const huntInputSchema = z.object({
  title: z.string().trim().min(2).max(120),
  clues: z
    .array(
      z.object({
        clueText: z.string().trim().min(2).max(500),
        hint: z.string().trim().max(300).default(''),
        answer: z.string().trim().min(1).max(120),
        hiddenPath: sitePathSchema,
      }),
    )
    .min(1)
    .max(20),
});
export type HuntInput = z.infer<typeof huntInputSchema>;

export const answerSchema = z.object({ answer: z.string().trim().min(1).max(120) });

export const eraSchema = z.object({
  eraDate: dayKeySchema,
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(2000),
  imageUrl: z.string().trim().url().max(500).startsWith('https://').nullable().optional(),
});

export const fortuneSubmitSchema = z.object({ text: z.string().trim().min(8).max(FORTUNE_MAX) });
export const fortuneReviewSchema = z.object({ status: z.enum(['approved', 'rejected']) });

export const photoVoteSchema = z.object({ nominationId: z.string().min(1).max(40) });

export const suggestSchema = z.object({
  locale: z.string().min(2).max(8),
  ns: z.string().min(1).max(64),
  key: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(1000),
});
export const translateQuerySchema = z.object({
  locale: z.string().min(2).max(8),
  ns: z.string().min(1).max(64).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
