'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { subscribeMessageStream } from '@/lib/useUnreadCount';
import { subscribeChatUpdates } from '@/lib/chat-plus/client-bus';
import type { ChatRef, ChatUpdate } from '@/lib/chat-plus/types';
import type { ChatMeta } from '@/lib/chat-plus/settings.client';
import { accentStyle, parseTheme, wallpaperStyle } from '@/lib/chat-plus/themes';

/** Subscribe to `chat-update` events for one chat (either kind). */
export function useChatUpdates(chat: ChatRef, handler: (update: ChatUpdate) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  const { kind, id } = chat;
  useEffect(() => {
    const deliver = (u: ChatUpdate) => {
      if (u.kind === kind && u.chatId === id) ref.current(u);
    };
    // DMs ride the shared message stream; groups are forwarded onto the bus by
    // the group view. Subscribing to the right one keeps a single delivery.
    if (kind === 'dm') {
      return subscribeMessageStream((type, data) => {
        if (type === 'chat-update') deliver(data as ChatUpdate);
      });
    }
    return subscribeChatUpdates(deliver);
  }, [kind, id]);
}

export const chatMetaKey = (chat: ChatRef) => ['chat-meta', chat.kind, chat.id] as const;

/** The chat's timer, theme, pins and the viewer's switches — one request. */
export function useChatMeta(chat: ChatRef, enabled = true) {
  const qc = useQueryClient();
  const key = chatMetaKey(chat);
  const query = useQuery({
    queryKey: key,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ChatMeta> => {
      const res = await fetch(`/api/chats/${chat.kind}/${encodeURIComponent(chat.id)}/meta`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('meta failed');
      return res.json();
    },
  });
  useChatUpdates(chat, (u) => {
    if (u.op === 'settings') {
      qc.setQueryData<ChatMeta>(key, (old) =>
        old ? { ...old, disappearAfterSec: u.disappearAfterSec, themeKey: u.themeKey } : old,
      );
    } else if (u.op === 'pins') {
      void qc.invalidateQueries({ queryKey: key });
    }
  });
  return query;
}

/** Styles for the chat root (accent) and the message scroller (wallpaper). */
export function useChatTheme(chat: ChatRef) {
  const { data } = useChatMeta(chat);
  const theme = parseTheme(data?.themeKey);
  return { rootStyle: accentStyle(theme), wallpaper: wallpaperStyle(theme), theme };
}

/**
 * M3 — hide messages the moment they expire, without a refetch. Re-renders once,
 * at the next expiry; a chat with no timer never schedules anything.
 */
export function useExpiring<T extends { expiresAt?: string | null }>(messages: T[]): T[] {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let next = Infinity;
    for (const m of messages) {
      if (!m.expiresAt) continue;
      const at = new Date(m.expiresAt).getTime();
      if (at > Date.now() && at < next) next = at;
    }
    if (next === Infinity) return;
    // setTimeout caps at ~24.8 days; the longest timer is 7 days.
    const id = setTimeout(() => setNow(Date.now()), Math.max(next - Date.now(), 0) + 50);
    return () => clearTimeout(id);
  }, [messages, now]);
  return messages.some((m) => m.expiresAt && new Date(m.expiresAt).getTime() <= now)
    ? messages.filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > now)
    : messages;
}
