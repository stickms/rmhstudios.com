/**
 * Pub/sub for DM notifications. When a message is sent, call
 * notifyUser(recipientId, event) to push an SSE event to any connected client
 * for that user — on any instance via the Redis backplane when configured,
 * falling back to in-process delivery otherwise.
 */

import { createBus, type RealtimeBus } from '@/lib/realtime-bus.server';
import type { ReactionRow } from '@/lib/social/reactions';

export type MessagePayload = {
  id: string;
  conversationId: string;
  content: string;
  senderId: string;
  read: boolean;
  createdAt: string;
  /** Optional rich media (mirrors RMHark posts). */
  gifUrl?: string | null;
  imageUrls?: string[];
  /** Raw reaction rows, grouped client-side so SSE updates stay cheap. */
  reactions?: ReactionRow[];
};

export type TypingPayload = {
  conversationId: string;
  /** The participant who is (or stopped) typing. */
  senderId: string;
  isTyping: boolean;
};

export type MessageNotification =
  | { type: "unread" }
  | { type: "new-message"; message: MessagePayload }
  | { type: "typing"; typing: TypingPayload }
  | {
      type: "message-reaction";
      conversationId: string;
      messageId: string;
      reactions: ReactionRow[];
    };

type Listener = (event: MessageNotification) => void;

// Shared across module instances (HMR/dev) via globalThis.
const globalKey = "__message_bus__" as const;
function bus(): RealtimeBus<MessageNotification> {
  const g = globalThis as Record<string, unknown>;
  if (!g[globalKey]) g[globalKey] = createBus<MessageNotification>("msg");
  return g[globalKey] as RealtimeBus<MessageNotification>;
}

export function subscribeUser(userId: string, listener: Listener): () => void {
  return bus().subscribe(userId, listener);
}

export function notifyUser(
  userId: string,
  event: MessageNotification = { type: "unread" }
) {
  bus().publish(userId, event);
}
