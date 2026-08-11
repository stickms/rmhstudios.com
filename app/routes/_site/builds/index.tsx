/**
 * /builds — legacy path.
 *
 * The standalone Builds gallery was folded into the unified Create (/create),
 * then split into Games / Apps / User Builds tabs, and the catalogs finally
 * moved out to their own indexable pages. This route forwards straight to
 * `/games` so the many in-app "← Builds" back-links and existing bookmarks keep
 * working — it used to point at `/create?tab=games`, which is now itself a
 * redirect to `/games`, and a redirect to a redirect is a wasted round trip.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/builds/')({
  beforeLoad: () => {
    throw redirect({ to: '/games' });
  },
});
