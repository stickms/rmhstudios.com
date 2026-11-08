/**
 * /music-trivia — legacy redirect.
 *
 * Guess the Song was part of the retired RMHMusic listening-party app. RMHMusic
 * is now a piano & guitar learning app; old links land on its home.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/music-trivia')({
  beforeLoad: () => {
    throw redirect({ to: '/rmhmusic', statusCode: 301 });
  },
});
