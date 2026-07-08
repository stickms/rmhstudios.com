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

/** A non-message event on the group channel (e.g. a reaction toggle). Kept
 *  distinct from `GroupMessagePayload` (which has no `type` field) via the
 *  `type` discriminant so subscribers can tell the two apart. */
export interface GroupReactionEventPayload {
  type: 'reaction';
  messageId: string;
  reactions: { emoji: string; userId: string }[];
}

export type GroupEventPayload = GroupMessagePayload | GroupReactionEventPayload;

type Listener = (event: GroupEventPayload) => void;

const globalKey = '__group_chat_bus__' as const;
function bus(): RealtimeBus<GroupEventPayload> {
  const g = globalThis as Record<string, unknown>;
  if (!g[globalKey]) g[globalKey] = createBus<GroupEventPayload>('group');
  return g[globalKey] as RealtimeBus<GroupEventPayload>;
}

export function subscribeGroup(groupId: string, listener: Listener): () => void {
  return bus().subscribe(groupId, listener);
}

export function publishGroupMessage(groupId: string, message: GroupMessagePayload): void {
  bus().publish(groupId, message);
}

/** Publish a non-message event (e.g. a reaction toggle) on the group channel,
 *  reusing the same bus/channel plumbing as `publishGroupMessage`. */
export function publishGroupEvent(groupId: string, payload: GroupReactionEventPayload): void {
  bus().publish(groupId, payload);
}
