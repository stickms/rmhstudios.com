/**
 * /rmhmusic/$roomId — legacy redirect.
 *
 * RMHMusic used to be a Spotify listening-party app addressed by room code
 * (`/rmhmusic/ABC123`, plus `/rmhmusic/player`). It is now a piano & guitar
 * learning app, so old bookmarks and shared room links land on its home
 * instead of a 404. The redirect is temporary (307), not permanent: this single
 * segment catch-all may be shadowed by real routes in later phases (e.g.
 * `/rmhmusic/practice`) and browsers must not cache the bounce. The lesson
 * route (`/rmhmusic/lesson/$lessonId`) is a more specific static-prefix route
 * and is matched before this one.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/rmhmusic/$roomId')({
  beforeLoad: () => {
    throw redirect({ to: '/rmhmusic', statusCode: 307 });
  },
});
