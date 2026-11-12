import { lazy, Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
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
      <div className="conversation__head">
        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label={t('back', { defaultValue: 'Back' })}
        >
          <Link to="/messages">
            <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
          </Link>
        </Button>
        {isSavedChat && <SavedMessagesHeader />}
        {otherUser && !isSavedChat && (
          <Link
            to={`/u/${(otherUser as { handle?: string | null }).handle || otherUser.id}` as string}
            className="flex min-w-0 items-center gap-2.5"
          >
            <UserAvatar
              src={otherUser.image ?? undefined}
              alt={otherUser.name || 'User'}
              size={32}
              fallbackName={otherUser.name ?? undefined}
            />
            <div className="min-w-0">
              <p className="t-body flex items-center gap-2 font-semibold text-site-text">
                {otherUser.name || 'Unknown'}
                {otherUser.isBot && <AutomatedBadge />}
              </p>
              {otherUser.username && <p className="t-meta">@{otherUser.username}</p>}
              <Suspense fallback={null}>
                <DmLocalTime userId={otherUser.id} name={otherUser.name || 'Unknown'} />
              </Suspense>
            </div>
          </Link>
        )}
        {/* Voice call. Renders nothing when a call can't be placed (signed out, no WebRTC); the server is still the
            authority on whether this person accepts calls from you. */}
        {otherUser && !isSavedChat && (
          <div className="ms-auto flex gap-2">
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
        <ChatHeaderPlus chat={chatRef} className={isSavedChat || !otherUser ? 'ms-auto' : ''} />
      </div>
      <ChatPinnedBar
        chat={chatRef}
        viewerId={viewerId}
        names={otherUser ? { [otherUser.id]: otherUser.name } : {}}
      />
    </>
  );
}
