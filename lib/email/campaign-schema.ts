/**
 * zod schemas for the admin email composer (/admin/email). The client imports
 * only the inferred types, through `lib/admin/email.contract.ts`.
 */
import { z } from 'zod';
import { CAMPAIGN_CATEGORIES } from '@/lib/email/preferences';
import { isFeedImageUrl } from '@/lib/storage/keys';

import {
  EMAIL_REWRITE_ACTIONS,
  MAX_BODY,
  MAX_EMAIL_IMAGES,
  MAX_MANUAL_RECIPIENTS,
  MAX_SUBJECT,
} from '@/lib/email/campaign-limits';

export {
  EMAIL_REWRITE_ACTIONS,
  MAX_BODY,
  MAX_EMAIL_IMAGES,
  MAX_MANUAL_RECIPIENTS,
  MAX_SUBJECT,
} from '@/lib/email/campaign-limits';
export type { EmailRewriteAction } from '@/lib/email/campaign-limits';

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
  z.object({
    mode: z.literal('all'),
  }),
  z.object({
    mode: z.literal('filter'),
    filters: audienceFiltersSchema,
  }),
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
  imageUrls: z.array(z.string().max(500)).max(MAX_EMAIL_IMAGES).optional(),
  design: z
    .lazy(() => emailDesignSchema)
    .nullable()
    .optional(),
  /** Count as the send would with the frequency cap overridden. */
  ignoreFrequencyCap: z.boolean().optional(),
});

/**
 * Pictures shown under the message. Only images stored by the site (an upload
 * or an AI image) are accepted: a mailing must not hotlink an arbitrary host,
 * which could track every open or change the picture after the send.
 */
export const emailImagesSchema = z
  .array(z.string().max(500).refine(isFeedImageUrl, 'Not a site image'))
  .max(MAX_EMAIL_IMAGES);

/* ── Designed emails ───────────────────────────────────────────────────────── */

/**
 * A designed email, as the AI designer returns it and the renderer draws it
 * (`lib/email/design-render.ts`). Structure, never markup: every value is text
 * or a choice from the brand kit (`lib/email/brand.ts`), so whatever a model
 * writes, the HTML is the site's own template. Links and pictures are checked
 * again against the message by `sanitizeDesign` (`lib/email/design.ts`).
 */
const designBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    text: z.string().min(1).max(120),
  }),
  z.object({
    type: z.literal('text'),
    text: z.string().min(1).max(MAX_BODY),
  }),
  z.object({
    type: z.literal('button'),
    label: z.string().min(1).max(40),
    url: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal('image'),
    image: z
      .number()
      .int()
      .min(0)
      .max(MAX_EMAIL_IMAGES - 1),
  }),
  z.object({
    type: z.literal('callout'),
    title: z.string().max(80).optional(),
    text: z.string().min(1).max(1_000),
  }),
  z.object({
    type: z.literal('list'),
    items: z.array(z.string().min(1).max(300)).min(1).max(8),
  }),
  z.object({
    type: z.literal('divider'),
  }),
]);

export const emailDesignSchema = z.object({
  theme: z.enum(['light', 'dark']),
  // "purple" was the old logo's colour; designs saved with it, and models
  // that still offer it, read as the ink.
  accent: z.preprocess((v) => (v === 'purple' ? 'ink' : v), z.enum(['ink', 'success', 'danger'])),
  /** Show the logo in the header. */
  logo: z.boolean(),
  /** A short line above the content (e.g. "Product news"). */
  eyebrow: z.string().max(60).optional(),
  /** The inbox preview text shown after the subject. */
  preheader: z.string().max(140).optional(),
  /** Up to 16 from the designer, plus any attached pictures it left out (`sanitizeDesign`). */
  blocks: z
    .array(designBlockSchema)
    .min(1)
    .max(16 + MAX_EMAIL_IMAGES),
});

export type EmailDesign = z.infer<typeof emailDesignSchema>;
export type EmailDesignBlock = z.infer<typeof designBlockSchema>;

const draftFields = {
  subject: z.string().trim().min(1).max(MAX_SUBJECT),
  body: z.string().trim().min(1).max(MAX_BODY),
  category: campaignCategorySchema,
  imageUrls: emailImagesSchema.optional(),
  /** Absent or null: the plain layout. */
  design: emailDesignSchema.nullable().optional(),
};

export const testSendBodySchema = z.object(draftFields);

export const createCampaignBodySchema = z.object({
  ...draftFields,
  audience: audienceSchema,
  /**
   * Send to people who had an optional email within the frequency cap window
   * (`BULK_MIN_GAP_HOURS`). Opt-outs and the per-message dedupe still apply.
   */
  ignoreFrequencyCap: z.boolean().optional(),
});

/* ── AI writing help ─────────────────────────────────────────────────────── */

/** Rewrite a passage: the whole body, or the part the admin highlighted. */
export const aiRewriteBodySchema = z.object({
  text: z.string().min(1).max(MAX_BODY),
  action: z.enum(EMAIL_REWRITE_ACTIONS),
  subject: z.string().max(MAX_SUBJECT).optional(),
});

/** Ask DeepSeek or Kimi to design the email from the draft and the brand kit. */
export const aiDesignBodySchema = z.object({
  subject: z.string().trim().min(1).max(MAX_SUBJECT),
  body: z.string().trim().min(1).max(MAX_BODY),
  category: campaignCategorySchema,
  imageCount: z.number().int().min(0).max(MAX_EMAIL_IMAGES),
  model: z.enum(['deepseek', 'deepseek-reasoning', 'kimi']),
  /** Optional art direction, e.g. "dark and calm" or "make it feel like a launch". */
  direction: z.string().max(300).optional(),
});

/** Render a draft exactly as a recipient would get it, for the preview pane. */
export const renderBodySchema = z.object({
  subject: z.string().max(MAX_SUBJECT),
  body: z.string().max(MAX_BODY),
  category: campaignCategorySchema,
  imageUrls: emailImagesSchema.optional(),
  design: emailDesignSchema.nullable().optional(),
});

/** A picture themed on the draft. */
export const aiImageBodySchema = z.object({
  subject: z.string().max(MAX_SUBJECT).optional(),
  body: z.string().max(MAX_BODY).optional(),
});

export const userSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});

export type AudienceFilters = z.infer<typeof audienceFiltersSchema>;
export type Audience = z.infer<typeof audienceSchema>;
export type PreviewBody = z.infer<typeof previewBodySchema>;
export type TestSendBody = z.infer<typeof testSendBodySchema>;
export type CreateCampaignBody = z.infer<typeof createCampaignBodySchema>;
export type AiRewriteBody = z.infer<typeof aiRewriteBodySchema>;
export type AiImageBody = z.infer<typeof aiImageBodySchema>;
export type AiDesignBody = z.infer<typeof aiDesignBodySchema>;
export type RenderBody = z.infer<typeof renderBodySchema>;
