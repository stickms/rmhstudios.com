/**
 * Live chat — the server half. Server-only.
 *
 * Ephemeral by design: an election-night room is a conversation, not a record.
 * Messages fan out over the realtime bus (Redis-backed when configured, so every
 * web instance sees every message) and each instance keeps the last
 * CHAT_HISTORY per room in memory for people who join mid-conversation. Nothing
 * is written to the database; a restart empties the room. An instance that
 * joins late (a blue/green swap) starts its history from that moment.
 *
 * The ring is fed ONLY by the bus subscription — never directly by `postMessage`
 * — so a message is appended exactly once whether Redis is on or off.
 */

import { randomUUID } from 'node:crypto';
import { createBus } from '@/lib/realtime-bus.server';
import { CHAT_HISTORY, type ChatEvent, type ChatMessage } from './chat';

const bus = createBus<ChatEvent>('elections-chat');
const rings = new Map<string, ChatMessage[]>();
const listening = new Map<string, () => void>();

function ensureRoom(room: string) {
  if (listening.has(room)) return;
  const off = bus.subscribe(room, (ev) => {
    // Reactions and config changes are live-only: they never enter the history ring.
    if (ev.type === 'react' || ev.type === 'config') return;
    const ring = rings.get(room) ?? [];
    if (ev.type === 'msg') {
      ring.push(ev.msg);
      if (ring.length > CHAT_HISTORY) ring.splice(0, ring.length - CHAT_HISTORY);
    } else {
      const i = ring.findIndex((m) => m.id === ev.id);
      if (i >= 0) ring.splice(i, 1);
    }
    rings.set(room, ring);
  });
  listening.set(room, off);
}

export function chatHistory(room: string): ChatMessage[] {
  ensureRoom(room);
  return [...(rings.get(room) ?? [])];
}

export function subscribeChat(room: string, listener: (ev: ChatEvent) => void): () => void {
  ensureRoom(room);
  return bus.subscribe(room, listener);
}

export function postChatMessage(
  room: string,
  author: { userId: string; name: string; handle: string | null; image: string | null },
  text: string,
): ChatMessage {
  ensureRoom(room);
  const msg: ChatMessage = { id: randomUUID(), room, ...author, text, at: Date.now() };
  bus.publish(room, { type: 'msg', msg });
  return msg;
}

export function postReaction(room: string, emoji: string): void {
  ensureRoom(room);
  bus.publish(room, { type: 'react', emoji, at: Date.now() });
}

export function publishRoomConfig(room: string, config: unknown): void {
  ensureRoom(room);
  bus.publish(room, { type: 'config', config });
}

export function deleteChatMessage(room: string, id: string): void {
  ensureRoom(room);
  bus.publish(room, { type: 'del', id });
}

/** Test seam. */
export function __resetChat() {
  for (const off of listening.values()) off();
  listening.clear();
  rings.clear();
}
