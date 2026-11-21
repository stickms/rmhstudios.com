/**
 * Reading subscriptions: the request schemas and wire types. Client-safe (no Prisma, no server imports).
 */
import { z } from 'zod';
import { SUBSCRIPTION_KINDS, TARGET_MAX } from '@/lib/reading/subscriptions';

export const createSubscriptionBody = z.object({
  kind: z.enum(SUBSCRIPTION_KINDS),
  /** "" for the Logs; the tag, the category name or the story slug otherwise. */
  target: z.string().max(TARGET_MAX).default(''),
});

export const updateSubscriptionBody = z
  .object({
    inApp: z.boolean().optional(),
    email: z.boolean().optional(),
  })
  .refine((v) => v.inApp !== undefined || v.email !== undefined, 'Nothing to update');

/** One subscription as the member sees it. */
export const subscriptionView = z.object({
  id: z.string(),
  kind: z.enum(SUBSCRIPTION_KINDS),
  target: z.string(),
  /** The story's title for `news_story`, so the settings list names it; null otherwise. */
  title: z.string().nullable(),
  inApp: z.boolean(),
  email: z.boolean(),
  createdAt: z.string(),
});
export type SubscriptionView = z.infer<typeof subscriptionView>;
