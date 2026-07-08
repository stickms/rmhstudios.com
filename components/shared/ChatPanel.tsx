/**
 * ChatPanel — Shared chat component with GIF embeds and reactions.
 *
 * Used by RMHStudy, RMHType, and potentially others.
 * Themed via CSS custom property prefix (e.g., "rmhstudy", "rmhtype").
 */
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Send, SmilePlus } from 'lucide-react';
import { CHAT_REACTION_EMOJIS, CHAT_MAX_LENGTH } from '@/lib/shared/chat-constants';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import ChatMediaEmbed, { stripEmbedUrls } from './ChatMediaEmbed';

// ─── Types ───────────────────────────────────────────────────────

export interface ChatPanelMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
  reactions: Record<string, string[]>;
}

interface ChatPanelProps {
  messages: ChatPanelMessage[];
  onSendMessage: (message: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  myUserId: string;
  hostUserId?: string;
  themePrefix: string;
  showReactions?: boolean;
  showMediaEmbeds?: boolean;
  className?: string;
  placeholder?: string;
}

// ─── Component ───────────────────────────────────────────────────

export default function ChatPanel({
  messages,
  onSendMessage,
  onReact,
  myUserId,
  hostUserId,
  themePrefix,
  showReactions = true,
  showMediaEmbeds = true,
  className = '',
  placeholder,
}: ChatPanelProps) {
  const { t } = useTranslation('shared');
  const [message, setMessage] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; right: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const messageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);
  const insertEmoji = useEmojiInsert(inputRef, message, setMessage);

  // ─── Auto-scroll on new messages ─────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // ─── Close reaction picker on outside click ──────────────────

