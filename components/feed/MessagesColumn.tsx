/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useTranslation } from 'react-i18next';
import { CheckCheck, Moon, Pin, Search, SquarePen } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { SearchField } from '@/components/ui/search-field';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { InboxAvatar } from '@/components/feed/InboxAvatar';
import { Link, useNavigate } from '@tanstack/react-router';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { subscribeMessageStream } from '@/hooks/useUnreadCount';
import { toast } from '@/lib/toast';
import { ChatFolderBar } from '@/components/chat-plus/ChatFolderBar';
import { SavedMessagesRow } from '@/components/chat-plus/SavedMessagesRow';
import { RequestsEntry } from '@/components/messages/RequestsEntry';
import { AwayMessageDialog } from '@/components/messages/AwayMessageDialog';
import { AutoRepliedMark, AwayInboxLine } from '@/components/messages/AwayLine';
import { useAwayQuery } from '@/components/messages/useAway';
import { SavedMessagesLabel } from '@/components/chat-plus/MessageBadges';
import { AutomatedBadge } from '@/components/feed/AutomatedBadge';
import { ScheduledClock, useScheduledChatIds } from '@/components/messages/ScheduledClock';
import { api } from '@/lib/contract/client';
import { searchUsersApi } from '@/lib/discovery/explore.contract';
import { HttpError, serverError } from '@/lib/http';
import {
  listConversationsApi,
  markAllMessagesReadApi,
  searchConversationsApi,
  sendMessageApi,
} from '@/lib/messages/messages.contract';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { CONVERSATION_PINS_CHANGED_EVENT } from '@/lib/messages/pins';

