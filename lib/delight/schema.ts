/** Shared types + zod for the delight package (Z2, Z3, Z4, Z6, Z8, Y4). Client-safe. */
import { z } from 'zod';

export const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dayKey: string, n: number): string {
  return utcDay(new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * 86_400_000));
}

/** Hunt answers match case-insensitively with punctuation and spacing ignored. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

export const FORTUNE_MAX = 140;
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

export interface DelightConfig {
  fools: boolean;
  hunt: boolean;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
