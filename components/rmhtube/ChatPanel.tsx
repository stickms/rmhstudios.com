/**
 * ChatPanel — room chat: replies, @mentions, typing indicators, reactions,
 * pinned messages, system messages and timestamp sharing.
 *
 * Two mechanical fixes underpin the rest:
 *
 * **It follows the conversation.** Scroll pinning lives in `useStickToBottom`,
 * which records whether the reader is at the bottom *before* new content lands
 * and re-pins when an embedded image or GIF resizes the transcript afterwards.
 * The old effect asked "am I near the bottom?" after React had already
 * committed the message, and never heard about media that loaded later — so a
 * message with a GIF in it scrolled to where the GIF was not yet.
 *
 * **It subscribes to what it reads.** This used to call `useRmhTubeStore()`
 * with no selector, so the whole 200-message transcript re-rendered on every
 * sync anchor — several times a minute, forever, in a room where chat had not
 * changed.
 */
'use client';

import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Reply, Pin, X, SmilePlus, AtSign, Image as ImageIcon, ArrowDown, Clock } from 'lucide-react';
import { GifPicker } from '@/components/feed/GifPicker';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import { useEmojiShortcodes } from '@/lib/emoji/use-emoji-shortcodes';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore, getChatEntries } from '@/lib/rmhtube/store';
import { CHAT_MAX_LENGTH, CHAT_REACTION_EMOJIS, TYPING_DEBOUNCE_MS } from '@/lib/rmhtube/constants';
import { formatDuration, formatRelativeTime } from '@/lib/rmhtube/utils';
import { extrapolate } from '@/lib/rmhtube/sync-math';
import { getServerNow } from '@/lib/rmhtube/clock';
import type { ChatMessage, ChatEntry, SystemMessage } from '@/lib/rmhtube/types';
import { usePopPresence } from '@/hooks/usePopPresence';
import { useStickToBottom } from '@/hooks/useStickToBottom';
import ChatMediaEmbed, { parseMessageMedia } from './ChatMediaEmbed';

// ─── Helpers ──────────────────────────────────────────────────────

function isSystemMessage(entry: ChatEntry): entry is SystemMessage {
  return 'type' in entry && entry.type === 'system';
}

/** Render message content with @mention highlights. */
function renderContent(content: string, mentions: string[], names: Map<string, string>) {
  if (!mentions.length) return content;

  const mentionedNames = new Set(
    mentions.map((uid) => names.get(uid)).filter((name): name is string => !!name),
  );
  if (!mentionedNames.size) return content;

  return content.split(/(@\w+)/g).map((part, i) =>
    part.startsWith('@') && mentionedNames.has(part.slice(1)) ? (
      <span key={i} className="font-bold text-(--app-accent)">{part}</span>
    ) : (
      part
    ),
  );
}

// ─── One message ──────────────────────────────────────────────────

