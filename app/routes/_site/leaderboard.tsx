/**
 * /leaderboard — merged into /arcade.
 *
 * The standalone leaderboard now lives as the "Leaderboard" tab of the Arcade
 * page (/arcade?tab=leaderboard). This route redirects there so old links and
 * the former nav entry land on the right tab.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/leaderboard')({
  beforeLoad: () => {
    throw redirect({ to: '/arcade', search: { tab: 'leaderboard' } });
  },
});
