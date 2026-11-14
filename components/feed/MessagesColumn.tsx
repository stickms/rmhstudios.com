/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { SearchField } from '@/components/ui/search-field';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Spine, SpineItem } from '@/components/ui/spine';
import { InboxAvatar } from '@/components/feed/InboxAvatar';
import { Link, useNavigate } from '@tanstack/react-router';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { subscribeMessageStream } from '@/lib/useUnreadCount';
import { toast } from '@/lib/toast';
import { ChatFolderBar } from '@/components/chat-plus/ChatFolderBar';
import { SavedMessagesRow } from '@/components/chat-plus/SavedMessagesRow';
import { SavedMessagesLabel } from '@/components/chat-plus/MessageBadges';
import { AutomatedBadge } from '@/components/feed/AutomatedBadge';
import { api } from '@/lib/contract/client';
import { searchUsersApi } from '@/lib/discovery/explore.contract';
import { HttpError, serverError } from '@/lib/http';
import {
  listConversationsApi,
  markAllMessagesReadApi,
  searchConversationsApi,
  sendMessageApi,
} from '@/lib/messages/messages.contract';

export interface ConversationItem {
  id: string;
  otherUser: {
    id: string;
    name: string | null;
    image: string | null;
    username: string | null;
    isBot?: boolean;
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
  /** First page of conversations prefetched by the route loader; `null`when signed out. */
  initialData?: {
    conversations: ConversationItem[];
    nextCursor: string | null;
    hasMore: boolean;
  } | null;
} = {}) {
  const [conversations, setConversations] = useState<ConversationItem[]>(
    initialData?.conversations ?? [],
  );
  const [loading, setLoading] = useState(!initialData);
  const [cursor, setCursor] = useState<string | null>(initialData?.nextCursor ?? null);
  const [hasMore, setHasMore] = useState(initialData?.hasMore ?? true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [query, setQuery] = useState('');
  // M1: 'all' | 'unread' | a folder id — filtered server-side.
  const [folder, setFolder] = useState('all');
  const folderRef = useRef(folder);
  folderRef.current = folder;
  const [searchResults, setSearchResults] = useState<ConversationItem[]>([]);
  const [searching, setSearching] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Seeded from the route loader → treat the first page as already fetched.
  const initialFetched = useRef(initialData != null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const navigate = useNavigate();

  const fetchConversations = useCallback(
    async (isInitial = false) => {
      if (!isInitial && loadingMore) return;
      if (!isInitial) setLoadingMore(true);

      try {
        const data = await api(listConversationsApi, {
          query: {
            cursor: cursor && !isInitial ? cursor : undefined,
            filter: folderRef.current === 'unread' ? 'unread' : undefined,
            folder:
              folderRef.current !== 'unread' && folderRef.current !== 'all'
                ? folderRef.current
                : undefined,
          },
          retries: 0,
        });

        if (isInitial) {
          setConversations(data.conversations);
        } else {
          setConversations((prev) => [...prev, ...data.conversations]);
        }
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch (error) {
        // A non-2xx answer used to return quietly; only transport failures log.
        if (!(error instanceof HttpError)) console.error('Fetch conversations error:', error);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cursor, loadingMore],
  );

  const markAllAsRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    // Optimistically clear unread badges.
    setConversations((prev) => prev.map((c) => (c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c)));
    try {
      await api(markAllMessagesReadApi);
    } catch (error) {
      // A non-2xx answer rolls back by refetching the authoritative list; only transport failures log.
      if (!(error instanceof HttpError)) console.error('Mark all as read error:', error);
      fetchConversations(true);
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, fetchConversations]);

  // Switching folder tabs refetches page one of that folder's list.
  const fetchRef = useRef(fetchConversations);
  fetchRef.current = fetchConversations;
  const firstFolderRun = useRef(true);
  useEffect(() => {
    if (firstFolderRun.current) {
      firstFolderRun.current = false;
      return;
    }
    setLoading(true);
    setHasMore(true);
    void fetchRef.current(true);
  }, [folder]);

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
        const res = await api(searchConversationsApi, { query: { q } });
        setSearchResults(res.conversations);
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

  // Real-time conversation-list updates ride the ONE shared message stream
  // (see lib/useUnreadCount) instead of this view opening its own EventSource.
  useEffect(() => {
    if (!session) return;
    return subscribeMessageStream((type, data) => {
      if (type === 'new-message') {
        const msg = data as {
          id: string;
          conversationId: string;
          content: string;
          senderId: string;
          read: boolean;
          createdAt: string;
          gifUrl?: string | null;
          imageUrls?: string[];
        };
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
      } else if (type === 'unread') {
        const c = (data as { count?: number }).count;
        // If unread count dropped (e.g. opened a chat), refetch to sync
        if (typeof c === 'number' && c === 0) {
          setConversations((prev) => {
            if (prev.some((cv) => cv.unreadCount > 0)) {
              fetchConversations(true);
            }
            return prev;
          });
        }
      }
    });
  }, [session, fetchConversations]);

  // Infinite scroll
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        fetchConversations();
      }
    },
    [hasMore, loadingMore, fetchConversations],
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

    if (diffMins < 1) return t('time-now', { defaultValue: 'now' });
    if (diffMins < 60) return t('time-minutes', { count: diffMins, defaultValue: '{{count}}m' });
    if (diffHours < 24) return t('time-hours', { count: diffHours, defaultValue: '{{count}}h' });
    if (diffDays < 7) return t('time-days', { count: diffDays, defaultValue: '{{count}}d' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!session) {
    return (
      <EmptyState
        title={t('sign-in-to-view-messages', { defaultValue: 'Sign in to view messages' })}
        description={t('login-required-message', {
          defaultValue: 'You need to be logged in to send and receive messages.',
        })}
        action={
          <Button asChild>
            <Link to="/login" search={{ callbackURL: undefined }}>
              {t('sign-in', { defaultValue: 'Sign in' })}
            </Link>
          </Button>
        }
      />
    );
  }

  const hasUnread = conversations.some((c) => c.unreadCount > 0);

  return (
    <div className="flex flex-col">
      {/* The search field, and the two actions as words: New chat, Mark all as read. No primary here (section 10). */}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <SearchField
          containerClassName="min-w-full sm:min-w-0 sm:flex-1"
          value={query}
          onValueChange={setQuery}
          placeholder={t('search-messages-placeholder', {
            defaultValue: 'Search people or chats…',
          })}
          aria-label={t('search-messages', { defaultValue: 'Search messages' })}
        />
        <Button variant="ghost" onClick={() => setNewChatOpen(true)}>
          {t('new-chat', { defaultValue: 'New chat' })}
        </Button>
        <Button variant="ghost" onClick={markAllAsRead} disabled={!hasUnread || markingAll}>
          {t('mark-all-as-read', { defaultValue: 'Mark all as read' })}
        </Button>
      </div>
      <ChatFolderBar value={folder} onChange={setFolder} />

      {query.trim() ? (
        searching ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size={24} />
          </div>
        ) : searchResults.length === 0 ? (
          <p className="t-body py-8 text-site-text-muted">
            {t('no-search-results', { defaultValue: 'No people or messages match your search.' })}
          </p>
        ) : (
          <Spine>
            {searchResults.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                currentUserId={session.user.id}
                t={t}
                formatTime={formatTime}
              />
            ))}
          </Spine>
        )
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size={24} />
        </div>
      ) : conversations.length === 0 && folder !== 'all' ? (
        <p className="t-body py-8 text-site-text-muted">
          {t('no-messages-yet', { defaultValue: 'No messages yet' })}
        </p>
      ) : conversations.length === 0 ? (
        <>
          {/* Saved Messages (M2) is always there, even in an empty inbox. */}
          <Spine>
            <SavedMessagesRow />
          </Spine>
          <EmptyState
            title={t('no-messages-yet', { defaultValue: 'No messages yet' })}
            description={t('no-messages-hint', {
              defaultValue: 'Start a new chat, or message someone from their profile page.',
            })}
            action={
              <Button onClick={() => setNewChatOpen(true)}>
                {t('new-chat', { defaultValue: 'New chat' })}
              </Button>
            }
          />
        </>
      ) : (
        <>
          {/* One dot per unread thread (section 10, Inbox): the rows hang on the spine, read ones with no dot. */}
          <Spine>
            {folder === 'all' && <SavedMessagesRow />}
            {conversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                currentUserId={session.user.id}
                t={t}
                formatTime={formatTime}
              />
            ))}
          </Spine>

          {loadingMore && (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          )}

          {!hasMore && conversations.length > 0 && (
            <p className="t-meta py-6">
              {t('no-more-conversations', { defaultValue: 'No more conversations' })}
            </p>
          )}

          <div ref={sentinelRef} className="h-1" />
        </>
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
      ? `${conv.lastMessage.senderId === currentUserId ? `${t('you-prefix', { defaultValue: 'You:' })} ` : ''}${conv.lastMessage.content}`
      : conv.lastMessage?.gifUrl
        ? t('sent-a-gif', { defaultValue: 'GIF' })
        : conv.lastMessage?.imageUrls && conv.lastMessage.imageUrls.length > 0
          ? t('sent-a-photo', { defaultValue: 'Photo' })
          : '';

  const unread = conv.unreadCount > 0;
  const isSelf = conv.otherUser.id === currentUserId;
  return (
    <SpineItem dot={unread} className="hover:bg-site-bg-subtle">
      <Link
        to={`/messages/${conv.id}` as string}
        className="flex items-start gap-3 after:absolute after:inset-x-0 after:-inset-y-px after:content-['']"
      >
        <InboxAvatar person={conv.otherUser} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <span
                className={`t-body truncate text-site-text ${unread ? 'font-semibold' : 'font-medium'}`}
              >
                {isSelf ? (
                  <SavedMessagesLabel />
                ) : (
                  conv.otherUser.name || t('unknown-user', { defaultValue: 'Unknown' })
                )}
              </span>
              {conv.otherUser.username && !isSelf && (
                <span className="t-meta truncate" dir="ltr">
                  @{conv.otherUser.username}
                </span>
              )}
              {conv.otherUser.isBot && <AutomatedBadge />}
            </div>
            <div className="flex shrink-0 items-baseline gap-2">
              {conv.lastMessage && (
                <span className="t-meta">{formatTime(conv.lastMessage.createdAt)}</span>
              )}
              {unread && (
                <span className="t-meta font-semibold text-site-danger">
                  {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                </span>
              )}
            </div>
          </div>
          {preview && (
            <p
              className={`t-body mt-0.5 truncate ${unread ? 'font-semibold text-site-text' : 'text-site-text-muted'}`}
            >
              {preview}
            </p>
          )}
        </div>
      </Link>
    </SpineItem>
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
        const res = await api(searchUsersApi, { query: { q: term } });
        setUsers(res.users);
      } catch {
        // typeahead: keep the previous results
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
      const data = await api(sendMessageApi, { body: { recipientId: userId } });
      if (data.conversationId) onStarted(data.conversationId);
      else toast.error(t('could-not-start-chat', { defaultValue: 'Could not start chat' }));
    } catch (err) {
      toast.error(
        serverError(err) || t('could-not-start-chat', { defaultValue: 'Could not start chat' }),
      );
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search-people-placeholder', { defaultValue: 'Search people…' })}
            className="surface-field border w-full rounded-site-sm py-2 pl-9 pr-3 text-sm text-site-text placeholder:text-site-text-muted focus:border-site-accent focus:outline-none"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner size={20} />
            </div>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-site-text-muted">
              {q.trim()
                ? t('no-people-found', { defaultValue: 'No people found.' })
                : t('type-to-search-people', { defaultValue: 'Type a name to search.' })}
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
                    <UserAvatar
                      src={u.image ?? undefined}
                      alt={u.name ?? ''}
                      size={36}
                      fallbackName={u.name ?? undefined}
                      className="rounded-full"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-site-text">
                        {u.name ??
                          (u.handle
                            ? `@${u.handle}`
                            : t('unknown-user', { defaultValue: 'Unknown' }))}
                      </p>
                      {(u.username || u.handle) && (
                        <p className="truncate text-xs text-site-text-muted">
                          @{u.username ?? u.handle}
                        </p>
                      )}
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
