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

type InboxTab = 'messages' | 'groups' | 'notifications';

export const Route = createFileRoute('/_site/messages/')({
  // `?tab=` lets deep links (and the back button from a group/notification view)
  // land on the right inbox section instead of always defaulting to Messages.
  validateSearch: (search: Record<string, unknown>): { tab?: InboxTab } => {
    const tab = search.tab;
    return tab === 'groups' || tab === 'notifications' || tab === 'messages' ? { tab } : {};
  },
  head: () => ({ meta: [{ title: 'Inbox | RMH Studios' }] }),
  component: InboxPage,
});

function InboxPage() {
  const { tab } = Route.useSearch();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <InboxColumn initialTab={tab} />
      </AnimatedMain>

      {/* Trailing gutter to match the wide layout */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
