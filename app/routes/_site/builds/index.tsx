/**
 * /builds — legacy path.
 *
 * The standalone Builds gallery was folded into the unified Creator Studio
 * (/studio). This route now just forwards to the Studio's Builds tab so the
 * many in-app "← Builds" back-links and existing bookmarks keep working.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/builds/')({
  beforeLoad: () => {
    throw redirect({ to: '/create', search: { tab: 'builds' } });
  },
});
