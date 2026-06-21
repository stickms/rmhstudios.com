'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, MessageCircle, CheckCheck } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Link } from '@tanstack/react-router';
import { MobileMenuButton } from './MobileMenuButton';
import { MobileBrandPrefix } from './MobileHeader';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';

interface ConversationItem {
  id: string;
  otherUser: {
    id: string;
    name: string | null;
    image: string | null;
    username: string | null;
  };
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    read: boolean;
    createdAt: string;
  } | null;
  unreadCount: number;
  lastMessageAt: string;
}

export function MessagesColumn() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const initialFetched = useRef(false);

  const { data: session } = useSession();

  const fetchConversations = useCallback(async (isInitial = false) => {
    if (!isInitial && loadingMore) return;
    if (!isInitial) setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      if (cursor && !isInitial) params.set('cursor', cursor);
      const res = await fetch(`/api/messages?${params}`);
      if (!res.ok) return;
      const data = await res.json();

      if (isInitial) {
        setConversations(data.conversations);
      } else {
        setConversations((prev) => [...prev, ...data.conversations]);
      }
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Fetch conversations error:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  const markAllAsRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    // Optimistically clear unread badges.
    setConversations((prev) =>
      prev.map((c) => (c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c))
    );
    try {
      const res = await fetch('/api/messages/read-all', { method: 'POST' });
      if (!res.ok) {
        // Roll back by refetching the authoritative list.
        fetchConversations(true);
      }
    } catch (error) {
      console.error('Mark all as read error:', error);
      fetchConversations(true);
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, fetchConversations]);

  useEffect(() => {
    if (!initialFetched.current && session) {
      initialFetched.current = true;
      fetchConversations(true);
    }
  }, [session, fetchConversations]);

  // SSE connection for real-time conversation list updates
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
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === msg.conversationId);
            if (idx === -1) {
              // New conversation we don't have yet — refetch
              fetchConversations(true);
              return prev;
            }
            const updated = [...prev];
            const conv = { ...updated[idx] };
            conv.lastMessage = {
              id: msg.id,
              content: msg.content,
              senderId: msg.senderId,
              read: msg.read,
              createdAt: msg.createdAt,
            };
            conv.lastMessageAt = msg.createdAt;
            // Increment unread if the message is from the other user
            if (msg.senderId !== session.user.id) {
              conv.unreadCount += 1;
            }
            // Remove from current position and move to top
            updated.splice(idx, 1);
            updated.unshift(conv);
            return updated;
          });
          retryCount = 0;
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.addEventListener('unread', (e) => {
        try {
          const data = JSON.parse(e.data);
          // If unread count dropped (e.g. opened a chat), refetch to sync
          if (typeof data.count === 'number' && data.count === 0) {
            setConversations((prev) => {
              if (prev.some((c) => c.unreadCount > 0)) {
                fetchConversations(true);
              }
              return prev;
            });
          }
        } catch {
          // Ignore
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
  }, [session, fetchConversations]);

  // Infinite scroll
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        fetchConversations();
      }
    },
    [hasMore, loadingMore, fetchConversations]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(observerCallback, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [observerCallback]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <MessageCircle className="w-12 h-12 text-site-text-dim mb-4" />
        <p className="text-lg font-medium text-site-text mb-1">Sign in to view messages</p>
        <p className="text-sm text-site-text-muted mb-4">
          You need to be logged in to send and receive messages.
        </p>
        <Link to="/login" search={{ callbackURL: undefined }}>
          <Button variant="accent" size="sm">Sign In</Button>
        </Link>
      </div>
    );
  }

  const hasUnread = conversations.some((c) => c.unreadCount > 0);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-site-bg/85 backdrop-blur-md border-b border-site-border">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <MobileMenuButton />
            <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 min-w-0">
              <MobileBrandPrefix />
              Messages
            </h1>
          </div>
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={!hasUnread || markingAll}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-site-accent transition-colors hover:bg-site-accent-dim disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            title="Mark all conversations as read"
          >
            {markingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            <span className="hidden sm:inline">Mark all as read</span>
          </button>
        </div>
      </div>

      {/* Conversation list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-site-accent animate-spin" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <MessageCircle className="w-12 h-12 text-site-text-dim mb-4" />
          <p className="text-lg font-medium text-site-text mb-1">No messages yet</p>
          <p className="text-sm text-site-text-muted">
            Send a message to someone from their profile page.
          </p>
        </div>
      ) : (
        <div>
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              to={`/messages/${conv.id}` as string}
              className="flex items-center gap-3 px-4 py-3 hover:bg-site-surface/50 transition-colors border-b border-site-border"
            >
              {/* Avatar */}
              <UserAvatar src={conv.otherUser.image ?? undefined} alt={conv.otherUser.name || 'User'} size={48} fallbackName={conv.otherUser.name ?? undefined} className="ring-2 ring-site-bg" />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-bold text-site-text' : 'font-medium text-site-text'}`}>
                      {conv.otherUser.name || 'Unknown'}
                    </span>
                    {conv.otherUser.username && (
                      <span className="text-xs text-site-text-dim truncate">
                        @{conv.otherUser.username}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {conv.lastMessage && (
                      <span className="text-xs text-site-text-dim">
                        {formatTime(conv.lastMessage.createdAt)}
                      </span>
                    )}
                    {conv.unreadCount > 0 && (
                      <span className="flex items-center justify-center min-w-5 h-5 rounded-full bg-site-accent text-site-bg text-xs font-bold px-1.5">
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
                {conv.lastMessage && (
                  <p className={`text-sm truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-site-text' : 'text-site-text-muted'}`}>
                    {conv.lastMessage.senderId === session.user.id ? 'You: ' : ''}
                    {conv.lastMessage.content}
                  </p>
                )}
              </div>
            </Link>
          ))}

          {loadingMore && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-site-accent animate-spin" />
            </div>
          )}

          {!hasMore && conversations.length > 0 && (
            <div className="py-8 text-center text-sm text-site-text-dim">
              No more conversations
            </div>
          )}

          <div ref={sentinelRef} className="h-1" />
        </div>
      )}
    </div>
  );
}
