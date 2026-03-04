/**
 * In-memory pub/sub for message notifications.
 * When a message is sent, call notifyUser(recipientId, event) to push
 * an SSE event to any connected client for that user.
 *
 * Uses globalThis to ensure a single shared Map across all Next.js
 * module instances (dev mode can create separate instances per route).
 */

export type MessagePayload = {
  id: string;
  conversationId: string;
  content: string;
  senderId: string;
  read: boolean;
  createdAt: string;
};

export type MessageNotification =
  | { type: "unread" }
  | { type: "new-message"; message: MessagePayload };

type Listener = (event: MessageNotification) => void;

const globalKey = "__message_listeners__" as const;

function getListeners(): Map<string, Set<Listener>> {
  if (!(globalThis as Record<string, unknown>)[globalKey]) {
    (globalThis as Record<string, unknown>)[globalKey] = new Map<
      string,
      Set<Listener>
    >();
  }
  return (globalThis as Record<string, unknown>)[globalKey] as Map<
    string,
    Set<Listener>
  >;
}

export function subscribeUser(userId: string, listener: Listener): () => void {
  const listeners = getListeners();
  if (!listeners.has(userId)) {
    listeners.set(userId, new Set());
  }
  listeners.get(userId)!.add(listener);

  return () => {
    const listeners = getListeners();
    const set = listeners.get(userId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) listeners.delete(userId);
    }
  };
}

export function notifyUser(
  userId: string,
  event: MessageNotification = { type: "unread" }
) {
  const listeners = getListeners();
  const set = listeners.get(userId);
  if (set) {
    for (const listener of set) {
      listener(event);
    }
  }
}
