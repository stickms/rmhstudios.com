import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, LogOut, Users } from 'lucide-react';
import { FindATimeLink } from '@/components/calendar/FindATimeLink';
import { ChatHeaderPlus } from '@/components/chat-plus/ChatHeaderPlus';
import type { ChatRef } from '@/lib/chat-plus/types';
import type { Group } from './group-chat-state';

export function GroupHeader({
  group,
  chatRef,
  onLeave,
}: {
  group: Group;
  chatRef: ChatRef;
  onLeave: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <header className="glass-chrome site-sticky-chrome flex items-center gap-3 px-4 py-3">
      <Link
        to="/messages"
        search={{ tab: 'groups' }}
        aria-label={t('back', { defaultValue: 'Back' })}
        className="-ml-2 rounded-site-sm p-2 text-site-text-dim hover:bg-site-surface-hover hover:text-site-text"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden />
      </Link>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-site-accent/12 text-site-accent">
        <Users className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-site-text">{group.name}</p>
        <p className="truncate text-xs text-site-text-dim">
          {t('member-count', { count: group.members.length, defaultValue: '{{count}} members' })}
        </p>
      </div>
      <FindATimeLink groupChatId={group.id} />
      <ChatHeaderPlus chat={chatRef} />
      <button
        onClick={onLeave}
        className="text-site-text-dim hover:text-site-danger"
        title={t('leave-group', { defaultValue: 'Leave group' })}
        aria-label={t('leave-group', { defaultValue: 'Leave group' })}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </header>
  );
}
