/**
 * /settings/circle — folded into /settings/privacy#close-friends (settings simplification, 2026-11-17): it was one panel on a page of its own.
 * The URL stays so bookmarks and support links still land on the section.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/settings/circle')({
  head: () => ({
    meta: [{ title: 'Close Friends | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  beforeLoad: () => {
    throw redirect({ to: '/settings/privacy', hash: 'close-friends', replace: true });
  },
});
