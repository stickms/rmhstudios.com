import { Reply } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SwipeRow } from '@/components/ui/swipe-row';
import { SpineItem, SpineStation } from '@/components/ui/spine';
import { cn } from '@/lib/utils';
import { PostImageGrid } from '../PostImageGrid';
import ChatMediaEmbed, {
  stripEmbedUrls,
  extractMediaEmbeds,
} from '@/components/shared/ChatMediaEmbed';
import { ReactionChips } from '@/components/shared/ReactionChips';
import { groupReactions } from '@/lib/social/reactions';
import { MessageActions } from '@/components/messages/MessageActions';
import { MessageEditor } from '@/components/messages/MessageEditor';
import { DeletedMessage } from '@/components/messages/DeletedMessage';
import { VoicePlayer } from '@/components/voice/VoicePlayer';
import { ChatSystemLine } from '@/components/chat-plus/ChatSystemLine';
import { ChatRichBody } from '@/components/chat-plus/ChatRichBody';
import { MessageBadges, SeenIndicator } from '@/components/chat-plus/MessageBadges';
import { MessagePlusItems } from '@/components/chat-plus/MessagePlusItems';
import { isCardKind, isLineKind } from '@/lib/chat-plus/types';
import {
  dateSeparatorKind,
  formatTime,
  isTempId,
  shouldShowDateSeparator,
  type Message,
  type OtherUser,
} from './conversation-state';

/**
 * One entry in the thread (section 10, Conversation). A day that starts here is a station; a message from the other
 * person hangs on the spine with a dot; your own is right aligned with an ink fill and no dot. Then the actions,
 * reactions and "Seen".
 */
