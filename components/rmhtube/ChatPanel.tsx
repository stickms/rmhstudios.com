/**
 * ChatPanel — Real-time chat with replies, @mentions, typing indicators,
 * reactions, pinned messages, system messages, and timestamp sharing.
 */
'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Reply, Pin, X, SmilePlus, AtSign, Image as ImageIcon } from 'lucide-react';
import { GifPicker } from '@/components/feed/GifPicker';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import { useEmojiShortcodes } from '@/lib/emoji/use-emoji-shortcodes';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore, getChatEntries } from '@/lib/rmhtube/store';
import {
  CHAT_MAX_LENGTH,
  CHAT_REACTION_EMOJIS,
  TYPING_DEBOUNCE_MS,
} from '@/lib/rmhtube/constants';
import { formatDuration, formatRelativeTime } from '@/lib/rmhtube/utils';
import type { ChatMessage, ChatEntry, SystemMessage } from '@/lib/rmhtube/types';
import { usePopPresence } from '@/hooks/usePopPresence';
import ChatMediaEmbed, { stripEmbedUrls } from './ChatMediaEmbed';

// ─── Helpers ──────────────────────────────────────────────────────

function isSystemMessage(entry: ChatEntry): entry is SystemMessage {
  return 'type' in entry && entry.type === 'system';
}

function isChatMessage(entry: ChatEntry): entry is ChatMessage {
  return !isSystemMessage(entry);
}

/**
 * Render message content with @mention highlights.
 * Matches `@Username` tokens and wraps them in a styled <span>.
 */
function renderContent(
  content: string,
  mentions: string[],
  members: { userId: string; userName: string }[],
) {
  if (!mentions.length) return content;

  // Build a set of mentioned user names for fast lookup
  const mentionedNames = new Set(
    mentions
      .map((uid) => members.find((m) => m.userId === uid)?.userName)
      .filter(Boolean),
  );

  if (!mentionedNames.size) return content;

  // Split on @Word patterns and highlight matches
  const pattern = new RegExp(`(@\\w+)`, 'g');
  const parts = content.split(pattern);

  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const name = part.slice(1);
      if (mentionedNames.has(name)) {
        return (
          <span
            key={i}
            className="font-bold text-(--app-accent)"
          >
            {part}
          </span>
        );
      }
    }
    return part;
  });
}

// ─── Component ────────────────────────────────────────────────────

