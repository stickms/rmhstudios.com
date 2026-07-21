/**
 * /market — legacy redirect.
 *
 * The player-to-player marketplace has been merged into /store as the "Market"
 * tab. This route redirects so old links and the former nav entry land there.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/market')({
  beforeLoad: () => {
    throw redirect({ to: '/store', search: { tab: 'market' } });
  },
});
