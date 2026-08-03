/**
 * /studio/themes — legacy redirect to /settings/themes.
 *
 * Theme authoring moved into the settings tree, where it sits beside the theme
 * gallery and accent picker it feeds. `/studio` otherwise belongs to the music
 * DAW, so this was the one settings surface the settings hub could not link
 * without sending people out of the tree — and so it linked nothing at all.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/studio/themes')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/themes' });
  },
});
