/**
 * Inbox Route — unified Messages + Group chats + Notifications.
 *
 * Lives at /messages (the natural inbox home); the standalone /notifications and
 * /groups routes remain for deep links.
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { InboxColumn } from '@/components/feed/InboxColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { auth } from '@/lib/auth';
import { listConversations } from '@/lib/messages.server';

type InboxTab = 'messages' | 'groups' | 'notifications';

// Prefetch the Messages tab's first page of conversations server-side (the
// default tab), so the inbox is present at first paint / prefetched on intent.
const fetchInbox = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { messages: null };
  return { messages: await listConversations(session.user.id) };
});

export const Route = createFileRoute('/_site/messages/')({
  // `?tab=` lets deep links (and the back button from a group/notification view)
  // land on the right inbox section instead of always defaulting to Messages.
  validateSearch: (search: Record<string, unknown>): { tab?: InboxTab } => {
    const tab = search.tab;
    return tab === 'groups' || tab === 'notifications' || tab === 'messages' ? { tab } : {};
  },
  head: () => ({ meta: [{ title: 'Inbox | RMH Studios' }] }),
  loader: () => fetchInbox(),
  component: InboxPage,
});

function InboxPage() {
  const { tab } = Route.useSearch();
  const { messages } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <InboxColumn initialTab={tab} initialMessages={messages} />
      </AnimatedMain>

      {/* Trailing gutter to match the wide layout */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
