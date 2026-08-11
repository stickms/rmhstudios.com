/**
 * /leaderboard — merged into /create.
 *
 * The standalone leaderboard became the "Leaderboard" tab of the Arcade page,
 * and the Arcade page in turn became the Arcade Pass section of Create's Games
 * tab. This route redirects straight to that board so old links and the former
 * nav entry skip the intermediate hop.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/leaderboard')({
  beforeLoad: () => {
    throw redirect({ to: '/games', search: { sub: 'leaderboard' } });
  },
});
