import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FindATimeLink } from '@/components/calendar/FindATimeLink';
import { ChatHeaderPlus } from '@/components/chat-plus/ChatHeaderPlus';
import { GroupInfoDialog } from './GroupInfoDialog';
import type { ChatRef } from '@/lib/chat-plus/types';
import type { Group } from '@/lib/group-chat/types';

export function GroupHeader({
  group,
  chatRef,
  currentUserId,
  onLeave,
  onChanged,
}: {
  group: Group;
  chatRef: ChatRef;
  currentUserId: string;
  onLeave: () => void;
  /** Reload the group after the info dialog changed it. */
  onChanged: () => void | Promise<void>;
}) {
  const { t } = useTranslation('feed');
  return (
    <header className="conversation__head">
      <Button asChild variant="ghost" size="icon" aria-label={t('back', { defaultValue: 'Back' })}>
        <Link to="/messages" search={{ tab: 'groups' }}>
          <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
        </Link>
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="t-body truncate font-semibold text-site-text">
          <GroupInfoDialog
            group={group}
            currentUserId={currentUserId}
            onChanged={onChanged}
            onLeave={onLeave}
          />
        </h1>
        <p className="t-meta truncate">
          {t('member-count', { count: group.members.length, defaultValue: '{{count}} members' })}
        </p>
      </div>
      <FindATimeLink groupChatId={group.id} />
      <ChatHeaderPlus chat={chatRef} />
      <Button
        variant="ghost"
        size="icon"
        onClick={onLeave}
        title={t('leave-group', { defaultValue: 'Leave group' })}
        aria-label={t('leave-group', { defaultValue: 'Leave group' })}
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </header>
  );
}
