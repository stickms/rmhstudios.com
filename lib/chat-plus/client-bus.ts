/**
 * Tiny in-page fan-out for `chat-update` events.
 *
 * DM updates arrive on the shared message stream (`subscribeMessageStream`);
 * group updates arrive on the group view's own EventSource. The group view
 * forwards them here so every P04 component subscribes the same way regardless
 * of chat kind.
 */

import type { ChatUpdate } from '@/lib/chat-plus/types';

type Handler = (update: ChatUpdate) => void;
const handlers = new Set<Handler>();

export function emitChatUpdate(update: ChatUpdate): void {
  for (const h of handlers) h(update);
}

export function subscribeChatUpdates(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
