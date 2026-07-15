'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MessageCircle, CheckCheck, Plus, Search, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Reveal } from '@/components/motion';
import { Link, useNavigate } from '@tanstack/react-router';
import { MobileMenuButton } from './MobileMenuButton';
import { MobileBrandPrefix } from './MobileHeader';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export interface ConversationItem {
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
    gifUrl?: string | null;
    imageUrls?: string[];
  } | null;
  unreadCount: number;
  lastMessageAt: string;
  matchSnippet?: string | null;
}

export function MessagesColumn({
  embedded = false,
  initialData,
}: {
  embedded?: boolean;
  /** First page of conversations prefetched by the route loader; `null` when signed out. */
  initialData?: { conversations: ConversationItem[]; nextCursor: string | null; hasMore: boolean } | null;
} = {}) {
  const [conversations, setConversations] = useState<ConversationItem[]>(initialData?.conversations ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [cursor, setCursor] = useState<string | null>(initialData?.nextCursor ?? null);
  const [hasMore, setHasMore] = useState(initialData?.hasMore ?? true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ConversationItem[]>([]);
  const [searching, setSearching] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Seeded from the route loader → treat the first page as already fetched.
  const initialFetched = useRef(initialData != null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { t } = useTranslation("feed");
  const { data: session } = useSession();
  const navigate = useNavigate();

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

  // Debounced conversation/message search.
  useEffect(() => {
    const q = query.trim();
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/messages/search?q=${encodeURIComponent(q)}`);
        if (res.ok) setSearchResults((await res.json()).conversations);
      } catch {
        /* ignore */
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [query]);

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
              gifUrl: msg.gifUrl,
              imageUrls: msg.imageUrls,
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

    if (diffMins < 1) return t("time-now", { defaultValue: "now" });
    if (diffMins < 60) return t("time-minutes", { count: diffMins, defaultValue: "{{count}}m" });
    if (diffHours < 24) return t("time-hours", { count: diffHours, defaultValue: "{{count}}h" });
    if (diffDays < 7) return t("time-days", { count: diffDays, defaultValue: "{{count}}d" });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <MessageCircle className="w-12 h-12 text-site-text-dim mb-4" />
        <p className="text-lg font-medium text-site-text mb-1">{t("sign-in-to-view-messages", { defaultValue: "Sign in to view messages" })}</p>
        <p className="text-sm text-site-text-muted mb-4">
          {t("login-required-message", { defaultValue: "You need to be logged in to send and receive messages." })}
        </p>
        <Link to="/login" search={{ callbackURL: undefined }}>
          <Button variant="accent" size="sm">{t("sign-in", { defaultValue: "Sign In" })}</Button>
        </Link>
      </div>
    );
  }

  const hasUnread = conversations.some((c) => c.unreadCount > 0);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className={embedded ? 'border-b border-site-border' : 'sticky top-0 z-10 glass-chrome border-b border-site-border'}>
        {!embedded && (
          <div className="flex items-center gap-3 px-4 pt-3">
            <MobileMenuButton />
            <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 min-w-0">
              <MobileBrandPrefix />
              {t("messages-heading", { defaultValue: "Messages" })}
            </h1>
          </div>
        )}
        {/* Search + actions share a single row; the actions are icon-only. */}
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-dim" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search-messages-placeholder", { defaultValue: "Search people or messages…" })}
              aria-label={t("search-messages", { defaultValue: "Search messages" })}
              className="w-full rounded-full border border-site-border bg-site-surface py-2 pl-9 pr-9 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-site-text-dim hover:text-site-text"
                aria-label={t("clear-search", { defaultValue: "Clear search" })}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setNewChatOpen(true)}
            className="flex shrink-0 items-center justify-center rounded-full bg-site-accent p-2 text-site-bg transition-opacity hover:opacity-90"
            title={t("new-chat-title", { defaultValue: "Start a new chat" })}
            aria-label={t("new-chat", { defaultValue: "New chat" })}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={!hasUnread || markingAll}
            className="flex shrink-0 items-center justify-center rounded-full p-2 text-site-accent transition-colors hover:bg-site-accent-dim disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            title={t("mark-all-as-read-title", { defaultValue: "Mark all conversations as read" })}
            aria-label={t("mark-all-as-read", { defaultValue: "Mark all as read" })}
          >
            {markingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Search results */}
      {query.trim() ? (
        searching ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={32} />
          </div>
        ) : searchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <Search className="w-10 h-10 text-site-text-dim mb-4" />
            <p className="text-sm text-site-text-muted">{t("no-search-results", { defaultValue: "No people or messages match your search." })}</p>
          </div>
        ) : (
          <div>
            {searchResults.map((conv) => (
              <ConversationRow key={conv.id} conv={conv} currentUserId={session.user.id} t={t} formatTime={formatTime} />
            ))}
          </div>
        )
      ) : /* Conversation list */ loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size={32} />
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <MessageCircle className="w-12 h-12 text-site-text-dim mb-4" />
          <p className="text-lg font-medium text-site-text mb-1">{t("no-messages-yet", { defaultValue: "No messages yet" })}</p>
          <p className="text-sm text-site-text-muted">
            {t("no-messages-hint", { defaultValue: "Start a new chat or message someone from their profile page." })}
          </p>
        </div>
      ) : (
        <Reveal>
          {conversations.map((conv) => (
            <ConversationRow key={conv.id} conv={conv} currentUserId={session.user.id} t={t} formatTime={formatTime} />
          ))}

          {loadingMore && (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          )}

          {!hasMore && conversations.length > 0 && (
            <div className="py-8 text-center text-sm text-site-text-dim">
              {t("no-more-conversations", { defaultValue: "No more conversations" })}
            </div>
          )}

          <div ref={sentinelRef} className="h-1" />
        </Reveal>
      )}

      {newChatOpen && (
        <NewChatDialog
          onClose={() => setNewChatOpen(false)}
          onStarted={(conversationId) => {
            setNewChatOpen(false);
            navigate({ to: `/messages/${conversationId}` as string });
          }}
          t={t}
        />
      )}
    </div>
  );
}

type TFn = ReturnType<typeof useTranslation>['t'];

function ConversationRow({
  conv,
  currentUserId,
  t,
  formatTime,
}: {
  conv: ConversationItem;
  currentUserId: string;
  t: TFn;
  formatTime: (s: string) => string;
}) {
  const preview = conv.matchSnippet?.trim()
    ? conv.matchSnippet
    : conv.lastMessage?.content?.trim()
      ? `${conv.lastMessage.senderId === currentUserId ? t('you-prefix', { defaultValue: 'You: ' }) : ''}${conv.lastMessage.content}`
      : conv.lastMessage?.gifUrl
        ? t('sent-a-gif', { defaultValue: 'GIF' })
        : conv.lastMessage?.imageUrls && conv.lastMessage.imageUrls.length > 0
          ? t('sent-a-photo', { defaultValue: 'Photo' })
          : '';

  return (
    <Link
      to={`/messages/${conv.id}` as string}
      className="flex items-center gap-3 px-4 py-3 hover:bg-site-surface/50 active:scale-[0.99] transition-[background-color,transform] duration-150 border-b border-site-border"
    >
      <UserAvatar src={conv.otherUser.image ?? undefined} alt={conv.otherUser.name || t("user-alt", { defaultValue: "User" })} size={48} fallbackName={conv.otherUser.name ?? undefined} className="ring-2 ring-site-bg" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-bold text-site-text' : 'font-medium text-site-text'}`}>
              {conv.otherUser.name || t("unknown-user", { defaultValue: "Unknown" })}
            </span>
            {conv.otherUser.username && (
              <span className="text-xs text-site-text-dim truncate">@{conv.otherUser.username}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {conv.lastMessage && <span className="text-xs text-site-text-dim">{formatTime(conv.lastMessage.createdAt)}</span>}
            {conv.unreadCount > 0 && (
              <span className="flex items-center justify-center min-w-5 h-5 rounded-full bg-site-accent text-site-bg text-xs font-bold px-1.5">
                {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
              </span>
            )}
          </div>
        </div>
        {preview && (
          <p className={`text-sm truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-site-text' : 'text-site-text-muted'}`}>{preview}</p>
        )}
      </div>
    </Link>
  );
}

interface SearchUser {
  id: string;
  name: string | null;
  image: string | null;
  username?: string | null;
  handle?: string | null;
}

function NewChatDialog({
  onClose,
  onStarted,
  t,
}: {
  onClose: () => void;
  onStarted: (conversationId: string) => void;
  t: TFn;
}) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (!term) {
      setUsers([]);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(term)}`);
        if (res.ok) setUsers((await res.json()).users);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  const start = async (userId: string) => {
    setStarting(userId);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.conversationId) onStarted(data.conversationId);
      else toast.error(data.error || t('could-not-start-chat', { defaultValue: 'Could not start chat' }));
    } finally {
      setStarting(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('new-chat-title', { defaultValue: 'Start a new chat' })}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-dim" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search-people-placeholder', { defaultValue: 'Search people…' })}
            className="w-full rounded-site-sm border border-site-border bg-site-bg py-2 pl-9 pr-3 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner size={20} /></div>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-site-text-dim">
              {q.trim() ? t('no-people-found', { defaultValue: 'No people found.' }) : t('type-to-search-people', { defaultValue: 'Type a name to search.' })}
            </p>
          ) : (
            <ul className="flex flex-col">
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={starting === u.id}
                    onClick={() => start(u.id)}
                    className="flex w-full items-center gap-3 rounded-site-sm px-2 py-2 text-left hover:bg-site-surface-hover disabled:opacity-50"
                  >
                    <UserAvatar src={u.image ?? undefined} alt={u.name ?? ''} size={36} fallbackName={u.name ?? undefined} className="rounded-full" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-site-text">{u.name ?? (u.handle ? `@${u.handle}` : t('unknown-user', { defaultValue: 'Unknown' }))}</p>
                      {(u.username || u.handle) && <p className="truncate text-xs text-site-text-dim">@{u.username ?? u.handle}</p>}
                    </div>
                    {starting === u.id && <Spinner size={16} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