import { Handle } from '@/components/ui/handle';
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
  /** s14-12: pinned to the top by the member. Absent on search results. */
  pinned?: boolean;
  /** s14-12: a mute is in force, or only mentions notify. Absent on search results. */
  muted?: boolean;
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
} = {}) { const fmt = useLocaleFormat(); 
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

  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const navigate = useNavigate();
  // Steel M9: the inbox and search results replace their spinners; rows that join the list later (the next page, a
  // new conversation) fade one by one. While a folder loads the keys are empty, so its first page is a new baseline.
  const listArrival = useArrival(!loading);
  const searchArrival = useArrival(!searching);
  const isNew = useArrivingKeys(loading ? [] : conversations.map((c) => c.id));
  const scheduledChats = useScheduledChatIds(!!session);
  const awayQuery = useAwayQuery(!!session);
  const [awayOpen, setAwayOpen] = useState(false);
  const autoReplied = new Set(awayQuery.data?.autoRepliedChatIds ?? []);

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
  const searchConversations = useDebouncedCallback(async (q: string) => {
    try {
      const res = await api(searchConversationsApi, { query: { q } });
      setSearchResults(res.conversations);
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
    }
  }, 250);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      searchConversations.cancel();
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchConversations(q);
    return searchConversations.cancel;
  }, [query, searchConversations]);

  // Real-time conversation-list updates ride the ONE shared message stream
  // (see hooks/useUnreadCount) instead of this view opening its own EventSource.
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
          // A pinned row stays where it is; any other moves to the top of the unpinned rows (s14-12).
          if (conv.pinned) {
            updated[idx] = conv;
            return updated;
          }
          updated.splice(idx, 1);
          const firstUnpinned = updated.findIndex((c) => !c.pinned);
          updated.splice(firstUnpinned === -1 ? updated.length : firstUnpinned, 0, conv);
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

  // A pin changed in the open conversation's header: fetch page one again so the order is the server's.
  useEffect(() => {
    if (!session) return;
    const onPinsChanged = () => void fetchRef.current(true);
    window.addEventListener(CONVERSATION_PINS_CHANGED_EVENT, onPinsChanged);
    return () => window.removeEventListener(CONVERSATION_PINS_CHANGED_EVENT, onPinsChanged);
  }, [session]);

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
    return fmt.date(d, { month: 'short', day: 'numeric' });
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
      {/* The search field, and the actions as icons: New chat, Mark all as read, Set an away message. No primary here (section 10). */}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <SearchField
          containerClassName="min-w-full sm:min-w-48 sm:flex-1"
          value={query}
          onValueChange={setQuery}
          placeholder={t('search-messages-placeholder', {
            defaultValue: 'Search people or chats…',
          })}
          aria-label={t('search-messages', { defaultValue: 'Search messages' })}
        />
        <IconButton
          icon={SquarePen}
          label={t('new-chat', { defaultValue: 'New chat' })}
          onClick={() => setNewChatOpen(true)}
        />
        <IconButton
          icon={CheckCheck}
          label={t('mark-all-as-read', { defaultValue: 'Mark all as read' })}
          onClick={markAllAsRead}
          disabled={!hasUnread || markingAll}
        />
        {!awayQuery.data?.away && (
          <IconButton
            icon={Moon}
            label={t('set-away-message', { ns: 'away-message', defaultValue: 'Set an away message' })}
            onClick={() => setAwayOpen(true)}
          />
        )}
      </div>
      <AwayInboxLine onEdit={() => setAwayOpen(true)} />
      {awayOpen && (
        <AwayMessageDialog
          open={awayOpen}
          onOpenChange={setAwayOpen}
          current={awayQuery.data?.away ?? null}
        />
      )}
      <ChatFolderBar value={folder} onChange={setFolder} />

      {query.trim() ? (
        searching ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size={24} />
          </div>
        ) : searchResults.length === 0 ? (
          <p className={cn('t-body py-8 text-site-text-muted', searchArrival)}>
            {t('no-search-results', { defaultValue: 'No people or messages match your search.' })}
          </p>
        ) : (
          <div className={searchArrival}>
            {searchResults.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                hasScheduled={scheduledChats.has(conv.id)}
                autoReplied={autoReplied.has(conv.id)}
                currentUserId={session.user.id}
                t={t}
                formatTime={formatTime}
              />
            ))}
          </div>
        )
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size={24} />
        </div>
      ) : conversations.length === 0 && folder !== 'all' ? (
        <p className={cn('t-body py-8 text-site-text-muted', listArrival)}>
          {t('no-messages-yet', { defaultValue: 'No messages yet' })}
        </p>
      ) : conversations.length === 0 ? (
        <>
          {/* Saved Messages (M2) is always there, even in an empty inbox. */}
          <div className={listArrival}>
            <RequestsEntry />
            <SavedMessagesRow />
          </div>
          <EmptyState
            className={listArrival}
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
          <div className={listArrival}>
            {folder === 'all' && <RequestsEntry />}
            {folder === 'all' && <SavedMessagesRow />}
            {conversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                className={isNew(conv.id) ? ARRIVE : undefined}
                conv={conv}
                hasScheduled={scheduledChats.has(conv.id)}
                autoReplied={autoReplied.has(conv.id)}
                currentUserId={session.user.id}
                t={t}
                formatTime={formatTime}
              />
            ))}
          </div>

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
  hasScheduled,
  autoReplied,
  currentUserId,
  t,
  formatTime,
  className,
}: {
  conv: ConversationItem;
  hasScheduled: boolean;
  autoReplied: boolean;
  currentUserId: string;
  t: TFn;
  formatTime: (s: string) => string;
  className?: string | undefined;
}) {
  // Member text (a snippet or the last message) is isolated in <bdi> in the preview line; the "You:" prefix and the
  // GIF/Photo labels are site text and keep the interface direction.
  const previewMember = conv.matchSnippet?.trim()
    ? conv.matchSnippet
    : conv.lastMessage?.content?.trim()
      ? conv.lastMessage.content
      : '';
  const previewPrefix =
    !conv.matchSnippet?.trim() && previewMember && conv.lastMessage?.senderId === currentUserId
      ? `${t('you-prefix', { defaultValue: 'You:' })} `
      : '';
  const preview = previewMember
    ? previewMember
    : conv.lastMessage?.gifUrl
        ? t('sent-a-gif', { defaultValue: 'GIF' })
        : conv.lastMessage?.imageUrls && conv.lastMessage.imageUrls.length > 0
          ? t('sent-a-photo', { defaultValue: 'Photo' })
          : '';

  const unread = conv.unreadCount > 0;
  const isSelf = conv.otherUser.id === currentUserId;
  return (
    <div className={cn('rule-row row-hover py-3.5', className)}>
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
                  <bdi>{conv.otherUser.name || t('unknown-user', { defaultValue: 'Unknown' })}</bdi>
                )}
              </span>
              {conv.otherUser.username && !isSelf && (
                <span className="t-meta truncate" dir="ltr">
                  <Handle handle={conv.otherUser.username} />
                </span>
              )}
              {conv.otherUser.isBot && <AutomatedBadge />}
            </div>
            <div className="flex shrink-0 items-baseline gap-2">
              {conv.pinned && (
                <Pin
                  className="size-3 self-center text-site-text-muted"
                  role="img"
                  aria-label={t('pinned', { ns: 'pinned-conversations', defaultValue: 'Pinned' })}
                />
              )}
              {conv.muted && (
                <span className="t-meta">{t('muted', { ns: 'pinned-conversations', defaultValue: 'Muted' })}</span>
              )}
              {hasScheduled && <ScheduledClock />}
              {autoReplied && <AutoRepliedMark />}
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
              {previewMember ? (
                <>
                  {previewPrefix}
                  <bdi>{previewMember}</bdi>
                </>
              ) : (
                preview
              )}
            </p>
          )}
        </div>
      </Link>
    </div>
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

  const searchUsers = useDebouncedCallback(async (term: string) => {
    try {
      const res = await api(searchUsersApi, { query: { q: term } });
      setUsers(res.users);
    } catch {
      // typeahead: keep the previous results
    } finally {
      setLoading(false);
    }
  }, 250);
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      searchUsers.cancel();
      setUsers([]);
      return;
    }
    setLoading(true);
    searchUsers(term);
    return searchUsers.cancel;
  }, [q, searchUsers]);

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
          <input aria-label={t('field-search-people', { defaultValue: 'Search people' })}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search-people-placeholder', { defaultValue: 'Search people…' })}
            dir="auto"
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
                        <bdi>
                          {u.name ??
                            (u.handle
                              ? `@${u.handle}`
                              : t('unknown-user', { defaultValue: 'Unknown' }))}
                        </bdi>
                      </p>
                      {(u.username || u.handle) && (
                        <p className="truncate text-xs text-site-text-muted">
                          <Handle handle={u.username ?? u.handle} />
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
