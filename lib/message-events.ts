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
  /** Voice note (H2). Peaks let the bubble draw a waveform without fetching audio. */
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  audioPeaks?: number[];
  /** Set once edited, so a late-joining client renders the marker (H1). */
  editedAt?: string | null;
};

/**
 * An edit or an unsend that has already been applied.
 *
 * Carries the **redacted** body — what the recipient is now allowed to see —
 * rather than a diff, so a client can patch its copy without re-deriving the
 * tombstone rules (`lib/messages/message-view.ts` owns those, on the server).
 *
 * `isLatest` and `preview` exist for the conversation LIST, which is the half of
 * this that is easy to forget: unsending a message the recipient is not
 * currently looking at has to change the inbox line too, or they keep reading
 * the retracted text from the list until they next reload.
 */
export type MessageMutationPayload = {
  conversationId: string;
  messageId: string;
  /** Empty string on a tombstone. */
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  /** `'sender'` | `'moderator'`. */
  deletedBy: string | null;
  /** This message is the conversation's most recent one. */
  isLatest: boolean;
  /** `ConversationPreview` from `lib/messages/message-view.ts`. */
  preview: { kind: string; text: string };
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
    }
  // H1 — edit / unsend. Both must reach an open client immediately, or the
  // recipient goes on reading a message the sender has already retracted.
  | { type: "message-edited"; mutation: MessageMutationPayload }
  | { type: "message-deleted"; mutation: MessageMutationPayload };

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
