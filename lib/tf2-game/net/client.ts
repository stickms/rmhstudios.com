/**
 * RMH TF2 — the browser's connection to the games hub.
 *
 * Connection lifecycle, backoff, wake signals and per-attempt credentials live
 * in `lib/shared/realtime/client`; this module is the TF2 event map, typed
 * senders, and clock sync. It is browser-only (socket.io-client, the auth
 * client) — unlike the rest of `net/`, which runs anywhere.
 *
 * The hub uses soft auth and so does TF2: a signed-out player plays under the
 * `playerName` they send; a signed-in one under their account name.
 *
 * A reconnect is a NEW socket id, and the hub keys players by socket, so on
 * every reconnect we re-join the room by code; the hub holds a room whose last
 * player dropped for 30 s, and the match gives us a fresh player.
 *
 * The hot path bypasses the outbox: input goes out `volatile` (a stale command
 * is worse than a missing one — the next packet carries the redundant ones),
 * and snapshots/events arrive as bytes for the game's decoders.
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import { TICK_INTERVAL } from '../core/constants';
import { TickClock, type ClockEstimate } from './clock';
import {
  TF2_C2S,
  TF2_LIMITS,
  TF2_S2C,
  type ChatMessage,
  type ClassChoice,
  type CreateRoomPayload,
  type ErrorPayload,
  type JoinedPayload,
  type KickedPayload,
  type PongPayload,
  type RoomListEntry,
  type TeamChoice,
} from './events';

export interface Tf2ClientHandlers {
  onStatus?(status: RealtimeStatus): void;
  onRooms?(rooms: RoomListEntry[]): void;
  onJoined?(info: JoinedPayload): void;
  /** Unreliable snapshot bytes (may be dropped or arrive late). */
  onSnapshot?(data: Uint8Array): void;
  /** Reliable event-batch bytes, in order. */
  onEvents?(data: Uint8Array): void;
  onChat?(message: ChatMessage): void;
  onKicked?(info: KickedPayload): void;
  onError?(error: ErrorPayload): void;
  /** A new clock estimate after each pong. */
  onClock?(estimate: ClockEstimate): void;
}

/** Ping cadence: a quick burst after joining to converge, then a steady trickle. */
const PING_BURST = 5;
const PING_BURST_INTERVAL_MS = 200;
const PING_INTERVAL_MS = 2_000;

let client: RealtimeClient | null = null;
let handlers: Tf2ClientHandlers = {};
/** The room to re-enter after a drop. */
let currentCode: string | null = null;
let playerName: string | undefined;
let pingTimer: ReturnType<typeof setTimeout> | null = null;
let pingsSent = 0;
const clock = new TickClock(TICK_INTERVAL * 1000);

const now = (): number => performance.now();

function toBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

function stopPinging(): void {
  if (pingTimer) clearTimeout(pingTimer);
  pingTimer = null;
}

function schedulePing(): void {
  stopPinging();
  const delay = pingsSent < PING_BURST ? PING_BURST_INTERVAL_MS : PING_INTERVAL_MS;
  pingTimer = setTimeout(() => {
    pingTimer = null;
    if (!currentCode) return;
    pingsSent += 1;
    client?.emit(TF2_C2S.PING, { t: now() });
    schedulePing();
  }, delay);
}

function forgetRoom(): void {
  currentCode = null;
  stopPinging();
  clock.reset();
}

/** Set (or replace) the callbacks. The game screen owns them while mounted. */
export function setTf2Handlers(next: Tf2ClientHandlers): void {
  handlers = next;
}

export async function connectTf2(next?: Tf2ClientHandlers): Promise<Socket> {
  if (next) handlers = next;
  if (client) {
    client.reconnectNow();
    return client.socket;
  }

  client = createRealtimeClient({
    name: 'Tf2',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      const current = await authClient.getSession();
      return { token: current?.data?.session?.token };
    },
    onStatus: (status) => {
      if (status !== 'connected') stopPinging();
      handlers.onStatus?.(status);
    },
    onConnect: (socket) => {
      if (currentCode) socket.emit(TF2_C2S.JOIN_ROOM, { code: currentCode, playerName });
      else socket.emit(TF2_C2S.LIST_ROOMS, {});
    },
    bind: registerHandlers,
  });

  return client.socket;
}

