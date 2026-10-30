/**
 * /leaderboard — the Leaderboard tab of the Arcade page.
 *
 * Redirects straight to that board so old links and the former nav entry land on it.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/leaderboard')({
  beforeLoad: () => {
    throw redirect({ to: '/arcade', search: { sub: 'leaderboard' } });
  },
});
