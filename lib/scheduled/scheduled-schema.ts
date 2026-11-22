/** Drafts / scheduled posts — the zod request schemas for /api/scheduled (client-safe). */
import { z } from 'zod';
import { contentWarningFieldSchema } from '@/lib/feed/content-warning-schema';
import {
  MAX_RMHARK_LENGTH,
  MAX_POLL_QUESTION_LENGTH,
  MAX_POLL_OPTION_LENGTH,
  MIN_POLL_OPTIONS,
  MAX_IMAGE_ALT_LENGTH,
  gifAltSchema,
} from '@/lib/rmhark-schema';
import { refineRankedPoll } from '@/lib/feed/ranked-poll-schema';
import { RANKED_MAX_OPTIONS } from '@/lib/feed/ranked-poll';
import { quizPollFields, refineQuizPoll } from '@/lib/feed/quiz-poll-schema';

export const pollSchema = z
  .object({
    question: z.string().min(1).max(MAX_POLL_QUESTION_LENGTH),
    options: z.array(z.string().min(1).max(MAX_POLL_OPTION_LENGTH)).min(MIN_POLL_OPTIONS).max(RANKED_MAX_OPTIONS),
    multiSelect: z.boolean().optional(),
    // s06-19: a ranked-choice poll; `refineRankedPoll` holds it to 3-6 options and an end.
    ranked: z.boolean().optional(),
    durationHours: z.number().int().min(1).max(720).optional(),
    // s07-19: a quiz; `refineQuizPoll` holds it to single choice, 2-4 options and one correct answer.
    ...quizPollFields,
  })
  .superRefine((poll, ctx) => {
    refineRankedPoll(poll, ctx);
    refineQuizPoll(poll, ctx);
  });

export const createScheduledSchema = z.object({
  content: z.string().max(MAX_RMHARK_LENGTH).optional().default(''),
  poll: pollSchema.optional(),
  gifUrl: z.string().url().optional(),
  gifAlt: gifAltSchema.optional(),
  imageUrls: z.array(z.string()).max(4).optional(),
  imageAlts: z.array(z.string().max(MAX_IMAGE_ALT_LENGTH)).max(4).optional(),
  audience: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).optional(),
  isSensitive: z.boolean().optional(),
  contentWarning: contentWarningFieldSchema,
  replyControl: z.enum(['EVERYONE', 'FOLLOWING', 'MENTIONED']).optional(),
  unlockPrice: z.number().int().min(0).max(1_000_000).optional(),
  communityId: z.string().max(64).optional(),
  // ISO date; omit/null = plain draft. Must be in the future when set.
  scheduledAt: z.string().datetime().nullable().optional(),
  // Z7: sealed until `scheduledAt` (at least a day out); can't be edited or opened early.
  capsule: z.boolean().optional(),
});

export const patchScheduledSchema = z.object({
  content: z.string().max(MAX_RMHARK_LENGTH).optional(),
  audience: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).optional(),
  unlockPrice: z.number().int().min(0).max(1_000_000).nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  // s09-01: the edit dialog. One description per image (the server trims to the post's image count), the
  // composer's bounds; `null` clears the reason.
  imageAlts: z.array(z.string().max(MAX_IMAGE_ALT_LENGTH)).max(4).optional(),
  contentWarning: contentWarningFieldSchema,
  isSensitive: z.boolean().optional(),
});
