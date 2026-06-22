'use client';

import { useState } from 'react';
import { MessageCircle, Users, Bell } from 'lucide-react';
import { MobileMenuButton } from './MobileMenuButton';
import { MobileBrandPrefix } from './MobileHeader';
import { useSession } from '@/components/Providers';
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
export function InboxColumn({ initialTab = 'messages' }: { initialTab?: InboxTab }) {
  const [tab, setTab] = useState<InboxTab>(initialTab);
  const { data: session } = useSession();
  const unreadMessages = useUnreadCount(!!session);
  const { count: unreadNotifications } = useNotificationCount(!!session);

  const tabs: { id: InboxTab; label: string; icon: typeof MessageCircle; badge?: number }[] = [
    { id: 'messages', label: 'Messages', icon: MessageCircle, badge: unreadMessages },
    { id: 'groups', label: 'Groups', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Shared header + tab switcher */}
      <div className="sticky top-0 z-10 bg-site-bg/85 backdrop-blur-md border-b border-site-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <MobileMenuButton />
          <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 min-w-0">
            <MobileBrandPrefix />
            Inbox
          </h1>
        </div>
        <div className="flex items-center gap-1 px-2 pb-2" role="tablist" aria-label="Inbox sections">
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
                className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'text-site-accent bg-site-accent-dim'
                    : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{t.label}</span>
                {t.badge && t.badge > 0 ? (
                  <span className="flex items-center justify-center min-w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                    {t.badge > 99 ? '99+' : t.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active section */}
      <div className="flex-1 min-h-0">
        {tab === 'messages' && <MessagesColumn embedded />}
        {tab === 'groups' && <GroupChatsColumn embedded />}
        {tab === 'notifications' && <NotificationsColumn embedded />}
      </div>
    </div>
  );
}
