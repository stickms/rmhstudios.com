/**
 * Profile completeness (B22). Client-safe, pure, and deliberately not stored.
 *
 * `app/routes/api/onboarding/` covers the first run. After that there is no
 * nudge toward an avatar, a bio, links, a theme or a first post — the handful
 * of actions that correlate most strongly with a new account still being here
 * next week — and no reward for doing any of them.
 *
 * Two design decisions worth stating, because both are the opposite of what the
 * obvious implementation does:
 *
 *  1. **Derived, never persisted.** A stored percentage goes stale the moment
 *     someone clears their bio, and then needs its own reconciliation job. It
 *     is six boolean checks; compute it.
 *  2. **It disappears at 100% and never comes back.** A completeness meter that
 *     is permanent is nagging. This one has an end state, and the end state is
 *     silence.
 */

export interface CompletenessSubject {
  image: string | null | undefined;
  bio: string | null | undefined;
  linkCount: number;
  postCount: number;
  followingCount: number;
  themeId: string | null | undefined;
}

export interface CompletenessStep {
  id: string;
  /** Share of the total. Weighted by how much each predicts retention. */
  weight: number;
  /** Key in the `common` namespace. */
  labelKey: string;
  /** Where the step is completed. */
  href: string;
  done: boolean;
}

/** Minimum bio length that counts. A single character is not a bio. */
const MIN_BIO_CHARS = 20;
/** Following this many accounts is roughly where a feed stops looking empty. */
const MIN_FOLLOWING = 3;

export function completenessSteps(subject: CompletenessSubject): CompletenessStep[] {
  return [
    {
      id: 'avatar',
      weight: 20,
      labelKey: 'profile-step-avatar',
      href: '/settings/profile',
      done: Boolean(subject.image),
    },
    {
      id: 'bio',
      weight: 15,
      labelKey: 'profile-step-bio',
      href: '/settings/profile',
      done: (subject.bio?.trim().length ?? 0) >= MIN_BIO_CHARS,
    },
    {
      id: 'links',
      weight: 10,
      labelKey: 'profile-step-links',
      href: '/settings/profile',
      done: subject.linkCount > 0,
    },
    {
      id: 'first-post',
      weight: 25,
      labelKey: 'profile-step-post',
      href: '/',
      done: subject.postCount > 0,
    },
    {
      id: 'follow',
      weight: 15,
      labelKey: 'profile-step-follow',
      href: '/explore',
      done: subject.followingCount >= MIN_FOLLOWING,
    },
    {
      id: 'theme',
      weight: 15,
      labelKey: 'profile-step-theme',
      href: '/settings/appearance',
      done: Boolean(subject.themeId),
    },
  ];
}

export interface Completeness {
  steps: CompletenessStep[];
  /** 0–100, rounded. */
  percent: number;
  complete: boolean;
  /** The highest-weight unfinished step — the one worth showing. */
  next: CompletenessStep | null;
}

export function completeness(subject: CompletenessSubject): Completeness {
  const steps = completenessSteps(subject);
  const total = steps.reduce((sum, s) => sum + s.weight, 0);
  const earned = steps.reduce((sum, s) => (s.done ? sum + s.weight : sum), 0);
  const percent = total > 0 ? Math.round((earned / total) * 100) : 100;

  // Surface ONE next step rather than a checklist. A list of six things to do
  // is a chore; a single suggestion is a nudge.
  const next =
    steps
      .filter((s) => !s.done)
      .sort((a, b) => b.weight - a.weight)[0] ?? null;

  return { steps, percent, complete: percent >= 100, next };
}

/**
 * Coins granted the first time a step is completed.
 *
 * Paid once per step per account, keyed by `completeness:<stepId>` in the coin
 * ledger — the grant must be idempotent or a user can toggle their bio to farm
 * it. That check belongs to the caller (`awardCoins` with a `refId`), which is
 * why this module only declares the amounts.
 */
export const STEP_REWARD_COINS: Record<string, number> = {
  avatar: 100,
  bio: 100,
  links: 50,
  'first-post': 250,
  follow: 100,
  theme: 100,
};

/** Ledger reference for a step's one-time grant. */
export function stepRewardRef(userId: string, stepId: string): string {
  return `completeness:${userId}:${stepId}`;
}
