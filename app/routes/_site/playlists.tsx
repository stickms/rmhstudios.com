/**
 * /playlists — merged into the Library.
 *
 * Playlists now live as the "Playlists" section of the Library (the library
 * grew a sticky category navigator to keep its sections navigable). This route
 * redirects to /library?view=playlists so old links and the former nav entry
 * land in the right place.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/playlists')({
  beforeLoad: () => {
    throw redirect({ to: '/library', search: { view: 'playlists' } });
  },
});
