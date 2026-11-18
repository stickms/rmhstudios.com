/**
 * /settings/account-status — folded into /settings/security#account-status (settings simplification, 2026-11-17): it was one panel on a page of its own.
 * The URL stays so bookmarks and support links still land on the section.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/settings/account-status')({
  head: () => ({
    meta: [{ title: 'Account status | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  beforeLoad: () => {
    throw redirect({ to: '/settings/security', hash: 'account-status', replace: true });
  },
});
