/**
 * /psychology — legacy redirect.
 *
 * The psychology research page is now the Psychology & Behaviour section of
 * RMH Research, at /rmh-research/psychology, with the same entries, credits and
 * licence lines. This route redirects so old links, bookmarks and the former
 * nav entry land there.
 *
 * It is a redirect and not a second copy of the page, so the two URLs can
 * never drift apart or assert canonicity against each other.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/psychology')({
  beforeLoad: () => {
    throw redirect({
      to: '/rmh-research/psychology',
    });
  },
});
