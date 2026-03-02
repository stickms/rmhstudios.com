/**
 * ChatPanel — Real-time chat with replies, @mentions, typing indicators,
 * reactions, pinned messages, system messages, and timestamp sharing.
 */
'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Send, Reply, Pin, X, SmilePlus, AtSign } from 'lucide-react';
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
            className="font-bold text-(--rmhtube-accent)"
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
  const store = useRmhTubeStore();
  const room = store.room;
  const settings = store.settings;

  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [contextMenuMessage, setContextMenuMessage] = useState<ChatMessage | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTypingEmitRef = useRef(0);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  // ─── Combined entries (chat + system messages) ─────────────────

  const entries = useMemo(() => getChatEntries(store), [store]);

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
      setMessage(val);
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
    [handleTyping],
  );

  const filteredMembers = useMemo(() => {
    if (!room || !showMentionDropdown) return [];
    return room.members.filter(
      (m) =>
        m.userId !== room.myUserId &&
        m.userName.toLowerCase().includes(mentionFilter),
    );
  }, [room, showMentionDropdown, mentionFilter]);

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
      setReplyTo(null);
      setShowMentionDropdown(false);
    },
    [message, room, replyTo],
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
      const myRole = room.members.find((m) => m.userId === room.myUserId)?.role;
      if (myRole !== 'host' && myRole !== 'moderator') return;
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

  const isHostOrMod = (() => {
    const myRole = room.members.find((m) => m.userId === room.myUserId)?.role;
    return myRole === 'host' || myRole === 'moderator';
  })();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-(--rmhtube-border)">
        <h3 className="text-sm font-semibold text-(--rmhtube-text-muted)">Chat</h3>
      </div>

      {/* Pinned Message Banner */}
      {room.pinnedMessage && (
        <div className="flex items-start gap-2 px-3 py-2 border-b border-(--rmhtube-border) bg-(--rmhtube-surface)">
          <Pin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-(--rmhtube-accent)" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-(--rmhtube-accent)">
              Pinned by {room.pinnedMessage.userName}
            </p>
            <p className="text-xs text-(--rmhtube-text) truncate">
              {room.pinnedMessage.content}
            </p>
          </div>
          {isHostOrMod && (
            <button
              onClick={() => handlePin(room.pinnedMessage!.id, false)}
              className="shrink-0 p-0.5 rounded hover:bg-(--rmhtube-border) transition-colors"
              title="Unpin message"
            >
              <X className="h-3.5 w-3.5 text-(--rmhtube-text-muted)" />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {entries.length === 0 ? (
          <p className="text-xs text-center py-4 text-(--rmhtube-text-dim)">
            No messages yet
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
                  <span className="text-xs italic text-(--rmhtube-text-dim)">
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
                className="group relative rounded-md px-2 py-1 transition-colors hover:bg-(--rmhtube-surface)"
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
                    <Reply className="h-3 w-3 text-(--rmhtube-text-dim) rotate-180" />
                    <span className="text-[11px] text-(--rmhtube-text-dim) truncate max-w-50">
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
                    <Pin className="h-3 w-3 shrink-0 text-(--rmhtube-accent) self-center" />
                  )}

                  {/* Author name */}
                  <span
                    className={`font-semibold shrink-0 ${
                      msg.userId === room.hostUserId
                        ? 'text-(--rmhtube-accent)'
                        : 'text-(--rmhtube-info)'
                    }`}
                  >
                    {msg.userName}
                  </span>

                  {/* Message content (URLs hidden when embedded below) */}
                  {(() => {
                    const stripped = stripEmbedUrls(msg.content);
                    return stripped ? (
                      <span className="text-(--rmhtube-text) wrap-break-word min-w-0">
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
                      className="shrink-0 text-xs font-mono font-semibold text-(--rmhtube-accent) hover:underline"
                      title={`Jump to ${formatDuration(msg.timestamp)}`}
                    >
                      {formatDuration(msg.timestamp)}
                    </button>
                  )}

                  {/* Message timestamp */}
                  {settings.showTimestamps && (
                    <span className="shrink-0 text-[11px] text-(--rmhtube-text-dim) ml-auto">
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
                              ? 'border-(--rmhtube-accent) bg-(--rmhtube-accent)/10 text-(--rmhtube-accent)'
                              : 'border-(--rmhtube-border) bg-(--rmhtube-surface) text-(--rmhtube-text-muted) hover:border-(--rmhtube-text-muted)'
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
                  <div className="absolute -top-2 right-1 flex items-center gap-0.5 rounded-md border border-(--rmhtube-border) bg-(--rmhtube-bg) shadow-sm z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setReplyTo(msg);
                        inputRef.current?.focus();
                      }}
                      className="p-1 rounded hover:bg-(--rmhtube-surface) transition-colors"
                      title="Reply"
                    >
                      <Reply className="h-3.5 w-3.5 text-(--rmhtube-text-muted)" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setReactionPickerMessageId(
                          reactionPickerMessageId === msg.id ? null : msg.id,
                        );
                      }}
                      className="p-1 rounded hover:bg-(--rmhtube-surface) transition-colors"
                      title="React"
                    >
                      <SmilePlus className="h-3.5 w-3.5 text-(--rmhtube-text-muted)" />
                    </button>
                  </div>
                )}

                {/* Reaction emoji picker */}
                {reactionPickerMessageId === msg.id && (
                  <div
                    className="absolute -top-8 right-1 flex items-center gap-0.5 rounded-lg border border-(--rmhtube-border) bg-(--rmhtube-bg) shadow-lg px-1 py-0.5 z-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {CHAT_REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(msg.id, emoji)}
                        className="p-1 rounded hover:bg-(--rmhtube-surface) transition-colors text-sm"
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
        <div className="px-3 py-1 border-t border-(--rmhtube-border)">
          <p className="text-xs italic text-(--rmhtube-text-dim) animate-pulse">
            {typingText}
          </p>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-(--rmhtube-border) bg-(--rmhtube-surface)">
          <Reply className="h-3.5 w-3.5 shrink-0 text-(--rmhtube-accent) rotate-180" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-(--rmhtube-accent)">
              {replyTo.userName}
            </span>
            <p className="text-xs text-(--rmhtube-text-muted) truncate">
              {replyTo.content}
            </p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="shrink-0 p-0.5 rounded hover:bg-(--rmhtube-border) transition-colors"
          >
            <X className="h-3.5 w-3.5 text-(--rmhtube-text-muted)" />
          </button>
        </div>
      )}

      {/* Mention autocomplete dropdown */}
      {showMentionDropdown && filteredMembers.length > 0 && (
        <div
          ref={mentionDropdownRef}
          className="mx-3 mb-1 rounded-lg border border-(--rmhtube-border) bg-(--rmhtube-bg) shadow-lg overflow-hidden max-h-32 overflow-y-auto"
        >
          {filteredMembers.map((member) => (
            <button
              key={member.userId}
              onClick={() => insertMention(member.userName)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-(--rmhtube-surface) transition-colors"
            >
              <AtSign className="h-3.5 w-3.5 text-(--rmhtube-text-dim)" />
              <span className="text-(--rmhtube-text)">{member.userName}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex gap-2 p-3 border-t border-(--rmhtube-border)"
      >
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={handleInputChange}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={replyTo ? `Reply to ${replyTo.userName}...` : 'Type a message...'}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm border border-(--rmhtube-border) bg-(--rmhtube-bg) text-(--rmhtube-text) placeholder:text-(--rmhtube-text-dim) outline-none focus:ring-1 focus:ring-(--rmhtube-accent)"
        />
        <button
          type="submit"
          disabled={!message.trim()}
          className="shrink-0 rounded-lg px-3 py-2 transition-colors disabled:opacity-50 bg-(--rmhtube-accent) text-white hover:bg-(--rmhtube-accent-hover)"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {/* Context menu (pin/unpin) — for host/mod */}
      {contextMenuMessage && contextMenuPos && (
        <div
          className="fixed z-50 rounded-lg border border-(--rmhtube-border) bg-(--rmhtube-bg) shadow-xl overflow-hidden py-1 min-w-35"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {room.pinnedMessage?.id === contextMenuMessage.id ? (
            <button
              onClick={() => handlePin(contextMenuMessage.id, false)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-(--rmhtube-text) hover:bg-(--rmhtube-surface) transition-colors"
            >
              <Pin className="h-3.5 w-3.5" />
              Unpin Message
            </button>
          ) : (
            <button
              onClick={() => handlePin(contextMenuMessage.id, true)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-(--rmhtube-text) hover:bg-(--rmhtube-surface) transition-colors"
            >
              <Pin className="h-3.5 w-3.5" />
              Pin Message
            </button>
          )}
          <button
            onClick={() => {
              setReplyTo(contextMenuMessage);
              setContextMenuMessage(null);
              setContextMenuPos(null);
              inputRef.current?.focus();
            }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-(--rmhtube-text) hover:bg-(--rmhtube-surface) transition-colors"
          >
            <Reply className="h-3.5 w-3.5" />
            Reply
          </button>
        </div>
      )}
    </div>
  );
}
