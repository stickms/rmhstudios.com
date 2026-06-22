/**
 * Inbox Route — unified Messages + Group chats + Notifications.
 *
 * Lives at /messages (the natural inbox home); the standalone /notifications and
 * /groups routes remain for deep links.
 */

import { createFileRoute } from '@tanstack/react-router';
import { InboxColumn } from '@/components/feed/InboxColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

export const Route = createFileRoute('/_site/messages/')({
  head: () => ({ meta: [{ title: 'Inbox | RMH Studios' }] }),
  component: InboxPage,
});

function InboxPage() {
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <InboxColumn />
      </AnimatedMain>

      {/* Trailing gutter to match the wide layout */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
