/**
 * /personas — legacy path.
 *
 * The standalone AI Personas gallery was folded into the unified Creator Studio
 * (/studio). This route forwards to the Studio's Personas tab so existing links
 * and bookmarks keep working. The /personas/$id chat view remains its own route.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/personas/')({
  beforeLoad: () => {
    throw redirect({ to: '/create', search: { tab: 'personas' } });
  },
});
