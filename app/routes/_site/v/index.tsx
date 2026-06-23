/**
 * /v — legacy path.
 *
 * The standalone Pages (RMHVibe) gallery was folded into the unified Creator
 * Studio (/studio). This route forwards to the Studio's Pages tab so existing
 * links and bookmarks keep working. The /v/$slug viewer and /v/new generator
 * remain their own full-screen routes.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/v/')({
  beforeLoad: () => {
    throw redirect({ to: '/create', search: { tab: 'pages' } });
  },
});
