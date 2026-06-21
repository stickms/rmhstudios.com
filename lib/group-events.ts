/**
 * In-memory pub/sub for group-chat messages (#15 SSE).
 *
 * Mirrors lib/message-events.ts but keyed by groupId. When a member sends a
 * message, call `publishGroupMessage(groupId, message)` to push it to every
 * connected member's SSE stream. Uses globalThis so a single Map is shared
 * across module instances.
 *
 * NOTE: this is an in-process EventEmitter-style bus — correct for a single
 * instance. For multi-instance/serverless deployments, back it with Redis
 * pub/sub (the same `publish`/`subscribe` surface). The `?after=` poll endpoint
 * remains as a topology-independent fallback.
 */

export interface GroupMessagePayload {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string | null; handle: string | null; image: string | null };
}

type Listener = (message: GroupMessagePayload) => void;

const globalKey = '__group_chat_listeners__' as const;

function getListeners(): Map<string, Set<Listener>> {
  const g = globalThis as Record<string, unknown>;
  if (!g[globalKey]) g[globalKey] = new Map<string, Set<Listener>>();
  return g[globalKey] as Map<string, Set<Listener>>;
}

export function subscribeGroup(groupId: string, listener: Listener): () => void {
  const listeners = getListeners();
  if (!listeners.has(groupId)) listeners.set(groupId, new Set());
  listeners.get(groupId)!.add(listener);

  return () => {
    const set = getListeners().get(groupId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) getListeners().delete(groupId);
    }
  };
}

export function publishGroupMessage(groupId: string, message: GroupMessagePayload): void {
  const set = getListeners().get(groupId);
  if (set) {
    for (const listener of set) listener(message);
  }
}
