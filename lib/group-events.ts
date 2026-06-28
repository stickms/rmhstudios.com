/**
 * Pub/sub for group-chat messages (#15 SSE), keyed by groupId. When a member
 * sends a message, call `publishGroupMessage(groupId, message)` to push it to
 * every connected member's SSE stream — across instances via the Redis
 * backplane when configured, falling back to in-process delivery otherwise.
 * The `?after=` poll endpoint remains as a topology-independent fallback.
 */

import { createBus, type RealtimeBus } from '@/lib/realtime-bus.server';

export interface GroupPollPayload {
  question: string;
  options: { text: string; votes: number }[];
  totalVotes: number;
  /** The viewing member's chosen option index, or null. Per-recipient, so the
   *  SSE fan-out value is null; clients fill it in from their own vote. */
  myVote: number | null;
}

export interface GroupMessagePayload {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string | null; handle: string | null; image: string | null };
  gifUrl?: string | null;
  imageUrls?: string[];
  poll?: GroupPollPayload | null;
}

type Listener = (message: GroupMessagePayload) => void;

const globalKey = '__group_chat_bus__' as const;
function bus(): RealtimeBus<GroupMessagePayload> {
  const g = globalThis as Record<string, unknown>;
  if (!g[globalKey]) g[globalKey] = createBus<GroupMessagePayload>('group');
  return g[globalKey] as RealtimeBus<GroupMessagePayload>;
}

export function subscribeGroup(groupId: string, listener: Listener): () => void {
  return bus().subscribe(groupId, listener);
}

export function publishGroupMessage(groupId: string, message: GroupMessagePayload): void {
  bus().publish(groupId, message);
}
