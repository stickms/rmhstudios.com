/**
 * /arcade — merged into /create.
 *
 * The Arcade Pass (daily challenges + the player leaderboard) is now a section
 * of the Games tab of Create, sitting directly under Ranked, and Arcade is no
 * longer its own nav wedge. This route redirects so old links, the command
 * palette entry, and `/leaderboard` still land on the right surface —
 * `?tab=leaderboard` carries over as the section's `?sub=`.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

type LegacyArcadeTab = 'challenges' | 'leaderboard';

export const Route = createFileRoute('/_site/arcade')({
  validateSearch: (search: Record<string, unknown>): { tab?: LegacyArcadeTab } =>
    search.tab === 'leaderboard' || search.tab === 'challenges'
      ? { tab: search.tab as LegacyArcadeTab }
      : {},
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/games',
      search: search.tab === 'leaderboard' ? { sub: 'leaderboard' } : {},
    });
  },
});
