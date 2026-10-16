/**
 * Communities-plus (N1–N8, S2): shared zod schemas, limits and wire shapes.
 * Client-safe — no Prisma, no server imports.
 */
import { z } from 'zod';
import { VERIFICATION_LEVELS } from '@/lib/communities/verification';
import type { ChallengePhase } from '@/lib/communities/challenge';
import type { CensusQuestion, CensusResultQuestion } from '@/lib/communities/census';

/* ---- N1 flair ---------------------------------------------------------- */

export const FLAIR_MAX_PER_COMMUNITY = 20;
/** Token presets — a flair never stores a raw colour (every theme must work). */
export const FLAIR_COLORS = ['accent', 'success', 'warning', 'danger', 'neutral'] as const;
export type FlairColor = (typeof FLAIR_COLORS)[number];

/** Tailwind token classes per preset (static strings so Tailwind sees them). */
export const FLAIR_CHIP_CLASSES: Record<FlairColor, string> = {
  accent: 'bg-site-accent-dim text-site-accent border-site-accent/30',
  success: 'bg-site-success/15 text-site-success border-site-success/30',
  warning: 'bg-site-warning/15 text-site-warning border-site-warning/30',
  danger: 'bg-site-danger/15 text-site-danger border-site-danger/30',
  neutral: 'bg-site-surface text-site-text-muted border-site-border',
};

export function isFlairColor(v: unknown): v is FlairColor {
  return typeof v === 'string' && (FLAIR_COLORS as readonly string[]).includes(v);
}

export const flairInputSchema = z.object({
  name: z.string().trim().min(1).max(24),
  color: z.enum(FLAIR_COLORS).default('accent'),
});

export interface FlairDTO {
  id: string;
  name: string;
  color: FlairColor;
}

/** The auto-created flair the challenge winner's post receives. */
export const CHALLENGE_WINNER_FLAIR = { name: 'Challenge winner', color: 'warning' as FlairColor };

/* ---- settings (S2, N1, N2) -------------------------------------------- */

export const STAR_THRESHOLD_MIN = 1;
export const STAR_THRESHOLD_MAX = 100;
export const STAR_EMOJI = '⭐';

/** ⭐ with or without the emoji variation selector. */
export function isStarEmoji(emoji: string): boolean {
  return emoji.replace(/️/g, '') === STAR_EMOJI;
}

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

export const ONBOARDING_MAX_QUESTIONS = 5;
export const ONBOARDING_MAX_OPTIONS = 6;
export const ONBOARDING_MAX_FLAIRS_PER_OPTION = 5;

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

export interface OnboardingOptionDTO {
  id: string;
  label: string;
  roleTag?: string;
  flairIds: string[];
}
export interface OnboardingQuestionDTO {
  id: string;
  prompt: string;
  options: OnboardingOptionDTO[];
}

/* ---- N4 mod queue ------------------------------------------------------ */

export const modDecisionSchema = z.object({
  decision: z.enum(['approve', 'remove']),
  // S4: a macro-filled note sent to the author when their content is removed.
  message: z.string().trim().max(1000).optional(),
});

export interface ModItemDTO {
  id: string;
  entityType: 'rmhark' | 'comment';
  entityId: string | null;
  postId: string | null;
  action: 'flag' | 'hold' | 'remove';
  ruleName: string;
  snapshot: string;
  status: 'PENDING' | 'APPROVED' | 'REMOVED';
  createdAt: string;
  author: { id: string; name?: string | null; handle?: string | null; image?: string | null };
}

/* ---- N5 challenge ------------------------------------------------------ */

export const challengeCreateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(1000),
  submitEndsAt: z.string().datetime(),
  voteEndsAt: z.string().datetime(),
});

export const challengeVoteSchema = z.object({ entryId: z.string().max(64) });

/* ---- N8 sisters -------------------------------------------------------- */

export const SISTERS_MAX = 5;
export const sistersSetSchema = z.object({
  slugs: z.array(z.string().trim().toLowerCase().min(1).max(64)).max(SISTERS_MAX),
});

export interface SisterDTO {
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  memberCount: number;
  /** The other community links back. */
  mutual: boolean;
}

/* ---- the lazy "extras" bundle ------------------------------------------ */

export interface PostingStatusDTO {
  ok: boolean;
  reason?: 'email' | 'account_age' | 'member_age';
  remainingMs?: number | null;
  value?: number;
  message?: string;
}

export interface CommunityExtrasDTO {
  flairs: FlairDTO[];
  flairRequired: boolean;
  starThreshold: number;
  verification: { level: (typeof VERIFICATION_LEVELS)[number]; value: number };
  /** Whether the viewer may post right now (S2). Mods always can. */
  posting: PostingStatusDTO;
  sisters: SisterDTO[];
  /** Present for members only. */
  member: {
    followedFlairIds: string[];
    roleTags: string[];
    /** Onboarding questions the member has not answered yet. */
    onboarding: OnboardingQuestionDTO[];
  } | null;
}

/* ---- N5 / N6 wire shapes ------------------------------------------------ */

export interface ChallengeEntryDTO {
  id: string;
  postId: string;
  author:
    { id: string; name?: string | null; handle?: string | null; image?: string | null } | undefined;
  content: string;
  imageUrl: string | null;
  imageAlt: string | null;
  gifUrl: string | null;
  /** Only revealed once voting has ended, so the tally doesn't steer the vote. */
  voteCount: number | null;
  mine: boolean;
  isWinner: boolean;
}

export interface ChallengeDTO {
  id: string;
  title: string;
  prompt: string;
  submitEndsAt: string;
  voteEndsAt: string;
  phase: ChallengePhase;
  winnerEntryId: string | null;
  myEntryId: string | null;
  myVoteEntryId: string | null;
  entries: ChallengeEntryDTO[];
}

export interface CensusDTO {
  id: string;
  title: string;
  description: string | null;
  closesAt: string | null;
  closed: boolean;
  /** Participation only — never a live tally. */
  responseCount: number;
  answered: boolean;
  /** The questions, while the census is open and the viewer can still answer. */
  questions: CensusQuestion[] | null;
  /** Aggregate results; present only when closed with enough responses. */
  results: CensusResultQuestion[] | null;
  minResponses: number;
  /** Closed, but too few responses to publish. */
  withheld: boolean;
}