export default function ChatPanel() {
  const { t } = useTranslation("c-rmhtube");
  const store = useRmhTubeStore();
  const room = store.room;
  const settings = store.settings;

  const [message, setMessage] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [contextMenuMessage, setContextMenuMessage] = useState<ChatMessage | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  // Both menus are held mounted for their close (globals.css §7.1). The pin menu
  // keys on the MESSAGE and the mention list on the MEMBERS, because both are
  // cleared on the same tick the menu closes — a menu that emptied itself
  // mid-exit would collapse to a bare strip on the way out. The dismiss
  // listeners further down stay on the raw state.
  const pinMenu = usePopPresence(contextMenuMessage);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTypingEmitRef = useRef(0);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const insertEmoji = useEmojiInsert(inputRef, message, setMessage);
  const shortcodes = useEmojiShortcodes({ ref: inputRef, value: message, onChange: setMessage });

  // ─── Combined entries (chat + system messages) ─────────────────

  // Keyed on the two arrays it actually reads, not on `store`. `useRmhTubeStore()`
  // subscribes to the whole store, which changes on every SYNC_STATE and clock
  // sync — several times a minute in a live watch party — so a store-keyed memo
  // re-merged and re-sorted the entire transcript on updates unrelated to chat.
  const entries = useMemo(
    () => getChatEntries(room?.chat, store.systemMessages),
    [room?.chat, store.systemMessages],
  );

  // ─── Auto-scroll on new messages ───────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length]);

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

  // ─── Close reaction picker on outside click ────────────────────

  useEffect(() => {
    if (!reactionPickerMessageId) return;
    const handler = (e: MouseEvent) => {
      setReactionPickerMessageId(null);
    };
    // Delay to avoid closing immediately on the same click that opened it
    const timer = setTimeout(() => {
      window.addEventListener('click', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handler);
    };
  }, [reactionPickerMessageId]);

  // ─── Typing indicator emit (debounced) ─────────────────────────

  const handleTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingEmitRef.current >= TYPING_DEBOUNCE_MS) {
      emit(C2S.CHAT_TYPING, {});
      lastTypingEmitRef.current = now;
    }
  }, []);

  // ─── Mention autocomplete logic ────────────────────────────────

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      shortcodes.onValueChange(val);
      handleTyping();

      // Check for @mention trigger
      const cursorPos = e.target.selectionStart ?? val.length;
      const textBefore = val.slice(0, cursorPos);
      const atMatch = textBefore.match(/@(\w*)$/);

      if (atMatch) {
        setShowMentionDropdown(true);
        setMentionFilter(atMatch[1].toLowerCase());
      } else {
        setShowMentionDropdown(false);
        setMentionFilter('');
      }
    },
    [handleTyping, shortcodes],
  );

  const filteredMembers = useMemo(() => {
    if (!room || !showMentionDropdown) return [];
    return room.members.filter(
      (m) =>
        m.userId !== room.myUserId &&
        m.userName.toLowerCase().includes(mentionFilter),
    );
  }, [room, showMentionDropdown, mentionFilter]);

  const mentionMenu = usePopPresence(filteredMembers.length > 0 ? filteredMembers : null);

  const insertMention = useCallback(
    (userName: string) => {
      const cursorPos = inputRef.current?.selectionStart ?? message.length;
      const textBefore = message.slice(0, cursorPos);
      const textAfter = message.slice(cursorPos);
      const atIndex = textBefore.lastIndexOf('@');
      const newText = textBefore.slice(0, atIndex) + `@${userName} ` + textAfter;
      setMessage(newText);
      setShowMentionDropdown(false);
      setMentionFilter('');
      // Refocus input
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [message],
  );

  // ─── Send message ──────────────────────────────────────────────

  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const content = message.trim();
      if (!content || !room) return;

      // Extract mentions from message content
      const mentionPattern = /@(\w+)/g;
      const mentionedNames: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = mentionPattern.exec(content)) !== null) {
        mentionedNames.push(match[1]);
      }
      const mentionUserIds = mentionedNames
        .map((name) => room.members.find((m) => m.userName === name)?.userId)
        .filter((id): id is string => id != null);

      const payload: Record<string, unknown> = { content };
      if (replyTo) payload.replyToId = replyTo.id;
      if (mentionUserIds.length > 0) payload.mentions = mentionUserIds;

      emit(C2S.ROOM_CHAT, payload);
      setMessage('');
      shortcodes.dismiss();
      setReplyTo(null);
      setShowMentionDropdown(false);
    },
    [message, room, replyTo, shortcodes],
  );

  // ─── Reaction handler ──────────────────────────────────────────

  const handleReaction = useCallback((messageId: string, emoji: string) => {
    emit(C2S.CHAT_REACT, { messageId, emoji });
    setReactionPickerMessageId(null);
  }, []);

  // ─── Pin / Unpin handler ───────────────────────────────────────

  const handlePin = useCallback((messageId: string, pin: boolean) => {
    emit(C2S.CHAT_PIN, { messageId, pin });
    setContextMenuMessage(null);
    setContextMenuPos(null);
  }, []);

  // ─── Context menu (right-click) ────────────────────────────────

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, msg: ChatMessage) => {
      if (!room) return;
      if (room.myUserId !== room.hostUserId) return;
      e.preventDefault();
      setContextMenuMessage(msg);
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    },
    [room],
  );

  // ─── Typing indicator display ──────────────────────────────────

  const typingText = useMemo(() => {
    if (!room) return null;
    const typingNames = room.typingUsers
      .filter((uid) => uid !== room.myUserId)
      .map((uid) => room.members.find((m) => m.userId === uid)?.userName)
      .filter(Boolean);

    if (typingNames.length === 0) return null;
    if (typingNames.length === 1) return `${typingNames[0]} is typing...`;
    if (typingNames.length === 2)
      return `${typingNames[0]} and ${typingNames[1]} are typing...`;
    return `${typingNames[0]}, ${typingNames[1]} and others are typing...`;
  }, [room]);

  if (!room) return null;

  const isHost = room.myUserId === room.hostUserId;

  // Bound once so the handlers below inherit the narrowing — `pinMenu.present`
  // is the retained message and stays non-null for the whole close window.
  const pinTarget = pinMenu.present;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-(--app-border)">
        <h3 className="text-sm font-semibold text-(--app-text-muted)">{t("chat", { defaultValue: "Chat" })}</h3>
      </div>

      {/* Pinned Message Banner */}
      {room.pinnedMessage && (
        <div className="flex items-start gap-2 px-3 py-2 border-b border-(--app-border) bg-(--app-surface)">
          <Pin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-(--app-accent)" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-(--app-accent)">
              {t("pinned-by", { defaultValue: "Pinned by {{userName}}", userName: room.pinnedMessage.userName })}
            </p>
            <p className="text-xs text-(--app-text) truncate">
              {room.pinnedMessage.content}
            </p>
          </div>
          {isHost && (
            <button
              onClick={() => handlePin(room.pinnedMessage!.id, false)}
              className="shrink-0 p-0.5 rounded hover:bg-(--app-border) transition-colors"
              title={t("unpin-message", { defaultValue: "Unpin message" })}
            >
              <X className="h-3.5 w-3.5 text-(--app-text-muted)" />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-1.5 py-3 space-y-1.5">
        {entries.length === 0 ? (
          <p className="text-xs text-center py-4 text-(--app-text-dim)">
            {t("no-messages-yet", { defaultValue: "No messages yet" })}
          </p>
        ) : (
          entries.map((entry) => {
            // ─── System message ────────────────────────────
            if (isSystemMessage(entry)) {
              if (!settings.showSystemMessages) return null;
              return (
                <div
                  key={entry.id}
                  className="text-center py-1"
                >
                  <span className="text-xs italic text-(--app-text-dim)">
                    {entry.content}
                    {settings.showTimestamps && (
                      <span className="ml-2 opacity-60">
                        {formatRelativeTime(entry.createdAt)}
                      </span>
                    )}
                  </span>
                </div>
              );
            }

            // ─── Chat message ──────────────────────────────
            const msg = entry;
            const isPinned = room.pinnedMessage?.id === msg.id;
            const hasReactions = Object.keys(msg.reactions).length > 0;

            return (
              <div
                key={msg.id}
                className="group relative rounded-md px-2 py-1 transition-colors hover:bg-(--app-surface)"
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => {
                  setHoveredMessageId(null);
                  if (reactionPickerMessageId === msg.id) return; // keep picker open
                }}
                onContextMenu={(e) => handleContextMenu(e, msg)}
              >
                {/* Reply context */}
                {msg.replyToId && msg.replyToUserName && (
                  <div className="flex items-center gap-1 mb-0.5 pl-3">
                    <Reply className="h-3 w-3 text-(--app-text-dim) rotate-180" />
                    <span className="text-[11px] text-(--app-text-dim) truncate max-w-50">
                      <span className="font-semibold">{msg.replyToUserName}</span>
                      {': '}
                      {msg.replyToContent}
                    </span>
                  </div>
                )}

                {/* Message row */}
                <div className="flex items-baseline gap-1.5 text-sm">
                  {/* Pin icon */}
                  {isPinned && (
                    <Pin className="h-3 w-3 shrink-0 text-(--app-accent) self-center" />
                  )}

                  {/* Author name */}
                  <span
                    className={`font-semibold shrink-0 ${
                      msg.userId === room.hostUserId
                        ? 'text-(--app-accent)'
                        : 'text-(--app-info)'
                    }`}
                  >
                    {msg.userName}
                  </span>

                  {/* Message content (URLs hidden when embedded below) */}
                  {(() => {
                    const stripped = stripEmbedUrls(msg.content);
                    return stripped ? (
                      <span className="text-(--app-text) wrap-break-word min-w-0">
                        {renderContent(stripped, msg.mentions, room.members)}
                      </span>
                    ) : null;
                  })()}

                  {/* Timestamp sharing link */}
                  {msg.timestamp != null && (
                    <button
                      onClick={() => {
                        // Seek to the shared timestamp
                        emit(C2S.SYNC_SEEK, { time: msg.timestamp });
                      }}
                      className="shrink-0 text-xs font-mono font-semibold text-(--app-accent) hover:underline"
                      title={t("jump-to", { defaultValue: "Jump to {{time}}", time: formatDuration(msg.timestamp) })}
                    >
                      {formatDuration(msg.timestamp)}
                    </button>
                  )}

                  {/* Message timestamp */}
                  {settings.showTimestamps && (
                    <span className="shrink-0 text-[11px] text-(--app-text-dim) ml-auto">
                      {formatRelativeTime(msg.createdAt)}
                    </span>
                  )}
                </div>

                {/* Inline media embeds (images, GIFs, Tenor, Giphy) */}
                <ChatMediaEmbed content={msg.content} />

                {/* Reactions display */}
                {hasReactions && (
                  <div className="flex flex-wrap gap-1 mt-1 pl-3">
                    {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                      const hasReacted = userIds.includes(room.myUserId);
                      return (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(msg.id, emoji)}
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

                {/* Hover action buttons (reply + reaction picker) */}
                {hoveredMessageId === msg.id && (
                  <div className="absolute -top-2 right-1 flex items-center gap-0.5 rounded-md border border-(--app-border) bg-(--app-bg) shadow-sm z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setReplyTo(msg);
                        inputRef.current?.focus();
                      }}
                      className="p-1 rounded hover:bg-(--app-surface) transition-colors"
                      title={t("reply", { defaultValue: "Reply" })}
                    >
                      <Reply className="h-3.5 w-3.5 text-(--app-text-muted)" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setReactionPickerMessageId(
                          reactionPickerMessageId === msg.id ? null : msg.id,
                        );
                      }}
                      className="p-1 rounded hover:bg-(--app-surface) transition-colors"
                      title={t("react", { defaultValue: "React" })}
                    >
                      <SmilePlus className="h-3.5 w-3.5 text-(--app-text-muted)" />
                    </button>
                  </div>
                )}

                {/* Reaction emoji picker */}
                {reactionPickerMessageId === msg.id && (
                  <div
                    className="absolute -top-8 right-1 flex items-center gap-0.5 rounded-lg border border-(--app-border) bg-(--app-bg) shadow-lg px-1 py-0.5 z-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {CHAT_REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(msg.id, emoji)}
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
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {typingText && (
        <div className="px-3 py-1 border-t border-(--app-border)">
          <p className="text-xs italic text-(--app-text-dim) animate-pulse">
            {typingText}
          </p>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-(--app-border) bg-(--app-surface)">
          <Reply className="h-3.5 w-3.5 shrink-0 text-(--app-accent) rotate-180" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-(--app-accent)">
              {replyTo.userName}
            </span>
            <p className="text-xs text-(--app-text-muted) truncate">
              {replyTo.content}
            </p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="shrink-0 p-0.5 rounded hover:bg-(--app-border) transition-colors"
          >
            <X className="h-3.5 w-3.5 text-(--app-text-muted)" />
          </button>
        </div>
      )}

      {/* Mention autocomplete dropdown */}
      {mentionMenu.present && (
        <div
          ref={mentionDropdownRef}
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
              <AtSign className="h-3.5 w-3.5 text-(--app-text-dim)" />
              <span className="text-(--app-text)">{member.userName}</span>
            </button>
          ))}
        </div>
      )}

      {/* GIF Picker */}
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

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex gap-2 px-1.5 py-3 border-t border-(--app-border)"
      >
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={handleInputChange}
            onKeyDown={(e) => shortcodes.onKeyDown(e)}
            maxLength={CHAT_MAX_LENGTH}
            placeholder={replyTo ? t("reply-to-placeholder", { defaultValue: "Reply to {{userName}}...", userName: replyTo.userName }) : t("type-a-message", { defaultValue: "Type a message..." })}
            className="w-full px-3 py-2 rounded-lg text-sm border border-(--app-border) bg-(--app-bg) text-(--app-text) placeholder:text-(--app-text-dim) outline-none focus:ring-1 focus:ring-(--app-accent)"
          />
          {shortcodes.menu}
        </div>
        <button
          type="button"
          onClick={() => setShowGifPicker((v) => !v)}
          aria-label={t("add-gif-aria", { defaultValue: "Add a GIF" })}
          className="shrink-0 rounded-lg px-2 py-2 text-(--app-text-dim) hover:text-(--app-accent) transition-colors"
        >
          <ImageIcon className="h-4 w-4" />
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
          className="shrink-0 rounded-lg px-3 py-2 transition-colors disabled:opacity-50 bg-(--app-accent) text-(--app-accent-fg) hover:bg-(--app-accent-hover)"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {/* Context menu (pin/unpin) — for host/mod */}
      {pinTarget && contextMenuPos && (
        <div
          data-motion="pop"
          data-state={pinMenu.state}
          className="fixed z-50 origin-top-left rounded-lg border border-(--app-border) bg-(--app-bg) shadow-xl overflow-hidden py-1 min-w-35"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {room.pinnedMessage?.id === pinTarget.id ? (
            <button
              onClick={() => handlePin(pinTarget.id, false)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-(--app-text) hover:bg-(--app-surface) transition-colors"
            >
              <Pin className="h-3.5 w-3.5" />
              {t("unpin-message-action", { defaultValue: "Unpin Message" })}
            </button>
          ) : (
            <button
              onClick={() => handlePin(pinTarget.id, true)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-(--app-text) hover:bg-(--app-surface) transition-colors"
            >
              <Pin className="h-3.5 w-3.5" />
              {t("pin-message-action", { defaultValue: "Pin Message" })}
            </button>
          )}
          <button
            onClick={() => {
              setReplyTo(pinTarget);
              setContextMenuMessage(null);
              setContextMenuPos(null);
              inputRef.current?.focus();
            }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-(--app-text) hover:bg-(--app-surface) transition-colors"
          >
            <Reply className="h-3.5 w-3.5" />
            {t("reply", { defaultValue: "Reply" })}
          </button>
        </div>
      )}
    </div>
  );
}