function registerHandlers(socket: Socket): void {
  socket.on(TF2_S2C.ROOMS, (rooms: RoomListEntry[]) => handlers.onRooms?.(Array.isArray(rooms) ? rooms : []));

  socket.on(TF2_S2C.JOINED, (info: JoinedPayload) => {
    if (!info?.code) return;
    currentCode = info.code;
    clock.reset();
    pingsSent = 0;
    schedulePing();
    handlers.onJoined?.(info);
  });

  socket.on(TF2_S2C.SNAPSHOT, (data: unknown) => {
    const bytes = toBytes(data);
    if (bytes) handlers.onSnapshot?.(bytes);
  });

  socket.on(TF2_S2C.EVENTS, (data: unknown) => {
    const bytes = toBytes(data);
    if (bytes) handlers.onEvents?.(bytes);
  });

  socket.on(TF2_S2C.CHAT, (message: ChatMessage) => {
    if (message && typeof message.text === 'string') handlers.onChat?.(message);
  });

  socket.on(TF2_S2C.KICKED, (info: KickedPayload) => {
    forgetRoom();
    handlers.onKicked?.(info);
  });

  socket.on(TF2_S2C.ERROR, (error: ErrorPayload) => {
    // A room that vanished while we were away is gone for good.
    if (error?.code === 'no-such-room') forgetRoom();
    handlers.onError?.(error);
  });

  socket.on(TF2_S2C.PONG, (pong: PongPayload) => {
    if (!pong || typeof pong.t !== 'number' || typeof pong.tick !== 'number') return;
    clock.add({ sentAt: pong.t, receivedAt: now(), serverTick: pong.tick });
    const estimate = clock.estimate();
    if (estimate) handlers.onClock?.(estimate);
  });
}

function emit(event: string, data?: unknown, queue = false): boolean {
  if (!client) return false;
  return client.emit(event, data, { queue });
}

/** Typed senders. `queue` holds an intent across a blip; positional/timed traffic never queues. */
export const tf2 = {
  listRooms: () => emit(TF2_C2S.LIST_ROOMS, {}),
  createRoom: (options: CreateRoomPayload) => {
    playerName = options.playerName;
    return emit(TF2_C2S.CREATE_ROOM, options, true);
  },
  joinRoom: (code: string, name?: string) => {
    playerName = name;
    return emit(TF2_C2S.JOIN_ROOM, { code: code.trim().toUpperCase(), playerName: name }, true);
  },
  leave: () => {
    forgetRoom();
    return emit(TF2_C2S.LEAVE, {}, true);
  },
  /** One packed input packet; dropped (not queued) while offline or congested. */
  sendInput: (packet: Uint8Array): boolean => {
    const socket = client?.socket;
    if (!socket?.connected || packet.byteLength > TF2_LIMITS.INPUT_MAX_BYTES) return false;
    socket.volatile.emit(TF2_C2S.INPUT, packet);
    return true;
  },
  chat: (text: string, teamOnly = false) => emit(TF2_C2S.CHAT, { text, teamOnly }, true),
  team: (team: TeamChoice) => emit(TF2_C2S.TEAM, { team }, true),
  playerClass: (cls: ClassChoice) => emit(TF2_C2S.CLASS, { cls }, true),
  voice: (menu: 0 | 1 | 2, item: number) => emit(TF2_C2S.VOICE, { menu, item }),
  /** The latest server-tick estimate, or null before the first pong. */
  clock: (): ClockEstimate | null => clock.estimate(),
  currentRoom: (): string | null => currentCode,
};

export function getTf2Socket(): Socket | null {
  return client?.socket ?? null;
}

/** Tear the transport down. Keeps the room code: a remount within the grace rejoins it. */
export function disconnectTf2(): void {
  stopPinging();
  client?.destroy();
  client = null;
}
