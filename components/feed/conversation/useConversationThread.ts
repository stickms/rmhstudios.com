import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/contract/client';
import { listConversationsApi } from '@/lib/messages/messages.contract';
import { HttpError } from '@/lib/http';
import {
  markConversationReadApi,
  messageMutationsApi,
  messageThreadApi,
} from '@/lib/messages/message-actions.contract';
import { subscribeMessageStream } from '@/lib/useUnreadCount';
import type { ReactionRow } from '@/lib/social/reactions';
import {
  MUTATION_SYNC_INTERVAL_MS,
  applyMutationTo,
  applySyncPatches,
  fromStreamMessage,
  type Message,
  type MessageMutation,
  type OtherUser,
} from './conversation-state';

/**
 * The thread itself: the paged message list, who the other participant is, the
 * read marker, and everything that keeps the list true after the first page —
 * the shared SSE stream, catch-up syncs for edits/unsends, and tab focus.
 */
export function useConversationThread({
  conversationId,
  initialOtherUser,
  session,
  scrollToBottom,
  clearOtherTyping,
  handleTypingEvent,
}: {
  conversationId: string;
  initialOtherUser?: OtherUser | null;
  session: { user: { id: string } } | null | undefined;
  scrollToBottom: () => void;
  /** A delivered message means the other side is no longer typing. */
  clearOtherTyping: () => void;
  handleTypingEvent: (isTyping: boolean) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(initialOtherUser ?? null);
  const [notFound, setNotFound] = useState(false);

  const initialFetched = useRef(false);
  // IDs of messages that should NOT animate in: the initial page and any
  // "load older" pages are history — only genuinely new (sent / received)
  // messages get the entrance. Populated as those pages arrive.
  const historyIds = useRef<Set<string>>(new Set());
  // Catch-up bookkeeping for edits/unsends (see MUTATION_SYNC_INTERVAL_MS).
  const lastSyncRef = useRef<string>(new Date().toISOString());
  const syncingRef = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch conversation info (other user) from conversations list
  const fetchConversationInfo = useCallback(async () => {
    try {
      const data = await api(listConversationsApi);
      const conv = data.conversations.find((c) => c.id === conversationId);
      if (conv) {
        setOtherUser(conv.otherUser);
      }
    } catch {
      // Ignore
    }
  }, [conversationId]);

  const fetchMessages = useCallback(
    async (isInitial = false) => {
      try {
        // `/thread`, not the older `/api/messages/$conversationId`: that route
        // predates edit/unsend/hide and returns raw columns, so it would hand
        // back the text of an unsent message and resurrect anything the viewer
        // deleted for themselves.
        const data = await api(messageThreadApi, {
          params: { conversationId },
          query: { cursor: !isInitial && olderCursor ? olderCursor : undefined },
        }).catch((e: unknown) => {
          // Any non-2xx answer ends quietly; a 404 is the not-found state.
          if (!(e instanceof HttpError)) throw e;
          if (e.status === 404) setNotFound(true);
          return null;
        });
        if (!data) return;

        // Everything fetched here is existing history — mark it so it renders
        // in place without an entrance animation.
        for (const m of data.messages as Message[]) historyIds.current.add(m.id);

        if (isInitial) {
          setMessages(data.messages);
          setHasOlder(data.hasMore);
          setOlderCursor(data.nextCursor);
          lastSyncRef.current = new Date().toISOString();
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
    },
    [conversationId, olderCursor, scrollToBottom],
  );

  const markAsRead = useCallback(() => {
    api(markConversationReadApi, { params: { conversationId } }).catch(() => {});
  }, [conversationId]);

  /** Apply an edit or a tombstone to the local copy of one message. */
  const applyMutation = useCallback((mutation: MessageMutation) => {
    setMessages((prev) => applyMutationTo(prev, mutation));
  }, []);

  /**
   * Pull anything this client missed.
   *
   * Runs on the unread pulse and on tab focus. It is what makes edit/unsend
   * correct across a backgrounded tab, a slept phone, and the ~30-minute SSE
   * recycle — none of which the event path alone survives.
   */
  const syncMutations = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const since = lastSyncRef.current;
      const data = await api(messageMutationsApi, {
        params: { conversationId },
        query: { since },
      });
      lastSyncRef.current = data.now ?? since;
      if (data.messages.length === 0 && data.hiddenIds.length === 0) return;

      const hidden = new Set(data.hiddenIds ?? []);
      const patches = new Map(data.messages.map((m) => [m.id, m]));
      setMessages((prev) => applySyncPatches(prev, hidden, patches));
    } catch {
      // Best-effort: the next pulse or focus retries.
    } finally {
      syncingRef.current = false;
    }
  }, [conversationId]);

  const scheduleMutationSync = useCallback(() => {
    if (syncTimer.current) return;
    syncTimer.current = setTimeout(() => {
      syncTimer.current = null;
      void syncMutations();
    }, MUTATION_SYNC_INTERVAL_MS);
  }, [syncMutations]);

  useEffect(() => {
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = null;
    };
  }, [conversationId]);

  // Handle incoming SSE message
  const handleIncomingMessage = useCallback(
    (msg: Message) => {
      // A delivered message means the other side is no longer typing.
      clearOtherTyping();
      setMessages((prev) => {
        // Skip if we already have this message (e.g. optimistic send)
        if (prev.some((m) => m.id === msg.id)) return prev;
        setTimeout(scrollToBottom, 100);
        return [...prev, msg];
      });
      // Mark as read since the conversation is open
      markAsRead();
    },
    [scrollToBottom, markAsRead, clearOtherTyping],
  );

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
        // A tab that was hidden may have missed the edit/unsend events entirely.
        void syncMutations();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const onFocus = () => markAsRead();
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [conversationId, session, markAsRead, syncMutations]);

  // Real-time incoming messages ride the ONE shared message stream
  // (see lib/useUnreadCount) instead of this view opening its own EventSource.
  useEffect(() => {
    if (!session) return;
    return subscribeMessageStream((type, data) => {
      // `message-edited` / `message-deleted` are part of the shared stream
      // union now, so this needs no widening cast.
      const eventType = type;

      if (eventType === 'new-message') {
        const msg = data as Message & { conversationId: string };
        // Only handle messages for this conversation
        // System lines (timer, theme, pin, tip) are written under the actor's own
        // id, so the actor's other tab needs them too.
        const isLine = msg.kind === 'system' || msg.kind === 'tip';
        if (msg.conversationId === conversationId && (msg.senderId !== session.user.id || isLine)) {
          handleIncomingMessage(fromStreamMessage(msg));
        }
      } else if (eventType === 'message-edited' || eventType === 'message-deleted') {
        const payload = data as { mutation?: MessageMutation } & Partial<MessageMutation>;
        const mutation = payload.mutation ?? (payload as MessageMutation);
        if (mutation?.conversationId === conversationId) {
          applyMutation(mutation);
          lastSyncRef.current = new Date().toISOString();
        }
      } else if (eventType === 'unread') {
        // Every DM notification produces one of these, including the edit and
        // unsend ones — which is why a client on a deployment whose stream does
        // not yet forward the two events above still converges within a second.
        scheduleMutationSync();
      } else if (eventType === 'message-reaction') {
        // Payload is { conversationId, messageId, reactions } — the named SSE
        // event already scopes it, matching the new-message/typing payloads.
        const d = data as { conversationId: string; messageId: string; reactions: ReactionRow[] };
        if (d.conversationId === conversationId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === d.messageId ? { ...m, reactions: d.reactions } : m)),
          );
        }
      } else if (eventType === 'typing') {
        const d = data as { conversationId: string; senderId: string; isTyping?: boolean };
        if (d.conversationId === conversationId && d.senderId !== session.user.id) {
          handleTypingEvent(Boolean(d.isTyping));
        }
      }
    });
  }, [
    session,
    conversationId,
    handleIncomingMessage,
    handleTypingEvent,
    applyMutation,
    scheduleMutationSync,
  ]);

  const handleLoadOlder = () => {
    if (loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    fetchMessages(false);
  };

  return {
    messages,
    setMessages,
    loading,
    hasOlder,
    loadingOlder,
    otherUser,
    notFound,
    historyIds,
    applyMutation,
    handleLoadOlder,
  };
}
