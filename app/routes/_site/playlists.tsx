/**
 * /playlists — merged into the Library.
 *
 * Music playlists now live as the "Music" section of the Library (the library
 * grew a sticky category navigator to keep its sections navigable). This route
 * redirects to /library?view=music so old links and the former nav entry land
 * in the right place.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/playlists')({
  beforeLoad: () => {
    throw redirect({ to: '/library', search: { view: 'music' } });
  },
});
