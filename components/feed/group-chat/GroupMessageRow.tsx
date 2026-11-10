import { m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { APPLE_SPRING } from '@/lib/motion';
import { ChatRichBody } from '@/components/chat-plus/ChatRichBody';
import { ChatSystemLine } from '@/components/chat-plus/ChatSystemLine';
import { MessageBadges, ThreadChip } from '@/components/chat-plus/MessageBadges';
import { GroupMessageMenu } from '@/components/chat-plus/MessagePlusItems';
import { ReactionChips } from '@/components/shared/ReactionChips';
import { groupReactions } from '@/lib/social/reactions';
import type { useItemReactionTrigger } from '@/lib/emoji/use-reaction-trigger';
import { isCardKind, isLineKind, type ChatRef } from '@/lib/chat-plus/types';
import { PostImageGrid } from '../PostImageGrid';
import { UserAvatar } from '../UserAvatar';
import { memberDisplayName, type Group, type Msg } from './group-chat-state';
import { PollView } from './PollView';

/** One message in the group thread: a centred line, or an avatar + bubble row. */
export function GroupMessageRow({
  message: m,
  group,
  chatRef,
  groupId,
  currentUserId,
  animateIn,
  pinned,
  reactionTriggerFor,
  onVote,
  onToggleReaction,
}: {
  message: Msg;
  group: Group;
  chatRef: ChatRef;
  groupId: string;
  currentUserId: string;
  animateIn: boolean;
  pinned: boolean;
  reactionTriggerFor: ReturnType<typeof useItemReactionTrigger>;
  onVote: (messageId: string, optionIdx: number) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
}) {
  const { t } = useTranslation('feed');
  const mine = m.sender.id === currentUserId;
  // P04: centred lines (timer, pin, tip…) and card kinds (dice, checklist…).
  if (isLineKind(m.kind)) {
    return (
      <ChatSystemLine
        meta={m.meta}
        fallback={m.content}
        viewerId={currentUserId}
        nameOf={(uid) => memberDisplayName(group.members, uid)}
      />
    );
  }
  const isCard = isCardKind(m.kind);
  return (
    <motion.div
      initial={animateIn ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={APPLE_SPRING.snappy}
      className={`group flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}
    >
      {/* Show the sender's avatar on every message — including your own
          (right-aligned), matching the 1:1 chat layout. */}
      <UserAvatar user={m.sender} />
      <div className="max-w-[78%]" {...reactionTriggerFor(m.id)}>
        {!mine && (
          <p className="mb-0.5 px-1 text-xs text-site-text-dim">
            {m.sender.name || m.sender.handle || t('member-fallback', { defaultValue: 'Member' })}
          </p>
        )}
        <MessageBadges forwardCount={m.forwardCount} pinned={pinned} />
        {isCard && (
          <ChatRichBody
            chat={chatRef}
            messageId={m.id}
            kind={m.kind ?? 'text'}
            meta={m.meta}
            authorName={
              mine
                ? t('you-label', { defaultValue: 'You' })
                : m.sender.name ||
                  m.sender.handle ||
                  t('member-fallback', { defaultValue: 'Member' })
            }
          />
        )}
        {!isCard && m.content && (
          // Received bubbles use a high-contrast light fill so they read
          // clearly against the black chat background; sent bubbles keep
          // the accent colour. (`bg-site-text` is theme-adaptive.)
          <div
            className={`whitespace-pre-wrap break-words rounded-site px-3 py-2 text-sm ${mine ? 'bg-site-accent text-(--site-accent-fg)' : 'bg-site-text text-site-bg'}`}
          >
            {m.content}
          </div>
        )}
        {m.imageUrls && m.imageUrls.length > 0 && (
          <PostImageGrid urls={m.imageUrls} className="mt-2 overflow-hidden rounded-site-sm" />
        )}
        {m.gifUrl && (
          <img
            src={m.gifUrl}
            alt=""
            className="mt-2 max-h-60 w-auto rounded-site-sm"
            loading="lazy"
          />
        )}
        {m.poll && <PollView poll={m.poll} onVote={(idx) => onVote(m.id, idx)} />}
        <ThreadChip
          groupId={groupId}
          messageId={m.id}
          count={m.replyCount ?? 0}
          className={mine ? 'ml-auto flex' : ''}
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
        className="md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      />
    </motion.div>
  );
}
