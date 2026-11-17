/**
 * zod schemas for the admin email composer (/admin/email). The client imports
 * only the inferred types, through `lib/admin/email.contract.ts`.
 */
import { z } from 'zod';
import { CAMPAIGN_CATEGORIES } from '@/lib/email/preferences';

export const MAX_SUBJECT = 200;
export const MAX_BODY = 20_000;
/** Manual selection is for a handful of people, not a list import. */
export const MAX_MANUAL_RECIPIENTS = 500;

const isoDate = z.iso.date();

/**
 * Advanced filters. Every field is optional and they combine with AND. Bots,
 * accounts without a routable address and (unless asked) banned accounts are
 * always left out, whatever the filters say.
 */
export const audienceFiltersSchema = z
  .object({
    /** Name, handle, username or email contains this. */
    search: z.string().trim().min(1).max(100),
    /** Email ends with `@<domain>`. */
    emailDomain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)
      .max(100),
    joinedAfter: isoDate,
    joinedBefore: isoDate,
    /** Seen on the site within the last N days. */
    activeWithinDays: z.number().int().min(1).max(3650),
    /** Not seen for at least N days (never seen counts as inactive). */
    inactiveForDays: z.number().int().min(1).max(3650),
    emailVerified: z.boolean(),
    role: z.enum(['admins', 'non-admins']),
    verifiedBadge: z.enum(['yes', 'no']),
    membership: z.enum(['members', 'non-members']),
    minFollowers: z.number().int().min(0).max(100_000_000),
    minPosts: z.number().int().min(0).max(100_000_000),
    includeBanned: z.boolean(),
  })
  .partial()
  .strict();

export const audienceSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({ mode: z.literal('filter'), filters: audienceFiltersSchema }),
  z.object({
    mode: z.literal('manual'),
    userIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_MANUAL_RECIPIENTS),
  }),
]);

export const campaignCategorySchema = z.enum(CAMPAIGN_CATEGORIES);

export const previewBodySchema = z.object({
  audience: audienceSchema,
  category: campaignCategorySchema,
  /** With both, the preview also counts who already received this exact message. */
  subject: z.string().max(MAX_SUBJECT).optional(),
  body: z.string().max(MAX_BODY).optional(),
});

const draftFields = {
  subject: z.string().trim().min(1).max(MAX_SUBJECT),
  body: z.string().trim().min(1).max(MAX_BODY),
  category: campaignCategorySchema,
};

export const testSendBodySchema = z.object(draftFields);

export const createCampaignBodySchema = z.object({
  ...draftFields,
  audience: audienceSchema,
});

export const userSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});

export type AudienceFilters = z.infer<typeof audienceFiltersSchema>;
export type Audience = z.infer<typeof audienceSchema>;
export type PreviewBody = z.infer<typeof previewBodySchema>;
export type TestSendBody = z.infer<typeof testSendBodySchema>;
export type CreateCampaignBody = z.infer<typeof createCampaignBodySchema>;
