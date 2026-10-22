/**
 * Communities-plus (N1–N8, S2): the zod input schemas for the API routes.
 *
 * The limits, flair presets and wire shapes live in `./plus` and are
 * re-exported here so a route can take everything from one place. Components
 * import `./plus` directly — the flair chip is on every feed card, and this
 * module would put zod on every feed route.
 */
import { z } from 'zod';
import { VERIFICATION_LEVELS } from '@/lib/communities/verification';
import {
  FLAIR_COLORS,
  FLAIR_MAX_PER_COMMUNITY,
  ONBOARDING_MAX_FLAIRS_PER_OPTION,
  ONBOARDING_MAX_OPTIONS,
  ONBOARDING_MAX_QUESTIONS,
  SISTERS_MAX,
  STAR_THRESHOLD_MAX,
  STAR_THRESHOLD_MIN,
} from '@/lib/communities/plus';

export * from '@/lib/communities/plus';

/* ---- N1 flair ---------------------------------------------------------- */

export const flairInputSchema = z.object({
  name: z.string().trim().min(1).max(24),
  color: z.enum(FLAIR_COLORS).default('accent'),
});

/* ---- settings (S2, N1, N2) -------------------------------------------- */

export const communitySettingsSchema = z
  .object({
    verificationLevel: z.enum(VERIFICATION_LEVELS),
    verificationValue: z
      .number()
      .int()
      .min(0)
      .max(60 * 24 * 30),
    flairRequired: z.boolean(),
    starThreshold: z.number().int().min(STAR_THRESHOLD_MIN).max(STAR_THRESHOLD_MAX),
  })
  .partial();

export const flairFollowsSchema = z.object({
  flairIds: z.array(z.string().max(64)).max(FLAIR_MAX_PER_COMMUNITY),
});

/* ---- N3 onboarding ----------------------------------------------------- */

export const onboardingOptionInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
  /** A cosmetic label shown on the member ("Pilot"). Never a permission. */
  roleTag: z.string().trim().min(1).max(24).optional(),
  flairIds: z.array(z.string().max(64)).max(ONBOARDING_MAX_FLAIRS_PER_OPTION).default([]),
});

export const onboardingSetSchema = z.object({
  questions: z
    .array(
      z.object({
        prompt: z.string().trim().min(1).max(140),
        options: z.array(onboardingOptionInputSchema).min(2).max(ONBOARDING_MAX_OPTIONS),
      }),
    )
    .max(ONBOARDING_MAX_QUESTIONS),
});

export const onboardingAnswerSchema = z.object({
  answers: z
    .array(z.object({ questionId: z.string().max(64), optionId: z.string().max(40) }))
    .min(1)
    .max(ONBOARDING_MAX_QUESTIONS),
});

/* ---- N4 mod queue ------------------------------------------------------ */

export const modDecisionSchema = z.object({
  decision: z.enum(['approve', 'remove']),
  // S4: a macro-filled note sent to the author when their content is removed.
  message: z.string().trim().max(1000).optional(),
});

/* ---- N5 challenge ------------------------------------------------------ */

export const challengeCreateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(1000),
  submitEndsAt: z.string().datetime(),
  voteEndsAt: z.string().datetime(),
});

export const challengeVoteSchema = z.object({ entryId: z.string().max(64) });

/* ---- N8 sisters -------------------------------------------------------- */

export const sistersSetSchema = z.object({
  slugs: z.array(z.string().trim().toLowerCase().min(1).max(64)).max(SISTERS_MAX),
});
