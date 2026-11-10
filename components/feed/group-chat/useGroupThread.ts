import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatUpdates } from '@/components/chat-plus/hooks';
import { applyChatUpdate } from '@/lib/chat-plus/apply-update';
import { api } from '@/lib/contract/client';
import { getGroupChatApi } from '@/lib/group-chat/group-chat.contract';
import { HttpError } from '@/lib/http';
import type { ChatRef } from '@/lib/chat-plus/types';
import { appendUnique, isNearBottom } from './group-chat-state';
import type { Group, Msg } from '@/lib/group-chat/types';
import { useGroupLiveUpdates } from './useGroupLiveUpdates';

/**
 * The group thread's data: the initial load (reset when the chat changes),
 * de-duplicated appends, in-place patches, live updates, and the
 * stick-to-bottom autoscroll. `useState` order is what the characterization
 * suite seeds by ordinal; keep it stable.
 */
export function useGroupThread(id: string, currentUserId: string, chatRef: ChatRef) {
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAtRef = useRef<string | null>(null);
  // The initial message page is history (no entrance); everything appended
  // afterward (sent / received / streamed) rises in once.
  const historyIds = useRef<Set<string>>(new Set());

  const setMsgs = useCallback((msgs: Msg[]) => {
    // Initial load — the whole batch is history, so none of it animates in.
    for (const m of msgs) historyIds.current.add(m.id);
    setMessages(msgs);
    if (msgs.length) lastAtRef.current = msgs[msgs.length - 1].createdAt;
  }, []);

  const appendMessages = useCallback((incoming: Msg[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const next = appendUnique(prev, incoming);
      if (next === prev) return prev;
      lastAtRef.current = next[next.length - 1].createdAt;
      return next;
    });
  }, []);

  // Patch a single message in place (used for live poll-vote updates).
  const patchMessage = useCallback((messageId: string, patch: Partial<Msg>) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...patch } : m)));
  }, []);

  // P04: checklist ticks and thread counts from other members.
  useChatUpdates(chatRef, (u) => setMessages((prev) => applyChatUpdate(prev, u, currentUserId)));

  useEffect(() => {
    let active = true;
    // A different chat: start from a clean slate, not the previous chat's
    // flags (a stale `notFound` would hide this one; a stale `loading=false`
    // would start live updates against an empty cursor).
    setLoading(true);
    setNotFound(false);
    setGroup(null);
    setMessages([]);
    lastAtRef.current = null;
    historyIds.current = new Set();
    (async () => {
      try {
        const data = await api(getGroupChatApi, { params: { id } });
        if (!active) return;
        setGroup(data.group);
        setMsgs(data.group.messages ?? []);
      } catch (e) {
        if (!active) return;
        if (e instanceof HttpError && e.status === 404) setNotFound(true);
        /* any other failure: fall through to the loaded (empty) state */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, setMsgs]);

  useGroupLiveUpdates({ id, notFound, loading, lastAtRef, appendMessages, patchMessage });

  // Autoscroll only when the viewer is already at the bottom — never yank them
  // back down while they're reading history. `stickToBottom` is captured from the
  // scroll position BEFORE the new message grows the list (via onScroll), and the
  // jump is instant ('auto'), not a smooth animation re-running on every append.
  const stickToBottom = useRef(true);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = isNearBottom(el);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  return {
    group,
    messages,
    setMessages,
    loading,
    notFound,
    scrollRef,
    handleScroll,
    historyIds,
    appendMessages,
    patchMessage,
  };
}
