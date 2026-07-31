/**
 * Inbox Route — unified Messages + Group chats + Notifications.
 *
 * Lives at /messages (the natural inbox home). /notifications now redirects to
 * `?tab=notifications` here rather than rendering its own page; /groups remains
 * for deep links.
 */

import { useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useTranslation } from 'react-i18next';
import { InboxColumn, type InboxTab } from '@/components/feed/InboxColumn';
import { PageLayout } from '@/components/feed/PageLayout';
import { auth } from '@/lib/auth';
import { listConversations } from '@/lib/messages.server';

// Prefetch the Messages tab's first page of conversations server-side (the
// default tab), so the inbox is present at first paint / prefetched on intent.
const fetchInbox = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { messages: null };
  return { messages: await listConversations(session.user.id) };
});

export const Route = createFileRoute('/_site/messages/')({
  // `?tab=` is the single source of truth for the active inbox section, so deep
  // links (/notifications, the bell panel's "All notifications", the back button
  // from a group or notification view) land on the right one — including when
  // the inbox is already on screen and only the search param changes.
  validateSearch: (search: Record<string, unknown>): { tab?: InboxTab } => {
    const tab = search.tab;
    return tab === 'groups' || tab === 'notifications' || tab === 'messages' ? { tab } : {};
  },
  head: () => ({ meta: [{ title: 'Inbox | RMH Studios' }] }),
  loader: () => fetchInbox(),
  component: InboxPage,
});

function InboxPage() {
  const { t } = useTranslation('feed');
  const { tab = 'messages' } = Route.useSearch();
  const { messages } = Route.useLoaderData();
  const navigate = useNavigate();

  const setTab = useCallback(
    (next: InboxTab) => {
      void navigate({ to: '/messages', search: { tab: next }, replace: true });
    },
    [navigate],
  );

  return (
    <PageLayout
      title={t('inbox-title', { defaultValue: 'Inbox' })}
      description={t('inbox-subtitle', {
        defaultValue: 'Direct messages, group chats and everything you have been notified about.',
      })}
    >
      <InboxColumn tab={tab} onTabChange={setTab} initialMessages={messages} />
    </PageLayout>
  );
}
