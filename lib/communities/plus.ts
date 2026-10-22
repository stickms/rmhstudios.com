/**
 * Communities-plus (N1–N8, S2): shared limits, flair presets and wire shapes.
 * Client-safe — no Prisma, no server imports, and no zod: the flair chip is on
 * every feed card, so this module is on the feed, tag, thread and profile
 * routes. The API input schemas are in `./plus-schema`.
 */
import type { VERIFICATION_LEVELS } from '@/lib/communities/verification';
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

/* ---- N3 onboarding ----------------------------------------------------- */

export const ONBOARDING_MAX_QUESTIONS = 5;
export const ONBOARDING_MAX_OPTIONS = 6;
export const ONBOARDING_MAX_FLAIRS_PER_OPTION = 5;

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

/* ---- N8 sisters -------------------------------------------------------- */

export const SISTERS_MAX = 5;

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
