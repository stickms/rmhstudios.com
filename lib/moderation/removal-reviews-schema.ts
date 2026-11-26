/** Input schemas for removal reviews (sprint 15, feature 16). Server-side only; the contracts use `import type`. */
import { z } from 'zod';
import { REMOVAL_REVIEW_NOTE_MAX } from '@/lib/moderation/removal-reviews';

/** The author's request: an optional note for the moderator. */
export const requestRemovalReviewBody = z.object({
  note: z.string().trim().max(REMOVAL_REVIEW_NOTE_MAX).optional(),
});

/** The admin's decision. */
export const decideRemovalReviewBody = z.object({
  action: z.enum(['uphold', 'restore']),
});

/** The admin list: waiting requests (oldest first) or decided ones (newest first). */
export const adminRemovalReviewsQuery = z.object({
  status: z.enum(['pending', 'decided']).optional(),
});
