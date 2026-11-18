/**
 * /settings/calendar — folded into /settings/notifications#calendar (settings simplification, 2026-11-17): it was one panel on a page of its own.
 * The URL stays so bookmarks and support links still land on the section.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/settings/calendar')({
  head: () => ({
    meta: [{ title: 'Calendar | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  beforeLoad: () => {
    throw redirect({ to: '/settings/notifications', hash: 'calendar', replace: true });
  },
});
