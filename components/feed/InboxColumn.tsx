'use client';

import { useState } from 'react';
import { MessageCircle, Users, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MobileMenuButton } from './MobileMenuButton';
import { MobileBrandPrefix } from './MobileHeader';
import { useSession } from '@/components/Providers';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
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
      </div>

      {/* §15.1/§5.45: inbox sections as a unified sheet + flowing-capsule strip,
          standalone below the title chrome (was a flat-pill row inside it). The
          w-fit pill scrolls in the shared tab-sheet track on narrow screens. */}
      <div className="mt-3 px-2 tab-sheet-scroll md:px-3">
        <LiquidTabs
          size="sm"
          aria-label={t('inbox-sections-label', { defaultValue: 'Inbox sections' })}
          value={tab}
          onChange={(id) => setTab(id as InboxTab)}
          tabs={tabs}
        />
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