interface MessageRowProps {
  msg: ChatMessage;
  memberNames: Map<string, string>;
  hostUserId: string;
  myUserId: string;
  isPinned: boolean;
  showTimestamps: boolean;
  canSeek: boolean;
  canPin: boolean;
  onReply: (msg: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onContextMenu: (event: React.MouseEvent, msg: ChatMessage) => void;
  onSeek: (seconds: number) => void;
}

/**
 * Memoised on the message, so an arriving message re-renders one row rather
 * than the whole transcript. Messages are immutable apart from their reactions,
 * which come back as a new object, so identity is a sound comparison.
 */
const MessageRow = memo(function MessageRow({
  msg,
  memberNames,
  hostUserId,
  myUserId,
  isPinned,
  showTimestamps,
  canSeek,
  canPin,
  onReply,
  onReact,
  onContextMenu,
  onSeek,
}: MessageRowProps) {
  const { t } = useTranslation('c-rmhtube');
  const [showActions, setShowActions] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  // One parse per message (cached across renders and components).
  const text = useMemo(() => parseMessageMedia(msg.content).text, [msg.content]);
  const reactionEntries = Object.entries(msg.reactions);

  useEffect(() => {
    if (!showReactionPicker) return;
    const close = () => setShowReactionPicker(false);
    const timer = setTimeout(() => window.addEventListener('click', close), 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', close);
    };
  }, [showReactionPicker]);

  return (
    <div
      className="group relative rounded-md px-2 py-1 transition-colors hover:bg-(--app-surface)"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onContextMenu={canPin ? (e) => onContextMenu(e, msg) : undefined}
    >
      {msg.replyToId && msg.replyToUserName && (
        <div className="flex items-center gap-1 mb-0.5 pl-3">
          <Reply className="h-3 w-3 text-(--app-text-dim) rotate-180" aria-hidden />
          <span className="text-[11px] text-(--app-text-dim) truncate max-w-50">
            <span className="font-semibold">{msg.replyToUserName}</span>
            {': '}
            {msg.replyToContent}
          </span>
        </div>
      )}

      <div className="flex items-baseline gap-1.5 text-sm">
        {isPinned && <Pin className="h-3 w-3 shrink-0 text-(--app-accent) self-center" aria-hidden />}

        <span
          className={`font-semibold shrink-0 ${
            msg.userId === hostUserId ? 'text-(--app-accent)' : 'text-(--app-info)'
          }`}
        >
          {msg.userName}
        </span>

        {text && (
          <span className="text-(--app-text) wrap-break-word min-w-0">
            {renderContent(text, msg.mentions, memberNames)}
          </span>
        )}

        {/* A shared timestamp. Only the leader can move the room to it, so for
            everyone else it reads as the label it is rather than a control that
            silently does nothing. */}
        {msg.timestamp != null && (
          canSeek ? (
            <button
              onClick={() => onSeek(msg.timestamp!)}
              className="shrink-0 text-xs font-mono font-semibold text-(--app-accent) hover:underline"
              title={t('jump-to', { defaultValue: 'Jump to {{time}}', time: formatDuration(msg.timestamp) })}
            >
              {formatDuration(msg.timestamp)}
            </button>
          ) : (
            <span className="shrink-0 text-xs font-mono font-semibold text-(--app-accent)">
              {formatDuration(msg.timestamp)}
            </span>
          )
        )}

        {showTimestamps && (
          <span className="shrink-0 text-[11px] text-(--app-text-dim) ml-auto">
            {formatRelativeTime(msg.createdAt)}
          </span>
        )}
      </div>

      <ChatMediaEmbed content={msg.content} />

      {reactionEntries.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 pl-3">
          {reactionEntries.map(([emoji, userIds]) => {
            const hasReacted = userIds.includes(myUserId);
            return (
              <button
                key={emoji}
                onClick={() => onReact(msg.id, emoji)}
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs border transition-colors ${
                  hasReacted
                    ? 'border-(--app-accent) bg-(--app-accent)/10 text-(--app-accent)'
                    : 'border-(--app-border) bg-(--app-surface) text-(--app-text-muted) hover:border-(--app-text-muted)'
                }`}
              >
                <span>{emoji}</span>
                <span className="font-medium">{userIds.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {showActions && (
        <div className="absolute -top-2 right-1 flex items-center gap-0.5 rounded-md border border-(--app-border) bg-(--app-bg) shadow-sm z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onReply(msg); }}
            className="p-1 rounded hover:bg-(--app-surface) transition-colors"
            title={t('reply', { defaultValue: 'Reply' })}
          >
            <Reply className="h-3.5 w-3.5 text-(--app-text-muted)" aria-hidden />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowReactionPicker((v) => !v); }}
            className="p-1 rounded hover:bg-(--app-surface) transition-colors"
            title={t('react', { defaultValue: 'React' })}
          >
            <SmilePlus className="h-3.5 w-3.5 text-(--app-text-muted)" aria-hidden />
          </button>
        </div>
      )}

      {showReactionPicker && (
        <div
          className="absolute -top-8 right-1 flex items-center gap-0.5 rounded-lg border border-(--app-border) bg-(--app-bg) shadow-lg px-1 py-0.5 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          {CHAT_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => { onReact(msg.id, emoji); setShowReactionPicker(false); }}
              className="p-1 rounded hover:bg-(--app-surface) transition-colors text-sm"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

// ─── Component ────────────────────────────────────────────────────

export default function ChatPanel() {
  const { t } = useTranslation('c-rmhtube');

  // Narrow subscriptions: chat must not re-render on a sync anchor.
  const chat = useRmhTubeStore((s) => s.room?.chat);
  const systemMessages = useRmhTubeStore((s) => s.systemMessages);
  const members = useRmhTubeStore((s) => s.room?.members);
  const myUserId = useRmhTubeStore((s) => s.room?.myUserId);
  const hostUserId = useRmhTubeStore((s) => s.room?.hostUserId);
  const leaderUserId = useRmhTubeStore((s) => s.room?.leaderUserId);
  const pinnedMessage = useRmhTubeStore((s) => s.room?.pinnedMessage);
  const typingUsers = useRmhTubeStore((s) => s.room?.typingUsers);
  const hasCurrentItem = useRmhTubeStore((s) => !!s.room?.currentItem);
  const showTimestamps = useRmhTubeStore((s) => s.settings.showTimestamps);
  const showSystemMessages = useRmhTubeStore((s) => s.settings.showSystemMessages);

  const [message, setMessage] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [attachTimestamp, setAttachTimestamp] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [contextMenuMessage, setContextMenuMessage] = useState<ChatMessage | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  // The pin menu is held mounted for its close (globals.css §7.1); the dismiss
  // listener below stays on the raw state.
  const pinMenu = usePopPresence(contextMenuMessage);

  const inputRef = useRef<HTMLInputElement>(null);
  const lastTypingEmitRef = useRef(0);
  const insertEmoji = useEmojiInsert(inputRef, message, setMessage);
  const shortcodes = useEmojiShortcodes({ ref: inputRef, value: message, onChange: setMessage });

  const { containerRef, contentRef, isPinned, scrollToBottom } = useStickToBottom<HTMLDivElement, HTMLDivElement>();

  const entries = useMemo(
    () => getChatEntries(chat, systemMessages),
    [chat, systemMessages],
  );

  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members ?? []) map.set(member.userId, member.userName);
    return map;
  }, [members]);

  const isHost = !!myUserId && myUserId === hostUserId;
  const isLeader = !!myUserId && myUserId === leaderUserId;

  // ─── Close context menu on outside click ───────────────────────

  useEffect(() => {
    if (!contextMenuMessage) return;
    const handler = () => {
      setContextMenuMessage(null);
      setContextMenuPos(null);
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenuMessage]);

  // ─── Typing indicator emit (debounced) ─────────────────────────

  const handleTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingEmitRef.current >= TYPING_DEBOUNCE_MS) {
      emit(C2S.CHAT_TYPING, {});
      lastTypingEmitRef.current = now;
    }
  }, []);

  // ─── Mention autocomplete ──────────────────────────────────────

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      shortcodes.onValueChange(val);
      handleTyping();

      const cursorPos = e.target.selectionStart ?? val.length;
      const atMatch = val.slice(0, cursorPos).match(/@(\w*)$/);

      setShowMentionDropdown(!!atMatch);
      setMentionFilter(atMatch ? atMatch[1].toLowerCase() : '');
    },
    [handleTyping, shortcodes],
  );

  const filteredMembers = useMemo(() => {
    if (!showMentionDropdown || !members) return [];
    return members.filter(
      (m) => m.userId !== myUserId && m.userName.toLowerCase().includes(mentionFilter),
    );
  }, [members, myUserId, showMentionDropdown, mentionFilter]);

  const mentionMenu = usePopPresence(filteredMembers.length > 0 ? filteredMembers : null);

  const insertMention = useCallback(
    (userName: string) => {
      const cursorPos = inputRef.current?.selectionStart ?? message.length;
      const textBefore = message.slice(0, cursorPos);
      const atIndex = textBefore.lastIndexOf('@');
      setMessage(textBefore.slice(0, atIndex) + `@${userName} ` + message.slice(cursorPos));
      setShowMentionDropdown(false);
      setMentionFilter('');
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [message],
  );

  // ─── Send ──────────────────────────────────────────────────────

  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const content = message.trim();
      if (!content || !members) return;

      const mentionUserIds = [...content.matchAll(/@(\w+)/g)]
        .map((match) => members.find((m) => m.userName === match[1])?.userId)
        .filter((id): id is string => id != null);

      const payload: Record<string, unknown> = { content };
      if (replyTo) payload.replyToId = replyTo.id;
      if (mentionUserIds.length > 0) payload.mentions = mentionUserIds;
      if (attachTimestamp) {
        // The room's live position, on the shared clock. The protocol has
        // carried this field since timestamp sharing was designed; nothing ever
        // sent one, so every message arrived without a position to jump to.
        const state = useRmhTubeStore.getState().room?.videoState;
        if (state && state.mode === 'vod') {
          payload.timestamp = Math.max(0, Math.floor(extrapolate(state, getServerNow())));
        }
      }

      emit(C2S.ROOM_CHAT, payload);
      setMessage('');
      shortcodes.dismiss();
      setReplyTo(null);
      setAttachTimestamp(false);
      setShowMentionDropdown(false);
      scrollToBottom();
    },
    [message, members, replyTo, attachTimestamp, shortcodes, scrollToBottom],
  );

  // ─── Message actions ───────────────────────────────────────────

  const handleReaction = useCallback((messageId: string, emoji: string) => {
    emit(C2S.CHAT_REACT, { messageId, emoji });
  }, []);

  const handlePin = useCallback((messageId: string | null, pin: boolean) => {
    emit(C2S.CHAT_PIN, { messageId: pin ? messageId : null });
    setContextMenuMessage(null);
    setContextMenuPos(null);
  }, []);

  const handleReply = useCallback((msg: ChatMessage) => {
    setReplyTo(msg);
    inputRef.current?.focus();
  }, []);

  const handleSeekTo = useCallback((seconds: number) => {
    emit(C2S.SYNC_SEEK, { time: seconds });
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, msg: ChatMessage) => {
      e.preventDefault();
      setContextMenuMessage(msg);
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  // ─── Typing indicator display ──────────────────────────────────

  const typingText = useMemo(() => {
    const names = (typingUsers ?? [])
      .filter((uid) => uid !== myUserId)
      .map((uid) => memberNames.get(uid))
      .filter((name): name is string => !!name);

    if (names.length === 0) return null;
    if (names.length === 1) {
      return t('typing-one', { defaultValue: '{{name}} is typing…', name: names[0] });
    }
    if (names.length === 2) {
      return t('typing-two', { defaultValue: '{{a}} and {{b}} are typing…', a: names[0], b: names[1] });
    }
    return t('typing-many', { defaultValue: '{{a}}, {{b}} and others are typing…', a: names[0], b: names[1] });
  }, [typingUsers, myUserId, memberNames, t]);

  if (!myUserId || !hostUserId) return null;

  const pinTarget = pinMenu.present;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-(--app-border)">
        <h3 className="text-sm font-semibold text-(--app-text-muted)">{t('chat', { defaultValue: 'Chat' })}</h3>
      </div>

      {/* Pinned message */}
      {pinnedMessage && (
        <div className="flex items-start gap-2 px-3 py-2 border-b border-(--app-border) bg-(--app-surface)">
          <Pin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-(--app-accent)" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-(--app-accent)">
              {t('pinned-by', { defaultValue: 'Pinned by {{userName}}', userName: pinnedMessage.userName })}
            </p>
            <p className="text-xs text-(--app-text) truncate">{pinnedMessage.content}</p>
          </div>
          {isHost && (
            <button
              onClick={() => handlePin(null, false)}
              className="shrink-0 p-0.5 rounded hover:bg-(--app-border) transition-colors"
              title={t('unpin-message', { defaultValue: 'Unpin message' })}
            >
              <X className="h-3.5 w-3.5 text-(--app-text-muted)" aria-hidden />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="h-full overflow-y-auto px-1.5 py-3">
          <div ref={contentRef} className="space-y-1.5">
            {entries.length === 0 ? (
              <p className="text-xs text-center py-4 text-(--app-text-dim)">
                {t('no-messages-yet', { defaultValue: 'No messages yet' })}
              </p>
            ) : (
              entries.map((entry) => {
                if (isSystemMessage(entry)) {
                  if (!showSystemMessages) return null;
                  return (
                    <div key={entry.id} className="text-center py-1">
                      <span className="text-xs italic text-(--app-text-dim)">
                        {entry.content}
                        {showTimestamps && (
                          <span className="ml-2 opacity-60">{formatRelativeTime(entry.createdAt)}</span>
                        )}
                      </span>
                    </div>
                  );
                }

                return (
                  <MessageRow
                    key={entry.id}
                    msg={entry}
                    memberNames={memberNames}
                    hostUserId={hostUserId}
                    myUserId={myUserId}
                    isPinned={pinnedMessage?.id === entry.id}
                    showTimestamps={showTimestamps}
                    canSeek={isLeader}
                    canPin={isHost}
                    onReply={handleReply}
                    onReact={handleReaction}
                    onContextMenu={handleContextMenu}
                    onSeek={handleSeekTo}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Scrolled up: say so, and offer the way back. Without this a message
            that lands while you are reading history is simply lost. */}
        {!isPinned && entries.length > 0 && (
          <button
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-(--app-border) bg-(--app-surface) px-3 py-1 text-xs font-medium text-(--app-text) shadow-lg transition-colors hover:bg-(--app-surface-hover)"
          >
            <ArrowDown className="h-3 w-3" aria-hidden />
            {t('jump-to-latest', { defaultValue: 'Jump to latest' })}
          </button>
        )}
      </div>

      {/* Typing indicator */}
      {typingText && (
        <div className="px-3 py-1 border-t border-(--app-border)">
          <p className="text-xs italic text-(--app-text-dim)">{typingText}</p>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-(--app-border) bg-(--app-surface)">
          <Reply className="h-3.5 w-3.5 shrink-0 text-(--app-accent) rotate-180" aria-hidden />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-(--app-accent)">{replyTo.userName}</span>
            <p className="text-xs text-(--app-text-muted) truncate">{replyTo.content}</p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="shrink-0 p-0.5 rounded hover:bg-(--app-border) transition-colors"
            aria-label={t('cancel-reply', { defaultValue: 'Cancel reply' })}
          >
            <X className="h-3.5 w-3.5 text-(--app-text-muted)" aria-hidden />
          </button>
        </div>
      )}

      {/* Mention autocomplete */}
      {mentionMenu.present && (
        <div
          data-motion="pop"
          data-state={mentionMenu.state}
          className="relative mx-3 mb-1 origin-bottom rounded-lg border border-(--app-border) bg-(--app-bg) shadow-lg overflow-hidden max-h-32 overflow-y-auto"
        >
          {mentionMenu.present.map((member) => (
            <button
              key={member.userId}
              onClick={() => insertMention(member.userName)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-(--app-surface) transition-colors"
            >
              <AtSign className="h-3.5 w-3.5 text-(--app-text-dim)" aria-hidden />
              <span className="text-(--app-text)">{member.userName}</span>
            </button>
          ))}
        </div>
      )}

      {/* GIF picker */}
      {showGifPicker && (
        <div className="px-1.5 pb-2">
          <GifPicker
            onClose={() => setShowGifPicker(false)}
            onSelect={(u) => {
              setMessage((m) => (m ? `${m} ${u}` : u));
              setShowGifPicker(false);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          />
        </div>
      )}

      {/* Composer */}
      <form onSubmit={handleSend} className="flex gap-2 px-1.5 py-3 border-t border-(--app-border)">
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={handleInputChange}
            onKeyDown={(e) => shortcodes.onKeyDown(e)}
            maxLength={CHAT_MAX_LENGTH}
            placeholder={
              replyTo
                ? t('reply-to-placeholder', { defaultValue: 'Reply to {{userName}}...', userName: replyTo.userName })
                : t('type-a-message', { defaultValue: 'Type a message...' })
            }
            className="w-full px-3 py-2 rounded-lg text-sm border border-(--app-border) bg-(--app-bg) text-(--app-text) placeholder:text-(--app-text-dim) outline-none focus:ring-1 focus:ring-(--app-accent)"
          />
          {shortcodes.menu}
        </div>
        {hasCurrentItem && (
          <button
            type="button"
            onClick={() => setAttachTimestamp((v) => !v)}
            aria-pressed={attachTimestamp}
            aria-label={t('attach-timestamp-aria', { defaultValue: 'Attach the current playback time' })}
            title={t('attach-timestamp', { defaultValue: 'Attach the current time' })}
            className={`shrink-0 rounded-lg px-2 py-2 transition-colors ${
              attachTimestamp
                ? 'text-(--app-accent) bg-(--app-accent-dim)'
                : 'text-(--app-text-dim) hover:text-(--app-accent)'
            }`}
          >
            <Clock className="h-4 w-4" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowGifPicker((v) => !v)}
          aria-label={t('add-gif-aria', { defaultValue: 'Add a GIF' })}
          className="shrink-0 rounded-lg px-2 py-2 text-(--app-text-dim) hover:text-(--app-accent) transition-colors"
        >
          <ImageIcon className="h-4 w-4" aria-hidden />
        </button>
        <EmojiPickerButton
          direction="up"
          onSelect={insertEmoji}
          className="flex shrink-0 items-center"
          buttonClassName="text-(--app-text-dim) hover:text-(--app-accent)"
        />
        <button
          type="submit"
          disabled={!message.trim()}
          aria-label={t('send', { defaultValue: 'Send' })}
          className="shrink-0 rounded-lg px-3 py-2 transition-colors disabled:opacity-50 bg-(--app-accent) text-(--app-accent-fg) hover:bg-(--app-accent-hover)"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>

      {/* Context menu (pin / reply) — host only */}
      {pinTarget && contextMenuPos && (
        <div
          data-motion="pop"
          data-state={pinMenu.state}
          className="fixed z-50 origin-top-left rounded-lg border border-(--app-border) bg-(--app-bg) shadow-xl overflow-hidden py-1 min-w-35"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handlePin(pinTarget.id, pinnedMessage?.id !== pinTarget.id)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-(--app-text) hover:bg-(--app-surface) transition-colors"
          >
            <Pin className="h-3.5 w-3.5" aria-hidden />
            {pinnedMessage?.id === pinTarget.id
              ? t('unpin-message-action', { defaultValue: 'Unpin Message' })
              : t('pin-message-action', { defaultValue: 'Pin Message' })}
          </button>
          <button
            onClick={() => {
              handleReply(pinTarget);
              setContextMenuMessage(null);
              setContextMenuPos(null);
            }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-(--app-text) hover:bg-(--app-surface) transition-colors"
          >
            <Reply className="h-3.5 w-3.5" aria-hidden />
            {t('reply', { defaultValue: 'Reply' })}
          </button>
        </div>
      )}
    </div>
  );
}
