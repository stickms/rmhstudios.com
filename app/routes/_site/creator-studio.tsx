/**
 * /creator-studio — redirect stub.
 *
 * The standalone monetization dashboard (nav-labeled "Studio") was merged into
 * the `/create` Creator Studio page's Earnings tab (its overview stats,
 * earnings-by-source breakdown, recent tips, and tier editor now render via
 * <StudioDashboard/> above the redemption form). This route now redirects to
 * that surface so old links keep working.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/creator-studio')({
  beforeLoad: () => {
    throw redirect({ to: '/create', search: { tab: 'earnings' } });
  },
});
