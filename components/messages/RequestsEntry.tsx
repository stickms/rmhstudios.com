import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InboxAvatar } from '@/components/feed/InboxAvatar';
import { SpineItem } from '@/components/ui/spine';
import { useIdleReady } from '@/hooks/useIdleReady';
import { api } from '@/lib/contract/client';
import { messagesSidebarApi } from '@/lib/messages/messages-sidebar.contract';

/**
 * "Requests (n)" in the messages list (s04-16): one row above the conversations,
 * only while message requests wait. The count rides on the messages sidebar
 * payload, so the list makes no request of its own for it; the count is the text
 * of the link, so it is in the accessible name.
 */
export function RequestsEntry() {
  const { t } = useTranslation('message-requests');
  const idle = useIdleReady();
  const { data } = useQuery({
    queryKey: ['message-requests-count'],
    enabled: idle,
    staleTime: 30_000,
    queryFn: () => api(messagesSidebarApi),
  });
  const count = data?.requestCount ?? 0;
  if (count === 0) return null;

  return (
    <SpineItem dot={false} className="row-hover">
      <Link
        to="/messages/requests"
        className="flex w-full items-start gap-3 text-start after:absolute after:inset-x-0 after:-inset-y-px after:content-['']"
      >
        <InboxAvatar icon={Inbox} />
        <span className="min-w-0 flex-1">
          <span className="t-body block font-medium text-site-text">
            {t('entry-title', { count, defaultValue: 'Requests ({{count}})' })}
          </span>
          <span className="t-body block truncate text-site-text-muted">
            {t('entry-hint', { defaultValue: 'First messages from people who cannot message you directly' })}
          </span>
        </span>
      </Link>
    </SpineItem>
  );
}
