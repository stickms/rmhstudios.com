import { lazy, Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { CallButton } from '@/components/call/CallButton';
import { GroupCallButton } from '@/components/groupcall/GroupCallButton';
import { ChatHeaderPlus } from '@/components/chat-plus/ChatHeaderPlus';
import { ChatPinnedBar } from '@/components/chat-plus/ChatPinnedBar';
import { SavedMessagesHeader } from '@/components/chat-plus/SavedMessagesRow';
import { AutomatedBadge } from '@/components/feed/AutomatedBadge';
import type { OtherUser } from './conversation-state';

// P4 — "It's 2:14 AM for Ana": a tiny lazy chunk, fetched after the header is idle.
const DmLocalTime = lazy(() => import('@/components/profile/plus/LocalTime'));

/** The sticky thread header (who, calls, per-chat extras) and the pinned-message bar. */
export function ConversationHeader({
  conversationId,
  chatRef,
  otherUser,
  isSavedChat,
  viewerId,
}: {
  conversationId: string;
  chatRef: { kind: 'dm'; id: string };
  otherUser: OtherUser | null;
  isSavedChat: boolean;
  viewerId: string;
}) {
  const { t } = useTranslation('feed');
  return (
    <>
      {/* Header */}
      <div className="glass-chrome site-sticky-chrome shrink-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            to="/messages"
            aria-label={t('back', { defaultValue: 'Back' })}
            className="p-2 -ml-2 rounded-site-sm hover:bg-site-surface-hover transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-site-text" aria-hidden />
          </Link>
          {isSavedChat && <SavedMessagesHeader />}
          {otherUser && !isSavedChat && (
            <Link
              to={
                `/u/${(otherUser as { handle?: string | null }).handle || otherUser.id}` as string
              }
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <UserAvatar
                src={otherUser.image ?? undefined}
                alt={otherUser.name || 'User'}
                size={32}
                fallbackName={otherUser.name ?? undefined}
                className="ring-2 ring-site-bg"
              />
              <div>
                <p className="flex items-center gap-2 font-display font-bold text-sm text-site-text">
                  {otherUser.name || 'Unknown'}
                  {otherUser.isBot && <AutomatedBadge />}
                </p>
                {otherUser.username && (
                  <p className="text-xs text-site-text-muted">@{otherUser.username}</p>
                )}
                <Suspense fallback={null}>
                  <DmLocalTime userId={otherUser.id} name={otherUser.name || 'Unknown'} />
                </Suspense>
              </div>
            </Link>
          )}
          {/* Voice call. Renders nothing when a call can't be placed (signed out,
              no WebRTC); the server is still the authority on whether this person
              accepts calls from you. */}
          {otherUser && !isSavedChat && (
            <div className="ml-auto flex gap-2">
              <CallButton
                user={{
                  id: otherUser.id,
                  name: otherUser.name ?? null,
                  image: otherUser.image ?? null,
                  handle: (otherUser as { handle?: string | null }).handle ?? null,
                }}
                conversationId={conversationId}
                viewerId={viewerId ?? null}
              />
              <GroupCallButton
                conversationId={conversationId}
                viewerId={viewerId ?? null}
                seedUser={{
                  id: otherUser.id,
                  name: otherUser.name ?? null,
                  handle: (otherUser as { handle?: string | null }).handle ?? null,
                  image: otherUser.image ?? null,
                }}
              />
            </div>
          )}
          <ChatHeaderPlus chat={chatRef} className={isSavedChat || !otherUser ? 'ml-auto' : ''} />
        </div>
      </div>
      <ChatPinnedBar
        chat={chatRef}
        viewerId={viewerId}
        names={otherUser ? { [otherUser.id]: otherUser.name } : {}}
      />
    </>
  );
}