export function MessageRow({
  msg,
  prevMsg,
  viewerId,
  otherUser,
  isSavedChat,
  isLastOwn,
  pinned,
  chatRef,
  isEditing,
  savingEdit,
  reactionTriggerFor,
  quoteReply,
  onSaveEdit,
  setEditingId,
  onUnsend,
  onHide,
  onToggleReaction,
  className,
}: {
  msg: Message;
  prevMsg: Message | null;
  viewerId: string;
  otherUser: OtherUser | null;
  isSavedChat: boolean;
  /** This is the viewer's latest message — the one that carries "Seen". */
  isLastOwn: boolean;
  pinned: boolean;
  chatRef: { kind: 'dm'; id: string };
  isEditing: boolean;
  savingEdit: boolean;
  reactionTriggerFor: (id: string) => object;
  quoteReply: (content: string) => void;
  onSaveEdit: (messageId: string, value: string) => void;
  setEditingId: (id: string | null) => void;
  onUnsend: (messageId: string) => void;
  onHide: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  /** The `arrive` class (Steel M9) for a message that joins a thread already showing. */
  className?: string | undefined;
}) {
  const { t } = useTranslation('feed');

  const formatDateSeparator = (dateStr: string) => {
    const label = dateSeparatorKind(dateStr);
    if (label.kind === 'today') return t('today', { defaultValue: 'Today' });
    if (label.kind === 'yesterday') return t('yesterday', { defaultValue: 'Yesterday' });
    return label.text;
  };

  const isSelf = msg.senderId === viewerId;
  const showDate = shouldShowDateSeparator(msg, prevMsg);

  const deleted = !!msg.deletedAt;
  const isVoice = !!msg.audioUrl && !deleted;
  // A tombstone has nothing to react to, and an optimistic message has
  // no server id yet — neither takes the long-press/right-click menu.
  const canReact = !deleted && !isTempId(msg.id);
  // P04: centred lines (timer, pin, tip…) and card kinds (dice, checklist…).
  const isLine = isLineKind(msg.kind);
  const isCard = !deleted && isCardKind(msg.kind);
  const authorName = isSelf
    ? t('you-label', { defaultValue: 'You' })
    : (otherUser?.name ?? t('user-fallback', { defaultValue: 'User' }));

  const content = isEditing ? (
    <div className="w-full max-w-[85%]">
      <MessageEditor
        initialValue={msg.content}
        saving={savingEdit}
        onSave={(value) => onSaveEdit(msg.id, value)}
        onCancel={() => setEditingId(null)}
      />
    </div>
  ) : isCard ? (
    <div className="max-w-[85%]">
      <MessageBadges forwardCount={msg.forwardCount} pinned={pinned} />
      <ChatRichBody
        chat={chatRef}
        messageId={msg.id}
        kind={msg.kind ?? 'text'}
        meta={msg.meta}
        poll={msg.poll}
        authorName={authorName}
        disabled={isTempId(msg.id)}
      />
    </div>
  ) : (
    <div
      className={`t-body break-words ${isSelf ? 'conversation__bubble' : 'conversation__theirs'} ${
        isVoice ? 'w-[85%] max-w-[22rem]' : ''
      }`}
      {...(canReact ? reactionTriggerFor(msg.id) : {})}
    >
      {deleted ? (
        <DeletedMessage deletedBy={msg.deletedBy} />
      ) : (
        <>
          <MessageBadges
            forwardCount={msg.forwardCount}
            pinned={pinned}
            className="text-current opacity-70"
          />
          {isVoice && (
            <VoicePlayer
              src={msg.audioUrl as string}
              durationMs={msg.audioDurationMs ?? null}
              peaks={msg.audioPeaks ?? []}
              className="mb-1"
            />
          )}
          {stripEmbedUrls(msg.content).trim() && (
            <p className="whitespace-pre-wrap">{stripEmbedUrls(msg.content)}</p>
          )}
          {/* Legacy: media embedded as URLs inside the text. */}
          {extractMediaEmbeds(msg.content).length > 0 && (
            <ChatMediaEmbed content={msg.content} themePrefix="site" />
          )}
          {/* Structured rich media. */}
          {msg.imageUrls && msg.imageUrls.length > 0 && (
            <PostImageGrid urls={msg.imageUrls} className="mt-2 rounded-site overflow-hidden" />
          )}
          {msg.gifUrl && (
            <img
              src={msg.gifUrl}
              alt=""
              className="mt-2 max-h-60 w-auto rounded-site"
              loading="lazy"
            />
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      {showDate && (
        <SpineStation className={className}>{formatDateSeparator(msg.createdAt)}</SpineStation>
      )}
      {isLine ? (
        <SpineItem dot={false} className={cn('spine-item--tight', className)}>
          <ChatSystemLine
            meta={msg.meta}
            fallback={msg.content}
            viewerId={viewerId}
            nameOf={(id) => (otherUser && id === otherUser.id ? otherUser.name : null)}
          />
        </SpineItem>
      ) : (
        <SpineItem dot={!isSelf} className={cn('spine-item--tight group', className)}>
          <SwipeRow
            leading={
              canReact && !isEditing && !isVoice && msg.content.trim()
                ? {
                    icon: Reply,
                    label: t('dm-reply', { defaultValue: 'Reply' }),
                    onAction: () => quoteReply(msg.content),
                  }
                : undefined
            }
          >
            <div className={isSelf ? 'conversation__mine' : undefined}>
              <div className={`flex items-start gap-2 ${isSelf ? 'flex-row-reverse' : ''}`}>
                {content}
                {/* Edit / unsend / delete-for-me. Always present on touch (no
                    hover to reveal it); shown on hover or focus on pointer devices. */}
                {!isEditing && !isTempId(msg.id) && (
                  <MessageActions
                    message={{
                      id: msg.id,
                      senderId: msg.senderId,
                      content: msg.content,
                      createdAt: msg.createdAt,
                      deletedAt: msg.deletedAt ?? null,
                    }}
                    viewerId={viewerId}
                    onEdit={() => setEditingId(msg.id)}
                    onUnsend={() => onUnsend(msg.id)}
                    onHide={() => onHide(msg.id)}
                    onReply={isVoice ? undefined : () => quoteReply(msg.content)}
                    extra={(close) => (
                      <MessagePlusItems
                        chat={chatRef}
                        message={{
                          id: msg.id,
                          content: msg.content,
                          kind: msg.kind,
                          forwardCount: msg.forwardCount,
                          hasAudio: isVoice,
                        }}
                        onDone={close}
                      />
                    )}
                    className="-my-2 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                  />
                )}
              </div>
              {!isEditing && !deleted && (
                <p className="t-meta mt-1">
                  {formatTime(msg.createdAt)}
                  {msg.editedAt && <> · {t('edited', { defaultValue: 'edited' })}</>}
                </p>
              )}
            </div>
          </SwipeRow>
          {(msg.reactions?.length ?? 0) > 0 && (
            <ReactionChips
              reactions={groupReactions(msg.reactions ?? [], viewerId)}
              onToggle={(emoji) => onToggleReaction(msg.id, emoji)}
              className={`mt-1 ${isSelf ? 'justify-end' : ''}`}
            />
          )}
          {isSelf && isLastOwn && msg.read && !isSavedChat && !deleted && <SeenIndicator />}
        </SpineItem>
      )}
    </>
  );
}
