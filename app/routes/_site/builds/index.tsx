/**
 * /builds — legacy path.
 *
 * The standalone Builds gallery was folded into the unified Creator Studio
 * (/create) and later split into separate Games / Apps / User Builds tabs. This
 * route now forwards to the Studio's Games tab so the many in-app "← Builds"
 * back-links and existing bookmarks keep working.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/builds/')({
  beforeLoad: () => {
    throw redirect({ to: '/create', search: { tab: 'games' } });
  },
});
