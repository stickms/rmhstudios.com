/**
 * /notifications — merged into the Inbox.
 *
 * Notifications are the third tab of /messages (alongside Messages and Groups),
 * so the standalone page was a second door onto the same room and the rail
 * entry that pointed at it is gone. This route redirects to that tab, which
 * keeps every existing link working: the `g n` keyboard shortcut, the command
 * palette, the top bar's bell panel rows, and the links stored on individual
 * notification records.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/notifications')({
  beforeLoad: () => {
    throw redirect({ to: '/messages', search: { tab: 'notifications' } });
  },
});
