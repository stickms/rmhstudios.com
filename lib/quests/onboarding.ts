/**
 * Onboarding v2 — the "First Week" arc (§12).
 *
 * Pure step definitions (client-safe: no Prisma, no server imports) shared by
 * the server verifier in `lib/onboarding.server.ts` and the `FirstWeekCard` UI.
 * Each step maps a platform pillar to a small coin reward. Steps unlock
 * day-by-day: step N is available when `accountAgeDays >= step.day` OR every
 * earlier step is already done (see `getFirstWeekStatus`).
 *
 * Verification lives server-side (v1 philosophy — the client can't self-report
 * its way to a reward). `href` is the spotlight/deep-link target for the card.
 */

export interface FirstWeekStep {
  /** Stable id — persisted as UserQuest.questId `fw.<id>`. Never rename. */
  id: string;
  /** Which day of the first week this step belongs to (unlock gate). */
  day: number;
  title: string;
  description: string;
  /** Coins granted once (lazily, idempotently) when the step is first done. */
  coins: number;
  /** Deep link the card sends the user to for this step. */
  href: string;
}

export const FIRST_WEEK_STEPS: FirstWeekStep[] = [
  {
    id: 'play_game',
    day: 1,
    title: 'Play a game',
    description: 'Jump into the arcade and play any game.',
    coins: 40,
    href: '/arcade',
  },
  {
    id: 'spin_wheel',
    day: 2,
    title: 'Visit your wallet & spin the wheel',
    description: 'Check your coin balance and take your daily wheel spin.',
    coins: 30,
    href: '/wallet',
  },
  {
    id: 'join_community',
    day: 3,
    title: 'Join a community',
    description: 'Find a community around something you love and join it.',
    coins: 40,
    href: '/communities',
  },
  {
    id: 'daily_puzzle',
    day: 4,
    title: 'Try a daily puzzle',
    description: 'Solve one of today’s daily puzzles.',
    coins: 40,
    href: '/daily',
  },
  {
    id: 'customize_profile',
    day: 5,
    title: 'Customize your profile',
    description: 'Add a bio, display name, or avatar so people know it’s you.',
    coins: 30,
    href: '/settings/profile',
  },
  {
    id: 'send_dm',
    day: 6,
    title: 'Send a DM or party invite',
    description: 'Start a conversation — send someone a direct message.',
    coins: 40,
    href: '/messages',
  },
  {
    id: 'daily_checkin',
    day: 7,
    title: 'Do a daily check-in',
    description: 'Check in to start your streak and cap off your first week.',
    coins: 50,
    href: '/achievements',
  },
];

/** Sum of all per-step rewards — handy for the card's "earn up to N" copy. */
export const FIRST_WEEK_STEP_COINS_TOTAL = FIRST_WEEK_STEPS.reduce((s, x) => s + x.coins, 0);

/** UserQuest bookkeeping for the arc (rows live alongside daily/weekly quests). */
export const FIRST_WEEK_PERIOD_KEY = 'onboarding';
export const firstWeekQuestId = (stepId: string) => `fw.${stepId}`;