  useEffect(() => {
    if (!reactionPickerMessageId) return;
    const handler = () => {
      setReactionPickerMessageId(null);
      setPickerPos(null);
    };
    const timer = setTimeout(() => {
      window.addEventListener('click', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handler);
    };
  }, [reactionPickerMessageId]);

  // ─── Close popups on scroll ──────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = () => {
      setHoveredMessageId(null);
      setReactionPickerMessageId(null);
      setPickerPos(null);
    };
    container.addEventListener('scroll', handler, { passive: true });
    return () => container.removeEventListener('scroll', handler);
  }, []);

  // ─── Send message ────────────────────────────────────────────

  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const content = message.trim();
      if (!content) return;
      onSendMessage(content);
      setMessage('');
    },
    [message, onSendMessage],
  );

  // ─── Reaction handler ────────────────────────────────────────

  const handleReaction = useCallback(
    (messageId: string, emoji: string) => {
      onReact?.(messageId, emoji);
      setReactionPickerMessageId(null);
      setPickerPos(null);
    },
    [onReact],
  );

  // ─── Compute fixed position from message element ─────────────

  const getMessageRect = useCallback((messageId: string) => {
    const el = messageRefsMap.current.get(messageId);
    if (!el) return null;
    return el.getBoundingClientRect();
  }, []);

  const openReactionPicker = useCallback((messageId: string) => {
    const rect = getMessageRect(messageId);
    if (!rect) return;
    setReactionPickerMessageId(messageId);
    setPickerPos({
      top: rect.top - 4,
      right: window.innerWidth - rect.right + 4,
    });
  }, [getMessageRect]);

  // ─── Hover action button position ────────────────────────────

  const getHoverButtonPos = useCallback((messageId: string) => {
    const rect = getMessageRect(messageId);
    if (!rect) return null;
    return {
      top: rect.top - 8,
      right: window.innerWidth - rect.right + 4,
    };
  }, [getMessageRect]);

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-1.5">
        {messages.length === 0 ? (
          <p
            className="text-xs text-center py-8"
            style={{ color: `var(--${themePrefix}-text-dim)` }}
          >
            {t('no-messages-yet', { defaultValue: 'No messages yet' })}
          </p>
        ) : (
          messages.map((msg) => {
            const hasReactions = showReactions && Object.keys(msg.reactions).length > 0;
            const strippedContent = showMediaEmbeds ? stripEmbedUrls(msg.message) : msg.message;

            return (
              <div
                key={msg.id}
                ref={(el) => {
                  if (el) messageRefsMap.current.set(msg.id, el);
                  else messageRefsMap.current.delete(msg.id);
                }}
                className="group rounded-site-sm px-2 py-1 transition-colors"
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => {
                  // Don't clear hover if picker is open for this message
                  if (reactionPickerMessageId !== msg.id) {
                    setHoveredMessageId(null);
                  }
                }}
              >
                {/* Message row */}
                <div className="flex items-baseline gap-1.5 text-sm">
                  <span
                    className="font-semibold shrink-0"
                    style={{
                      color:
                        hostUserId && msg.userId === hostUserId
                          ? `var(--${themePrefix}-accent)`
                          : `var(--${themePrefix}-info, var(--${themePrefix}-accent))`,
                    }}
                  >
                    {msg.userName}
                  </span>

                  {strippedContent && (
                    <span
                      className="wrap-break-word min-w-0"
                      style={{ color: `var(--${themePrefix}-text)` }}
                    >
                      {strippedContent}
                    </span>
                  )}
                </div>

                {/* Inline media embeds */}
                {showMediaEmbeds && (
                  <ChatMediaEmbed content={msg.message} themePrefix={themePrefix} />
                )}

                {/* Reactions display */}
                {hasReactions && (
                  <div className="flex flex-wrap gap-1 mt-1 pl-3">
                    {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                      const hasReacted = userIds.includes(myUserId);
                      return (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(msg.id, emoji)}
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs transition-colors"
                          style={{
                            borderWidth: 1,
                            borderStyle: 'solid',
                            borderColor: hasReacted
                              ? `var(--${themePrefix}-accent)`
                              : `var(--${themePrefix}-border)`,
                            backgroundColor: hasReacted
                              ? `color-mix(in srgb, var(--${themePrefix}-accent) 10%, transparent)`
                              : `var(--${themePrefix}-surface)`,
                            color: hasReacted
                              ? `var(--${themePrefix}-accent)`
                              : `var(--${themePrefix}-text-muted)`,
                          }}
                        >
                          <span>{emoji}</span>
                          <span className="font-medium">{userIds.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Fixed-position hover action button (rendered via portal to avoid overflow clip) */}
      {showReactions && onReact && hoveredMessageId && (() => {
        const pos = getHoverButtonPos(hoveredMessageId);
        if (!pos) return null;
        return createPortal(
          <div
            className="flex items-center gap-0.5 rounded-site-sm shadow-sm"
            style={{
              position: 'fixed',
              top: pos.top,
              right: pos.right,
              zIndex: 50,
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: `var(--${themePrefix}-border)`,
              backgroundColor: `var(--${themePrefix}-bg)`,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (reactionPickerMessageId === hoveredMessageId) {
                  setReactionPickerMessageId(null);
                  setPickerPos(null);
                } else {
                  openReactionPicker(hoveredMessageId);
                }
              }}
              className="p-1 rounded transition-colors"
              title={t('react', { defaultValue: 'React' })}
              style={{ color: `var(--${themePrefix}-text-muted)` }}
            >
              <SmilePlus className="h-3.5 w-3.5" />
            </button>
          </div>,
          document.body,
        );
      })()}

      {/* Fixed-position emoji picker (rendered via portal to avoid overflow clip) */}
      {reactionPickerMessageId && pickerPos && createPortal(
        <div
          className="flex items-center gap-0.5 rounded-site-sm shadow-lg px-1 py-0.5"
          style={{
            position: 'fixed',
            top: pickerPos.top - 30,
            right: pickerPos.right,
            zIndex: 51,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: `var(--${themePrefix}-border)`,
            backgroundColor: `var(--${themePrefix}-bg)`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {CHAT_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReaction(reactionPickerMessageId, emoji)}
              className="p-1 rounded transition-colors text-sm"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>,
        document.body,
      )}

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex gap-2 p-3"
        style={{ borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: `var(--${themePrefix}-border)` }}
      >
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={placeholder ?? t('chat-placeholder', { defaultValue: 'Chat...' })}
          className="flex-1 min-w-0 px-3 py-2 rounded-site-sm text-sm outline-none"
          style={{
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: `var(--${themePrefix}-border)`,
            backgroundColor: `var(--${themePrefix}-bg)`,
            color: `var(--${themePrefix}-text)`,
          }}
        />
        <EmojiPickerButton direction="up" onSelect={insertEmoji} className="shrink-0" />
        <button
          type="submit"
          disabled={!message.trim()}
          className="shrink-0 rounded-site-sm px-3 py-2 transition-colors disabled:opacity-50 text-white"
          style={{ backgroundColor: `var(--${themePrefix}-accent)` }}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
