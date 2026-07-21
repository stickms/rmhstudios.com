'use client';

import { useState } from 'react';
import { MessageCircle, Users, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MobileMenuButton } from './MobileMenuButton';
import { MobileBrandPrefix } from './MobileHeader';
import { useSession } from '@/components/Providers';
import { NotificationBadge } from '@/components/ui/notification-badge';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useNotificationCount } from '@/lib/useNotificationCount';
import { MessagesColumn } from './MessagesColumn';
import { GroupChatsColumn } from './GroupChatsColumn';
import { NotificationsColumn } from './NotificationsColumn';

type InboxTab = 'messages' | 'groups' | 'notifications';

/**
 * Unified Inbox — merges direct Messages, Group chats, and Notifications behind
 * a single tabbed header so they no longer need three separate sidebar entries.
 * Each tab renders its existing column in `embedded` mode (its own header is
 * suppressed in favour of this shared one).
 */
export function InboxColumn({
  initialTab = 'messages',
  initialMessages,
}: {
  initialTab?: InboxTab;
  /** Conversations prefetched by the /messages route loader for the Messages tab. */
  initialMessages?: {
    conversations: import('./MessagesColumn').ConversationItem[];
    nextCursor: string | null;
    hasMore: boolean;
  } | null;
}) {
  const [tab, setTab] = useState<InboxTab>(initialTab);
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const unreadMessages = useUnreadCount(!!session);
  const { count: unreadNotifications } = useNotificationCount(!!session);

  const tabs: { id: InboxTab; label: string; icon: typeof MessageCircle; badge?: number }[] = [
    { id: 'messages', label: t('inbox-tab-messages', { defaultValue: 'Messages' }), icon: MessageCircle, badge: unreadMessages },
    { id: 'groups', label: t('inbox-tab-groups', { defaultValue: 'Groups' }), icon: Users },
    { id: 'notifications', label: t('inbox-tab-notifications', { defaultValue: 'Notifications' }), icon: Bell, badge: unreadNotifications },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Shared header + tab switcher */}
      <div className="sticky top-2 z-10 mx-2 rounded-site glass-chrome shadow-site-sm md:top-3 md:mx-3">
        <div className="flex items-center gap-3 px-4 py-3">
          <MobileMenuButton />
          <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 min-w-0">
            <MobileBrandPrefix />
            {t('inbox-title', { defaultValue: 'Inbox' })}
          </h1>
        </div>
        <div className="flex items-center gap-1 px-2 pb-2" role="tablist" aria-label={t('inbox-sections-label', { defaultValue: 'Inbox sections' })}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`relative flex flex-1 items-center justify-center gap-2 rounded-site px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'text-site-accent bg-site-accent-dim'
                    : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{t.label}</span>
                <NotificationBadge count={t.badge ?? 0} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Active section */}
      <div className="flex-1 min-h-0">
        {tab === 'messages' && <MessagesColumn embedded initialData={initialMessages} />}
        {tab === 'groups' && <GroupChatsColumn embedded />}
        {tab === 'notifications' && <NotificationsColumn embedded />}
      </div>
    </div>
  );
}
