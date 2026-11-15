import { useTranslation } from 'react-i18next';
import { ChatRichBody } from '@/components/chat-plus/ChatRichBody';
import { ChatSystemLine } from '@/components/chat-plus/ChatSystemLine';
import { MessageBadges, ThreadChip } from '@/components/chat-plus/MessageBadges';
import { GroupMessageMenu } from '@/components/chat-plus/MessagePlusItems';
import { ReactionChips } from '@/components/shared/ReactionChips';
import { groupReactions } from '@/lib/social/reactions';
import type { useItemReactionTrigger } from '@/lib/emoji/use-reaction-trigger';
import { isCardKind, isLineKind, type ChatRef } from '@/lib/chat-plus/types';
import { PostImageGrid } from '../PostImageGrid';
import { SpineItem, SpineStation } from '@/components/ui/spine';
import { cn } from '@/lib/utils';
import { memberDisplayName } from './group-chat-state';
import type { Group, Msg } from '@/lib/group-chat/types';
import { PollView } from './PollView';

const formatDay = (iso: string, t: ReturnType<typeof useTranslation>['t']) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('today', { defaultValue: 'Today' });
  if (d.toDateString() === yesterday.toDateString())
    return t('yesterday', { defaultValue: 'Yesterday' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * One message in the group thread (section 10, Conversation): a station when a new day starts, then a message from
 * someone else on the spine (their name above it), or your own right aligned in ink with no dot.
 */
export function GroupMessageRow({
  message: m,
  group,
  chatRef,
  groupId,
  currentUserId,
  prevMessage,
  pinned,
  reactionTriggerFor,
  onVote,
  onToggleReaction,
  className,
}: {
  message: Msg;
  group: Group;
  chatRef: ChatRef;
  groupId: string;
  currentUserId: string;
  /** The message above, so a new day gets a station. */
  prevMessage: Msg | null;
  pinned: boolean;
  reactionTriggerFor: ReturnType<typeof useItemReactionTrigger>;
  onVote: (messageId: string, optionIdx: number) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  /** The `arrive` class (Steel M9) for a message that joins a thread already showing. */
  className?: string | undefined;
}) {
  const { t } = useTranslation('feed');
  const mine = m.sender.id === currentUserId;
  const newDay =
    !prevMessage ||
    new Date(m.createdAt).toDateString() !== new Date(prevMessage.createdAt).toDateString();
  const station = newDay ? (
    <SpineStation className={className}>{formatDay(m.createdAt, t)}</SpineStation>
  ) : null;
  // P04: lines (timer, pin, tip…) and card kinds (dice, checklist…).
  if (isLineKind(m.kind)) {
    return (
      <>
        {station}
        <SpineItem dot={false} className={cn('spine-item--tight', className)}>
          <ChatSystemLine
            meta={m.meta}
            fallback={m.content}
            viewerId={currentUserId}
            nameOf={(uid) => memberDisplayName(group.members, uid)}
          />
        </SpineItem>
      </>
    );
  }
  const isCard = isCardKind(m.kind);
  const name = m.sender.name || m.sender.handle || t('member-fallback', { defaultValue: 'Member' });
  return (
    <>
      {station}
      <SpineItem dot={!mine} className={cn('spine-item--tight group', className)}>
        <div className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
          <div className={mine ? 'conversation__mine' : 'min-w-0'} {...reactionTriggerFor(m.id)}>
            {!mine && <p className="t-meta">{name}</p>}
            <MessageBadges forwardCount={m.forwardCount} pinned={pinned} />
            {isCard && (
              <ChatRichBody
                chat={chatRef}
                messageId={m.id}
                kind={m.kind ?? 'text'}
                meta={m.meta}
                authorName={mine ? t('you-label', { defaultValue: 'You' }) : name}
              />
            )}
            {!isCard && m.content && (
              <div
                className={`t-body whitespace-pre-wrap break-words ${mine ? 'conversation__bubble' : 'conversation__theirs'}`}
              >
                {m.content}
              </div>
            )}
            {m.imageUrls && m.imageUrls.length > 0 && (
              <PostImageGrid urls={m.imageUrls} className="mt-2 overflow-hidden rounded-site" />
            )}
            {m.gifUrl && (
              <img
                src={m.gifUrl}
                alt=""
                className="mt-2 max-h-60 w-auto rounded-site"
                loading="lazy"
              />
            )}
            {m.poll && <PollView poll={m.poll} onVote={(idx) => onVote(m.id, idx)} />}
            <ThreadChip
              groupId={groupId}
              messageId={m.id}
              count={m.replyCount ?? 0}
              className={mine ? 'ms-auto flex' : ''}
            />
            {(m.reactions?.length ?? 0) > 0 && (
              <ReactionChips
                reactions={groupReactions(m.reactions ?? [], currentUserId)}
                onToggle={(emoji) => onToggleReaction(m.id, emoji)}
                className={`mt-1 ${mine ? 'justify-end' : ''}`}
              />
            )}
          </div>
          <GroupMessageMenu
            chat={chatRef}
            message={{
              id: m.id,
              content: m.content,
              kind: m.kind,
              forwardCount: m.forwardCount,
              threadable: true,
            }}
            className="-my-2 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
          />
        </div>
      </SpineItem>
    </>
  );
}
