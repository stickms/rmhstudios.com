'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, ArrowLeft, Send } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useSession, useResolvedUser } from '@/components/Providers';
import { Button } from '@/components/ui/button';

interface Message {
  id: string;
  content: string;
  senderId: string;
  read: boolean;
  createdAt: string;
}

interface OtherUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
}

export function ConversationView({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialFetched = useRef(false);
  // Typing-indicator bookkeeping
  const typingActiveRef = useRef(false);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: session } = useSession();
  const { resolved: resolvedUser } = useResolvedUser();

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

  useEffect(() => {
    if (!initialFetched.current && session) {
      initialFetched.current = true;
      fetchMessages(true);
      fetchConversationInfo();
    }
  }, [session, fetchMessages, fetchConversationInfo]);

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
            });
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

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

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
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInput('');
    stopTyping();
    setTimeout(scrollToBottom, 50);

    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(conversationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to send message');
        // Remove optimistic message
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(content);
        return;
      }

      const data = await res.json();
      // Replace optimistic message with real one
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? data.message : m))
      );
    } catch {
      setError('Failed to send message');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(content);
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

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
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
        <p className="text-lg font-medium text-site-text mb-1">Sign in to view messages</p>
        <Link to="/login" search={{ callbackURL: undefined }}>
          <Button variant="accent" size="sm">Sign In</Button>
        </Link>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <p className="text-lg font-medium text-site-text mb-1">Conversation not found</p>
        <Link to="/messages">
          <Button variant="accent" size="sm">Back to Messages</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-site-bg/85 backdrop-blur-md border-b border-site-border shrink-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link to="/messages" className="p-1.5 -ml-1.5 rounded-lg hover:bg-site-surface transition-colors">
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
            <Loader2 className="w-8 h-8 text-site-accent animate-spin" />
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
                  {loadingOlder ? 'Loading...' : 'Load older messages'}
                </button>
              </div>
            )}

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-site-text-muted">
                  No messages yet. Send one to start the conversation!
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
              // Fully rounded = rounded-2xl (16px). Tight side = rounded-md (6px).
              // The "inner" side (facing own messages) gets tightened when grouped.
              let bubbleRounding: string;
              if (isSelf) {
                // Right-aligned: inner side is right
                const tl = 'rounded-tl-2xl';
                const bl = 'rounded-bl-2xl';
                const tr = isFirstInGroup ? 'rounded-tr-2xl' : 'rounded-tr-md';
                const br = isLastInGroup ? 'rounded-br-md' : 'rounded-br-md';
                bubbleRounding = `${tl} ${tr} ${bl} ${br}`;
              } else {
                // Left-aligned: inner side is left
                const tr = 'rounded-tr-2xl';
                const br = 'rounded-br-2xl';
                const tl = isFirstInGroup ? 'rounded-tl-2xl' : 'rounded-tl-md';
                const bl = isLastInGroup ? 'rounded-bl-md' : 'rounded-bl-md';
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
                          : 'bg-site-surface text-site-text'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${isSelf ? 'text-site-bg/60' : 'text-site-text-dim'}`}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
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
                <div className="bg-site-surface text-site-text rounded-tl-md rounded-tr-2xl rounded-br-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-1" aria-label={`${otherUser?.name || 'User'} is typing`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-site-text-dim animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-site-text-dim animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-site-text-dim animate-bounce" />
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
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (e.target.value.trim()) handleTyping();
              else stopTyping();
            }}
            onBlur={stopTyping}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            maxLength={2000}
            className="flex-1 bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl px-4 py-2.5 border border-site-border outline-none focus:border-site-accent transition-colors resize-none max-h-32 overflow-y-auto"
            style={{ minHeight: '42px' }}
          />
          <Button
            variant="accent"
            size="sm"
            disabled={!input.trim() || sending}
            onClick={handleSend}
            className="rounded-xl h-[42px] px-3"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
