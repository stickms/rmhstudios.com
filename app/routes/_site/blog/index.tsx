/**
 * Blog Index Route
 *
 * The blog archive has been merged into the Library page (devlog entries now
 * lead the library as a horizontally-scrolling row). This route redirects to
 * /library so old links and the former nav entry land in the right place.
 * Individual entries still live at /blog/$slug.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/blog/')({
  beforeLoad: () => {
    throw redirect({ to: '/library' });
  },
});
