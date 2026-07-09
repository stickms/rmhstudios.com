'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, ArrowLeft, Send, ImagePlus, ImagePlay, X, Plus } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Link } from '@tanstack/react-router';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useSession, useResolvedUser } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { GhostTextArea } from './GhostTextArea';
import { PostImageGrid } from './PostImageGrid';
import { useMessageSuggestion } from '@/lib/useMessageSuggestion';
import { useTranslation } from "react-i18next";
import ChatMediaEmbed, { stripEmbedUrls, extractMediaEmbeds } from '@/components/shared/ChatMediaEmbed';
import { GifPicker } from '@/components/feed/GifPicker';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import { useEmojiShortcodes } from '@/lib/emoji/use-emoji-shortcodes';
import { ReactionMenu } from '@/components/shared/ReactionMenu';
import { ReactionChips } from '@/components/shared/ReactionChips';
import { groupReactions, type ReactionRow } from '@/lib/social/reactions';

interface Message {
  id: string;
  content: string;
  senderId: string;
  read: boolean;
  createdAt: string;
  gifUrl?: string | null;
  imageUrls?: string[];
  reactions?: ReactionRow[];
}

const MAX_DM_IMAGES = 4;

interface OtherUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
}

export function ConversationView({
  conversationId,
  initialOtherUser,
}: {
  conversationId: string;
  /** The other participant, prefetched by the route loader (avoids fetching the
   *  entire inbox client-side just to find them). */
  initialOtherUser?: OtherUser | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(initialOtherUser ?? null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  // Pending rich media to attach to the next message.
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reactionMenu, setReactionMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const initialFetched = useRef(false);
  // Typing-indicator bookkeeping
  const typingActiveRef = useRef(false);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Shared long-press timer for opening the reaction menu on touch devices.
  const touchTimer = useRef<number | null>(null);

  const { t } = useTranslation("feed");
  const { data: session } = useSession();
  const { resolved: resolvedUser } = useResolvedUser();
  const insertEmoji = useEmojiInsert(inputRef, input, setInput);
  const shortcodes = useEmojiShortcodes({ ref: inputRef, value: input, onChange: setInput });

  // Close the attach (+) menu on outside click.
  useEffect(() => {
    if (!attachOpen) return;
    const onDown = (e: MouseEvent) => {
      if (attachRef.current && !attachRef.current.contains(e.target as Node)) setAttachOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [attachOpen]);

  // AI inline autocomplete, grounded in the recent DM conversation.
  const { suggestion, clear: clearSuggestion } = useMessageSuggestion({
    draft: input,
    context: messages.map((m) => ({
      author: m.senderId === session?.user.id ? 'Me' : otherUser?.name || 'Them',
      content: m.content,
    })),
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Fetch conversation info (other user) from conversations list
  const fetchConversationInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/messages');
      if (!res.ok) return;
      const data = await res.json();
      const conv = data.conversations.find(
        (c: { id: string }) => c.id === conversationId
      );
      if (conv) {
        setOtherUser(conv.otherUser);
      }
    } catch {
      // Ignore
    }
  }, [conversationId]);

  const fetchMessages = useCallback(async (isInitial = false) => {
    try {
      const params = new URLSearchParams();
      if (!isInitial && olderCursor) params.set('cursor', olderCursor);
      const res = await fetch(`/api/messages/${encodeURIComponent(conversationId)}?${params}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();

      if (isInitial) {
        setMessages(data.messages);
        setHasOlder(data.hasMore);
        setOlderCursor(data.nextCursor);
        // Scroll to bottom after initial load
        setTimeout(scrollToBottom, 100);
      } else {
        // Prepend older messages
        setMessages((prev) => [...data.messages, ...prev]);
        setHasOlder(data.hasMore);
        setOlderCursor(data.nextCursor);
      }
    } catch (err) {
      console.error('Fetch messages error:', err);
    } finally {
      setLoading(false);
      setLoadingOlder(false);
    }
  }, [conversationId, olderCursor, scrollToBottom]);

  const markAsRead = useCallback(() => {
    fetch(`/api/messages/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
    }).catch(() => {});
  }, [conversationId]);

  // Handle incoming SSE message
  const handleIncomingMessage = useCallback((msg: Message) => {
    // A delivered message means the other side is no longer typing.
    setOtherTyping(false);
    if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
    setMessages((prev) => {
      // Skip if we already have this message (e.g. optimistic send)
      if (prev.some((m) => m.id === msg.id)) return prev;
      setTimeout(scrollToBottom, 100);
      return [...prev, msg];
    });
    // Mark as read since the conversation is open
    markAsRead();
  }, [scrollToBottom, markAsRead]);

  // Show/hide the other participant's typing indicator (with a safety timeout
  // in case the matching "stopped typing" event never arrives).
  const handleTypingEvent = useCallback((isTyping: boolean) => {
    if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
    setOtherTyping(isTyping);
    if (isTyping) {
      setTimeout(scrollToBottom, 100);
      otherTypingTimer.current = setTimeout(() => setOtherTyping(false), 10000);
    }
  }, [scrollToBottom]);

  // POST our own typing state to the other participant (debounced stop).
  const sendTyping = useCallback((isTyping: boolean) => {
    fetch(`/api/messages/${encodeURIComponent(conversationId)}/typing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTyping }),
    }).catch(() => {});
  }, [conversationId]);

  const handleTyping = useCallback(() => {
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      sendTyping(true);
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      typingActiveRef.current = false;
      sendTyping(false);
    }, 3000);
  }, [sendTyping]);

  const stopTyping = useCallback(() => {
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      sendTyping(false);
    }
  }, [sendTyping]);

  // Toggle the viewer's reaction row on a message (optimistic on raw rows).
  const applyRowToggle = useCallback((messageId: string, emoji: string) => {
    const myId = session?.user.id;
    if (!myId) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const rows = m.reactions ?? [];
        const mine = rows.some((r) => r.emoji === emoji && r.userId === myId);
        return {
          ...m,
          reactions: mine
            ? rows.filter((r) => !(r.emoji === emoji && r.userId === myId))
            : [...rows, { emoji, userId: myId }],
        };
      }),
    );
  }, [session?.user.id]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!session) return;
    applyRowToggle(messageId, emoji);
    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(conversationId)}/react`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emoji }),
      });
      if (!res.ok) throw new Error('react failed');
    } catch {
      // Roll back the optimistic toggle (toggling again is its own inverse).
      applyRowToggle(messageId, emoji);
    }
  }, [session, conversationId, applyRowToggle]);

  useEffect(() => {
    if (!initialFetched.current && session) {
      initialFetched.current = true;
      fetchMessages(true);
      // Loader already provided the other participant — only fall back to the
      // (previously whole-inbox) lookup when it didn't.
      if (!otherUser) fetchConversationInfo();
    }
  }, [session, fetchMessages, fetchConversationInfo, otherUser]);

  // Mark as read on mount and when tab regains focus
  useEffect(() => {
    if (!session) return;
    markAsRead();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markAsRead();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const onFocus = () => markAsRead();
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [conversationId, session, markAsRead]);

  // SSE connection for real-time incoming messages
  useEffect(() => {
    if (!session) return;

    let eventSource: EventSource | null = null;
    let cancelled = false;
    let retryCount = 0;

    const connect = () => {
      if (cancelled) return;
      eventSource = new EventSource('/api/messages/stream');

      eventSource.addEventListener('new-message', (e) => {
        try {
          const msg = JSON.parse(e.data);
          // Only handle messages for this conversation
          if (msg.conversationId === conversationId && msg.senderId !== session.user.id) {
            handleIncomingMessage({
              id: msg.id,
              content: msg.content,
              senderId: msg.senderId,
              read: msg.read,
              createdAt: msg.createdAt,
              gifUrl: msg.gifUrl,
              imageUrls: msg.imageUrls,
            });
          }
          retryCount = 0;
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.addEventListener('message-reaction', (e) => {
        try {
          // Payload is { conversationId, messageId, reactions } with no `type`
          // field — the named SSE event already scopes it, matching how this
          // stream's new-message/typing payloads are shaped.
          const data = JSON.parse(e.data);
          if (data.conversationId === conversationId) {
            setMessages((prev) =>
              prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m)),
            );
          }
          retryCount = 0;
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.addEventListener('typing', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.conversationId === conversationId && data.senderId !== session.user.id) {
            handleTypingEvent(Boolean(data.isTyping));
          }
          retryCount = 0;
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;
        if (cancelled) return;
        retryCount++;
        const delay = Math.min(retryCount * 2000, 10000);
        setTimeout(connect, delay);
      };
    };

    connect();

    const onBeforeUnload = () => {
      cancelled = true;
      eventSource?.close();
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      cancelled = true;
      eventSource?.close();
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [session, conversationId, handleIncomingMessage, handleTypingEvent]);

  // Reset the typing indicator and tell the other side we stopped when the
  // conversation changes or the component unmounts.
  useEffect(() => {
    return () => {
      stopTyping();
      if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
      setOtherTyping(false);
    };
  }, [conversationId, stopTyping]);

  const handleLoadOlder = () => {
    if (loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    fetchMessages(false);
  };

  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_DM_IMAGES - imageUrls.length;
    if (remaining <= 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      Array.from(files).slice(0, remaining).forEach((f) => form.append('images', f));
      const res = await fetch('/api/rmharks/image', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t('failed-to-upload-image', { defaultValue: 'Failed to upload image' }));
        return;
      }
      const data = await res.json();
      if (Array.isArray(data.urls)) {
        setImageUrls((prev) => [...prev, ...data.urls].slice(0, MAX_DM_IMAGES));
      }
    } catch {
      setError(t('failed-to-upload-image', { defaultValue: 'Failed to upload image' }));
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    const content = input.trim();
    const pendingGif = gifUrl;
    const pendingImages = imageUrls;
    if ((!content && !pendingGif && pendingImages.length === 0) || sending) return;

    setSending(true);
    setError(null);

    // Optimistic add
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      content,
      senderId: session!.user.id,
      read: false,
      createdAt: new Date().toISOString(),
      gifUrl: pendingGif,
      imageUrls: pendingImages,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInput('');
    shortcodes.dismiss();
    setGifUrl(null);
    setImageUrls([]);
    clearSuggestion();
    stopTyping();
    setTimeout(scrollToBottom, 50);

    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(conversationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          ...(pendingGif ? { gifUrl: pendingGif } : {}),
          ...(pendingImages.length ? { imageUrls: pendingImages } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("failed-to-send-message", { defaultValue: "Failed to send message" }));
        // Remove optimistic message and restore the draft + media.
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(content);
        setGifUrl(pendingGif);
        setImageUrls(pendingImages);
        return;
      }

      const data = await res.json();
      // Replace optimistic message with real one
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? data.message : m))
      );
    } catch {
      setError(t("failed-to-send-message", { defaultValue: "Failed to send message" }));
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(content);
      setGifUrl(pendingGif);
      setImageUrls(pendingImages);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDateSeparator = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return t("today", { defaultValue: "Today" });
    if (d.toDateString() === yesterday.toDateString()) return t("yesterday", { defaultValue: "Yesterday" });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const shouldShowDateSeparator = (msg: Message, prevMsg: Message | null) => {
    if (!prevMsg) return true;
    const d1 = new Date(msg.createdAt).toDateString();
    const d2 = new Date(prevMsg.createdAt).toDateString();
    return d1 !== d2;
  };

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <p className="text-lg font-medium text-site-text mb-1">{t("sign-in-to-view-messages", { defaultValue: "Sign in to view messages" })}</p>
        <Link to="/login" search={{ callbackURL: undefined }}>
          <Button variant="accent" size="sm">{t("sign-in", { defaultValue: "Sign In" })}</Button>
        </Link>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <p className="text-lg font-medium text-site-text mb-1">{t("conversation-not-found", { defaultValue: "Conversation not found" })}</p>
        <Link to="/messages">
          <Button variant="accent" size="sm">{t("back-to-messages", { defaultValue: "Back to Messages" })}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-site-bg/85 backdrop-blur-md border-b border-site-border shrink-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link to="/messages" className="p-1.5 -ml-1.5 rounded-site-sm hover:bg-site-surface transition-colors">
            <ArrowLeft className="w-5 h-5 text-site-text" />
          </Link>
          {otherUser && (
            <Link
              to={`/u/${(otherUser as any).handle || otherUser.id}` as string}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <UserAvatar src={otherUser.image ?? undefined} alt={otherUser.name || 'User'} size={32} fallbackName={otherUser.name ?? undefined} className="ring-2 ring-site-bg" />
              <div>
                <p className="font-(family-name:--site-font-display) font-bold text-sm text-site-text">
                  {otherUser.name || 'Unknown'}
                </p>
                {otherUser.username && (
                  <p className="text-xs text-site-text-dim">@{otherUser.username}</p>
                )}
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={32} />
          </div>
        ) : (
          <>
            {hasOlder && (
              <div className="flex justify-center mb-4">
                <button
                  onClick={handleLoadOlder}
                  disabled={loadingOlder}
                  className="text-sm text-site-accent hover:underline disabled:opacity-50"
                >
                  {loadingOlder ? t("loading", { defaultValue: "Loading..." }) : t("load-older-messages", { defaultValue: "Load older messages" })}
                </button>
              </div>
            )}

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-site-text-muted">
                  {t("no-messages-yet", { defaultValue: "No messages yet. Send one to start the conversation!" })}
                </p>
              </div>
            )}

            {messages.map((msg, i) => {
              const isSelf = msg.senderId === session.user.id;
              const prevMsg = i > 0 ? messages[i - 1] : null;
              const nextMsg = i < messages.length - 1 ? messages[i + 1] : null;
              const showDate = shouldShowDateSeparator(msg, prevMsg);
              // Show avatar on the last message in a consecutive group from the same sender
              const isFirstInGroup = !prevMsg || prevMsg.senderId !== msg.senderId || showDate;
              const isLastInGroup = !nextMsg || nextMsg.senderId !== msg.senderId || shouldShowDateSeparator(nextMsg, msg);

              const avatarUser = isSelf
                ? { image: resolvedUser?.image || session.user.image, name: resolvedUser?.name || session.user.name }
                : { image: otherUser?.image, name: otherUser?.name };

              // Build per-corner rounding for grouped bubbles
              // Fully rounded = rounded-site (16px). Tight side = rounded-site-sm (6px).
              // The "inner" side (facing own messages) gets tightened when grouped.
              let bubbleRounding: string;
              if (isSelf) {
                // Right-aligned: inner side is right
                const tl = 'rounded-tl-site';
                const bl = 'rounded-bl-site';
                const tr = isFirstInGroup ? 'rounded-tr-site' : 'rounded-tr-site-sm';
                const br = isLastInGroup ? 'rounded-br-site-sm' : 'rounded-br-site-sm';
                bubbleRounding = `${tl} ${tr} ${bl} ${br}`;
              } else {
                // Left-aligned: inner side is left
                const tr = 'rounded-tr-site';
                const br = 'rounded-br-site';
                const tl = isFirstInGroup ? 'rounded-tl-site' : 'rounded-tl-site-sm';
                const bl = isLastInGroup ? 'rounded-bl-site-sm' : 'rounded-bl-site-sm';
                bubbleRounding = `${tl} ${tr} ${bl} ${br}`;
              }

              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="flex items-center justify-center my-4">
                      <span className="text-xs text-site-text-dim bg-site-surface px-3 py-1 rounded-full">
                        {formatDateSeparator(msg.createdAt)}
                      </span>
                    </div>
                  )}
                  <div className={`flex items-end gap-2 ${isLastInGroup ? 'mb-3' : 'mb-0.5'} ${isSelf ? 'flex-row-reverse' : ''}`}>
                    {/* Avatar — visible only on last message in group */}
                    {isLastInGroup ? (
                      <UserAvatar src={avatarUser.image ?? undefined} alt={avatarUser.name || 'User'} size={28} fallbackName={avatarUser.name ?? undefined} />
                    ) : (
                      <div className="w-7 shrink-0" />
                    )}
                    <div
                      className={`max-w-[75%] ${bubbleRounding} px-4 py-2.5 text-sm break-words ${
                        isSelf
                          ? 'bg-site-accent text-site-bg'
                          : 'bg-site-text text-site-bg'
                      }`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setReactionMenu({ x: e.clientX, y: e.clientY, messageId: msg.id });
                      }}
                      onTouchStart={(e) => {
                        const t = e.touches[0];
                        touchTimer.current = window.setTimeout(
                          () => setReactionMenu({ x: t.clientX, y: t.clientY, messageId: msg.id }),
                          500,
                        );
                      }}
                      onTouchMove={() => {
                        if (touchTimer.current) {
                          clearTimeout(touchTimer.current);
                          touchTimer.current = null;
                        }
                      }}
                      onTouchEnd={() => {
                        if (touchTimer.current) {
                          clearTimeout(touchTimer.current);
                          touchTimer.current = null;
                        }
                      }}
                    >
                      {stripEmbedUrls(msg.content).trim() && (
                        <p className="whitespace-pre-wrap">{stripEmbedUrls(msg.content)}</p>
                      )}
                      {/* Legacy: media embedded as URLs inside the text. */}
                      {extractMediaEmbeds(msg.content).length > 0 && (
                        <ChatMediaEmbed content={msg.content} themePrefix="site" />
                      )}
                      {/* Structured rich media. */}
                      {msg.imageUrls && msg.imageUrls.length > 0 && (
                        <PostImageGrid urls={msg.imageUrls} className="mt-1.5 rounded-site-sm overflow-hidden" />
                      )}
                      {msg.gifUrl && (
                        <img
                          src={msg.gifUrl}
                          alt=""
                          className="mt-1.5 max-h-60 w-auto rounded-site-sm"
                          loading="lazy"
                        />
                      )}
                      <p className={`text-[10px] mt-1 ${isSelf ? 'text-site-bg/60' : 'text-site-bg/55'}`}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                  {(msg.reactions?.length ?? 0) > 0 && (
                    <ReactionChips
                      reactions={groupReactions(msg.reactions ?? [], session.user.id)}
                      onToggle={(emoji) => toggleReaction(msg.id, emoji)}
                      className={`mt-1 ${isSelf ? 'justify-end' : ''}`}
                    />
                  )}
                </div>
              );
            })}

            {otherTyping && (
              <div className="flex items-end gap-2 mb-3">
                <UserAvatar
                  src={otherUser?.image ?? undefined}
                  alt={otherUser?.name || 'User'}
                  size={28}
                  fallbackName={otherUser?.name ?? undefined}
                />
                <div className="bg-site-text text-site-bg rounded-tl-site-sm rounded-tr-site rounded-br-site rounded-bl-site-sm px-4 py-3">
                  <div className="flex items-center gap-1" aria-label={t("user-is-typing", { name: otherUser?.name || t("user-fallback", { defaultValue: "User" }), defaultValue: "{{name}} is typing" })}>
                    <span className="w-1.5 h-1.5 rounded-full bg-site-bg/50 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-site-bg/50 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-site-bg/50 animate-bounce" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-site-danger/10 border-t border-site-danger/20">
          <p className="text-sm text-site-danger">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-site-border bg-site-bg px-4 py-3">
        {showGifPicker && (
          <GifPicker
            className="mx-2 mb-2"
            onClose={() => setShowGifPicker(false)}
            onSelect={(u) => {
              setGifUrl(u);
              setShowGifPicker(false);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          />
        )}

        {/* Pending media preview */}
        {(imageUrls.length > 0 || gifUrl) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {imageUrls.map((url) => (
              <div key={url} className="relative">
                <img src={url} alt="" className="h-20 w-20 rounded-site-sm object-cover" />
                <button
                  type="button"
                  aria-label={t('remove-image', { defaultValue: 'Remove image' })}
                  onClick={() => setImageUrls((prev) => prev.filter((u) => u !== url))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-black/70 p-0.5 text-white hover:bg-black"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {gifUrl && (
              <div className="relative">
                <img src={gifUrl} alt="" className="h-20 w-auto rounded-site-sm" />
                <button
                  type="button"
                  aria-label={t('remove-gif', { defaultValue: 'Remove GIF' })}
                  onClick={() => setGifUrl(null)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-black/70 p-0.5 text-white hover:bg-black"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleImageFiles(e.currentTarget.files)}
        />
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <GhostTextArea
              ref={inputRef}
              value={input}
              suggestion={suggestion}
              onAcceptSuggestion={() => {
                setInput((v) => v + suggestion);
                clearSuggestion();
              }}
              onChange={(e) => {
                shortcodes.onValueChange(e.target.value);
                if (e.target.value.trim()) handleTyping();
                else stopTyping();
              }}
              onBlur={stopTyping}
              onKeyDown={(e) => {
                if (shortcodes.onKeyDown(e)) return;
                handleKeyDown(e);
              }}
              placeholder={t("type-a-message", { defaultValue: "Type a message..." })}
              rows={1}
              maxLength={2000}
              className="bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-site px-4 py-2.5 border border-site-border outline-none focus:border-site-accent transition-colors resize-none max-h-32 overflow-y-auto"
              style={{ minHeight: '42px' }}
            />
            {shortcodes.menu}
          </div>
          <EmojiPickerButton direction="up" onSelect={insertEmoji} />
          {/* Attach (+) menu — image, GIF. Mirrors the rmhark composer. */}
          <div className="relative shrink-0" ref={attachRef}>
            <button
              type="button"
              aria-label={t("add-to-message", { defaultValue: "Add to message" })}
              aria-expanded={attachOpen}
              onClick={() => setAttachOpen((v) => !v)}
              disabled={uploading}
              className="h-[42px] rounded-site px-3 text-site-text-dim transition-colors hover:bg-site-surface hover:text-site-accent disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
            </button>
            {attachOpen && (
              <div className="absolute bottom-full right-0 z-30 mb-1 w-40 rounded-site border border-site-border bg-site-bg py-1 shadow-xl">
                <button
                  type="button"
                  disabled={imageUrls.length >= MAX_DM_IMAGES}
                  onClick={() => { setAttachOpen(false); imageInputRef.current?.click(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-site-text hover:bg-site-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ImagePlus className="h-4 w-4 text-site-text-dim" /> {t("menu-add-image", { defaultValue: "Add Image" })}
                </button>
                <button
                  type="button"
                  onClick={() => { setAttachOpen(false); setShowGifPicker((v) => !v); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-site-text hover:bg-site-surface"
                >
                  <ImagePlay className="h-4 w-4 text-site-text-dim" /> {t("menu-add-gif", { defaultValue: "Add GIF" })}
                </button>
              </div>
            )}
          </div>
          <Button
            variant="accent"
            size="sm"
            disabled={(!input.trim() && !gifUrl && imageUrls.length === 0) || sending}
            onClick={handleSend}
            className="rounded-site h-[42px] px-3"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {reactionMenu && (
        <ReactionMenu
          x={reactionMenu.x}
          y={reactionMenu.y}
          onSelect={(emoji) => toggleReaction(reactionMenu.messageId, emoji)}
          onClose={() => setReactionMenu(null)}
        />
      )}
    </div>
  );
}
