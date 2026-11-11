import { m as motion } from 'framer-motion';
import { Reply } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SwipeRow } from '@/components/ui/swipe-row';
import { transition } from '@/lib/motion';
import { UserAvatar } from '@/components/ui/UserAvatar';
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
  bubbleRounding as bubbleRoundingFor,
  dateSeparatorKind,
  formatTime,
  isTempId,
  shouldShowDateSeparator,
  type Message,
  type OtherUser,
} from './conversation-state';

/** One entry in the thread: day divider, bubble/card/system line, actions, reactions, "Seen". */
export function MessageRow({
  msg,
  prevMsg,
  nextMsg,
  viewerId,
  selfAvatar,
  otherUser,
  isSavedChat,
  isLastOwn,
  animateIn,
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
}: {
  msg: Message;
  prevMsg: Message | null;
  nextMsg: Message | null;
  viewerId: string;
  /** The viewer's own avatar and name (live-resolved, falling back to the session's). */
  selfAvatar: { image?: string | null; name?: string | null };
  otherUser: OtherUser | null;
  isSavedChat: boolean;
  /** This is the viewer's latest message — the one that carries "Seen". */
  isLastOwn: boolean;
  /** New (sent/received) messages rise in; history renders in place. */
  animateIn: boolean;
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
  // Show avatar on the last message in a consecutive group from the same sender
  const isFirstInGroup = !prevMsg || prevMsg.senderId !== msg.senderId || showDate;
  const isLastInGroup =
    !nextMsg || nextMsg.senderId !== msg.senderId || shouldShowDateSeparator(nextMsg, msg);

  const avatarUser = isSelf
    ? { image: selfAvatar.image, name: selfAvatar.name }
    : { image: otherUser?.image, name: otherUser?.name };

  const bubbleRounding = bubbleRoundingFor(isSelf, isFirstInGroup, isLastInGroup);

  const deleted = !!msg.deletedAt;
  const isVoice = !!msg.audioUrl && !deleted;
  // A tombstone has nothing to react to, and an optimistic bubble has
  // no server id yet — neither takes the long-press/right-click menu.
  const canReact = !deleted && !isTempId(msg.id);
  // P04: centred lines (timer, pin, tip…) and card kinds (dice, checklist…).
  const isLine = isLineKind(msg.kind);
  const isCard = !deleted && isCardKind(msg.kind);
  const authorName = isSelf
    ? t('you-label', { defaultValue: 'You' })
    : (otherUser?.name ?? t('user-fallback', { defaultValue: 'User' }));

  return (
    <motion.div
      initial={animateIn ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={transition}
    >
      {showDate && (
        <div className="flex items-center justify-center my-4">
          <span className="glass-fill text-xs text-site-text-muted px-3 py-1 rounded-full">
            {formatDateSeparator(msg.createdAt)}
          </span>
        </div>
      )}
      {isLine ? (
        <ChatSystemLine
          meta={msg.meta}
          fallback={msg.content}
          viewerId={viewerId}
          nameOf={(id) => (otherUser && id === otherUser.id ? otherUser.name : null)}
        />
      ) : (
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
          <div
            className={`group flex items-end gap-2 ${isLastInGroup ? 'mb-3' : 'mb-0.5'} ${isSelf ? 'flex-row-reverse' : ''}`}
          >
            {/* Avatar — visible only on last message in group */}
            {isLastInGroup ? (
              <UserAvatar
                src={avatarUser.image ?? undefined}
                alt={avatarUser.name || 'User'}
                size={28}
                fallbackName={avatarUser.name ?? undefined}
              />
            ) : (
              <div className="w-7 shrink-0" />
            )}

            {isEditing ? (
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
                className={`${isVoice ? 'w-[85%] max-w-[22rem]' : 'max-w-[75%]'} ${bubbleRounding} px-4 py-2.5 text-sm break-words ${
                  isSelf ? 'bg-site-accent text-site-bg' : 'bg-site-text text-site-bg'
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
                      <PostImageGrid
                        urls={msg.imageUrls}
                        className="mt-2 rounded-site-sm overflow-hidden"
                      />
                    )}
                    {msg.gifUrl && (
                      <img
                        src={msg.gifUrl}
                        alt=""
                        className="mt-2 max-h-60 w-auto rounded-site-sm"
                        loading="lazy"
                      />
                    )}
                  </>
                )}
                <p className={`text-micro mt-1 ${isSelf ? 'text-site-bg/60' : 'text-site-bg/55'}`}>
                  {formatTime(msg.createdAt)}
                  {msg.editedAt && !deleted && <> · {t('edited', { defaultValue: 'edited' })}</>}
                </p>
              </div>
            )}

            {/* Edit / unsend / delete-for-me. Always present on touch (no
                hover to reveal it); fades in on pointer devices. */}
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
                className="md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
              />
            )}
          </div>
        </SwipeRow>
      )}
      {(msg.reactions?.length ?? 0) > 0 && (
        <ReactionChips
          reactions={groupReactions(msg.reactions ?? [], viewerId)}
          onToggle={(emoji) => onToggleReaction(msg.id, emoji)}
          className={`mt-1 ${isSelf ? 'justify-end' : ''}`}
        />
      )}
      {isSelf && isLastOwn && msg.read && !isSavedChat && !deleted && <SeenIndicator />}
    </motion.div>
  );
}
