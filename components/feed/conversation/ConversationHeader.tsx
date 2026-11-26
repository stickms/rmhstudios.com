import { lazy } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrivalSuspense } from '@/components/ui/arrive';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { CallButton } from '@/components/call/CallButton';
import { GroupCallButton } from '@/components/groupcall/GroupCallButton';
import { ChatHeaderPlus } from '@/components/chat-plus/ChatHeaderPlus';
import { ChatPinnedBar } from '@/components/chat-plus/ChatPinnedBar';
import { SavedMessagesHeader } from '@/components/chat-plus/SavedMessagesRow';
import { AutomatedBadge } from '@/components/feed/AutomatedBadge';
import { MuteConversationControl, MutedUntilHeaderLine } from '@/components/messages/MuteConversationControl';
import { PinConversationItem } from '@/components/messages/PinConversationItem';
import { Handle } from '@/components/ui/handle';
import type { OtherUser } from './conversation-state';

// P4 — "It's 2:14 AM for Ana": a tiny lazy chunk, fetched after the header is idle.
const DmLocalTime = lazy(() => import('@/components/profile/plus/LocalTime'));

// s06-18: "Away until 3 Dec", a lazy chunk like the local time (it needs the query client, which a server render of the header does not have).
const AwayLine = lazy(() =>
  import('@/components/messages/AwayLine').then((m) => ({ default: m.AwayStatusLine })),
);

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
      <div className="conversation__head flex-wrap">
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
            className="flex min-w-0 flex-1 items-center gap-2.5"
          >
            <UserAvatar
              src={otherUser.image ?? undefined}
              alt={otherUser.name || 'User'}
              size={32}
              fallbackName={otherUser.name ?? undefined}
            />
            <div className="min-w-0">
              <h1 className="t-body flex min-w-0 items-center gap-2 font-semibold text-site-text">
                <span className="truncate">{otherUser.name || 'Unknown'}</span>
                {otherUser.isBot && <AutomatedBadge />}
              </h1>
              {otherUser.username && <p className="t-meta truncate"><Handle handle={otherUser.username} /></p>}
              <ArrivalSuspense>
                <DmLocalTime userId={otherUser.id} name={otherUser.name || 'Unknown'} />
                <AwayLine userId={otherUser.id} context="header" />
              </ArrivalSuspense>
              <MutedUntilHeaderLine conversationId={conversationId} />
            </div>
          </Link>
        )}
        {/* Voice call. Renders nothing when a call can't be placed (signed out, no WebRTC); the server is still the
            authority on whether this person accepts calls from you. On a phone these controls take their own row under
            the name: with 44px touch targets, five controls and the back button leave the name no room on one line. The
            chat settings are the row's last item, so the tab order is the order on screen. */}
        {otherUser && !isSavedChat && (
          <div className="order-last flex basis-full justify-end gap-2 sm:order-none sm:ms-auto sm:basis-auto">
            <PinConversationItem conversationId={conversationId} />
            <MuteConversationControl conversationId={conversationId} />
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
            <ChatHeaderPlus chat={chatRef} />
          </div>
        )}
        {(isSavedChat || !otherUser) && <ChatHeaderPlus chat={chatRef} className="ms-auto" />}
      </div>
      <ChatPinnedBar
        chat={chatRef}
        viewerId={viewerId}
        names={otherUser ? { [otherUser.id]: otherUser.name } : {}}
      />
    </>
  );
}
