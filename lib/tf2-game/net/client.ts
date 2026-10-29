/**
 * RMH TF2 — the browser's connection to the games hub.
 *
 * Connection lifecycle, backoff, wake signals and per-attempt credentials live
 * in `lib/shared/realtime/client`; this module is the TF2 event map, typed
 * senders, and clock sync. It is browser-only (socket.io-client, the auth
 * client) — unlike the rest of `net/`, which runs anywhere.
 *
 * The hub's auth is soft — anyone may connect and browse rooms — but every
 * multiplayer action needs a signed-in account (the hub answers
 * `auth-required`), and a player is named by their account. A page that signs
 * in after connecting calls `reauthenticateTf2()`: the handshake carries the
 * session token, so only a new connection picks it up.
 *
 * Peer-to-peer rooms (net/p2p/) only SIGNAL through here: `tf2.p2p.*` and
 * `subscribeTf2` carry announcements, join requests, WebRTC offers / answers /
 * candidates and the relay fallback's packets; the game itself runs over
 * DataChannels (client/net/webrtc.ts).
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
  type ExtraCommandPayload,
  type JoinedPayload,
  type KickedPayload,
  type PongPayload,
  type RoomAdminPayload,
  type RoomDetailsPayload,
  type RoomInfoPayload,
  type RoomListEntry,
  type RoomsPayload,
  type TeamChoice,
} from './events';
import type { P2pAdmitPayload, P2pHostPayload, P2pJoinPayload, P2pSignalOut, P2pUpdatePayload } from './p2p/signal';
import type { LoadoutSlots, TfClass } from '../../tf2-loadout/catalog-types';

export interface Tf2ClientHandlers {
  onStatus?(status: RealtimeStatus): void;
  /** A page of the server browser (dedicated and peer-to-peer rooms). */
  onRooms?(page: RoomsPayload): void;
  onRoomDetails?(details: RoomDetailsPayload): void;
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
  /** The room's administration (owner, lock, password) — sent on joining and when it changes. */
  onRoomInfo?(info: RoomInfoPayload): void;
}

/** Relayed unreliable packets are dropped while this many frames wait to be written. */
const RELAY_UNRELIABLE_BACKLOG = 16;

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
/** Lobby pings (outside a room) waiting for their pong: sent-at → resolve with the round trip. */
const lobbyPings = new Map<number, (rttMs: number) => void>();
/** Whether the newest handshake carried a session token (false: the socket is signed out). */
let handshakeSignedIn = false;

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

/**
 * Callbacks beside the owner's (the lobby's server browser, which stays
 * mounted under a running game): they hear the same events and never replace
 * the game's. Returns the removal.
 */
const extraHandlers = new Set<Tf2ClientHandlers>();
export function addTf2Handlers(extra: Tf2ClientHandlers): () => void {
  extraHandlers.add(extra);
  return () => {
    extraHandlers.delete(extra);
  };
}

/** Calls `name` on the owner's callbacks and every extra set. */
function dispatch<K extends keyof Tf2ClientHandlers>(name: K, ...args: Parameters<NonNullable<Tf2ClientHandlers[K]>>): void {
  const call = (h: Tf2ClientHandlers) => (h[name] as ((...a: unknown[]) => void) | undefined)?.(...args);
  call(handlers);
  for (const h of extraHandlers) call(h);
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
      const token = current?.data?.session?.token;
      handshakeSignedIn = !!token;
      return { token };
    },
    onStatus: (status) => {
      if (status !== 'connected') stopPinging();
      dispatch('onStatus', status);
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
  socket.on(TF2_S2C.ROOMS, (page: RoomsPayload | RoomListEntry[]) => {
    // An older hub answers with a bare array.
    if (Array.isArray(page)) dispatch('onRooms', { rooms: page, total: page.length, offset: 0 });
    else if (page && Array.isArray(page.rooms)) dispatch('onRooms', page);
  });

  socket.on(TF2_S2C.ROOM_DETAILS, (details: RoomDetailsPayload) => {
    if (details && typeof details.code === 'string') dispatch('onRoomDetails', details);
  });

  socket.on(TF2_S2C.JOINED, (info: JoinedPayload) => {
    if (!info?.code) return;
    currentCode = info.code;
    clock.reset();
    pingsSent = 0;
    schedulePing();
    dispatch('onJoined', info);
  });

  socket.on(TF2_S2C.SNAPSHOT, (data: unknown) => {
    const bytes = toBytes(data);
    if (bytes) dispatch('onSnapshot', bytes);
  });

  socket.on(TF2_S2C.EVENTS, (data: unknown) => {
    const bytes = toBytes(data);
    if (bytes) dispatch('onEvents', bytes);
  });

  socket.on(TF2_S2C.ROOM_INFO, (info: RoomInfoPayload) => {
    if (info && typeof info.code === 'string') dispatch('onRoomInfo', info);
  });

  socket.on(TF2_S2C.CHAT, (message: ChatMessage) => {
    if (message && typeof message.text === 'string') dispatch('onChat', message);
  });

  socket.on(TF2_S2C.KICKED, (info: KickedPayload) => {
    forgetRoom();
    dispatch('onKicked', info);
  });

  socket.on(TF2_S2C.ERROR, (error: ErrorPayload) => {
    // A room that vanished while we were away is gone for good.
    if (error?.code === 'no-such-room') forgetRoom();
    dispatch('onError', error);
  });

  socket.on(TF2_S2C.PONG, (pong: PongPayload) => {
    if (!pong || typeof pong.t !== 'number') return;
    const lobby = lobbyPings.get(pong.t);
    if (lobby) {
      lobbyPings.delete(pong.t);
      lobby(now() - pong.t);
      return;
    }
    if (typeof pong.tick !== 'number') return;
    clock.add({ sentAt: pong.t, receivedAt: now(), serverTick: pong.tick });
    const estimate = clock.estimate();
    if (estimate) dispatch('onClock', estimate);
  });
}

function emit(event: string, data?: unknown, queue = false): boolean {
  if (!client) return false;
  return client.emit(event, data, { queue });
}

/** Typed senders. `queue` holds an intent across a blip; positional/timed traffic never queues. */
export const tf2 = {
  listRooms: (offset = 0) => emit(TF2_C2S.LIST_ROOMS, { offset }),
  roomDetails: (code: string) => emit(TF2_C2S.ROOM_DETAILS, { code }),
  /** The round trip to the hub, measured with one ping (the browser's ping column for dedicated rooms). */
  measureHubRtt: (timeoutMs = 3000): Promise<number | null> =>
    new Promise((resolve) => {
      const t = now();
      lobbyPings.set(t, (rtt) => resolve(rtt));
      if (!emit(TF2_C2S.PING, { t })) {
        lobbyPings.delete(t);
        resolve(null);
        return;
      }
      setTimeout(() => {
        if (lobbyPings.delete(t)) resolve(null);
      }, timeoutMs);
    }),
  createRoom: (options: CreateRoomPayload) => {
    playerName = options.playerName;
    return emit(TF2_C2S.CREATE_ROOM, options, true);
  },
  /** Join by code; `spectate` seats you with the spectators (the join decides it), `password` opens a locked door. */
  joinRoom: (code: string, name?: string, opts: { spectate?: boolean; password?: string } = {}) => {
    playerName = name;
    return emit(
      TF2_C2S.JOIN_ROOM,
      {
        code: code.trim().toUpperCase(),
        playerName: name,
        ...(opts.spectate ? { spectate: true } : {}),
        ...(opts.password ? { password: opts.password } : {}),
      },
      true,
    );
  },
  /** The room owner's administration (kick, ownership, map, lock, password, a server message). */
  roomAdmin: (payload: RoomAdminPayload) => emit(TF2_C2S.ROOM_ADMIN, payload, true),
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
  /** A generic game command (`build`, `destroy`, `disguise`, `taunt` …) — MatchCommand { kind: 'extra' }. */
  extra: (command: string, args: ReadonlyArray<number | string | boolean> = []) =>
    emit(TF2_C2S.EXTRA, { command, args } satisfies ExtraCommandPayload),
  /** Equip a loadout for a class (MatchCommand { kind: 'loadout' }). */
  loadout: (cls: TfClass, slots: LoadoutSlots) => emit(TF2_C2S.LOADOUT, { cls, slots }, true),
  /** The latest server-tick estimate, or null before the first pong. */
  clock: (): ClockEstimate | null => clock.estimate(),
  currentRoom: (): string | null => currentCode,
  /** Peer-to-peer signaling (net/p2p/signal.ts). Never game traffic, except the relay fallback. */
  p2p: {
    host: (payload: P2pHostPayload) => emit(TF2_C2S.P2P_HOST, payload, true),
    update: (payload: P2pUpdatePayload) => emit(TF2_C2S.P2P_UPDATE, payload),
    /** `migrate`: hand the match to the named successor instead of ending it. */
    close: (migrate = false) => emit(TF2_C2S.P2P_CLOSE, migrate ? { migrate: true } : {}),
    join: (code: string, opts: Omit<P2pJoinPayload, 'code'> = {}) =>
      emit(TF2_C2S.P2P_JOIN, { ...opts, code: code.trim().toUpperCase() }, true),
    /** Host migration: the member that takes over if this host leaves (null: nobody). */
    successor: (peerId: string | null) => emit(TF2_C2S.P2P_SUCCESSOR, { peerId }, true),
    leave: () => emit(TF2_C2S.P2P_LEAVE, {}),
    admit: (payload: P2pAdmitPayload) => emit(TF2_C2S.P2P_ADMIT, payload, true),
    kick: (peerId: string) => emit(TF2_C2S.P2P_KICK, { peerId }, true),
    signal: (payload: P2pSignalOut) => emit(TF2_C2S.P2P_SIGNAL, payload, true),
    relayStart: (peerId?: string) => emit(TF2_C2S.P2P_RELAY_START, peerId ? { peerId } : {}, true),
    /**
     * One relayed packet (header + payload, signal.ts encodeRelay). Reliable ones ride
     * socket.io's own buffer across a blip. Unreliable ones are dropped when the
     * connection is down or backed up — but not with socket.io's `volatile`, which also
     * drops anything sent while the previous frame is still being written: a tick's
     * reliable batch would take its own snapshot with it.
     */
    relay: (packet: Uint8Array, reliable: boolean): boolean => {
      const socket = client?.socket;
      if (!socket) return false;
      if (reliable) {
        socket.emit(TF2_C2S.P2P_RELAY, packet);
        return true;
      }
      if (!socket.connected) return false;
      const pending = (socket.io as unknown as { engine?: { writeBuffer?: unknown[] } }).engine?.writeBuffer?.length;
      if (pending === undefined) socket.volatile.emit(TF2_C2S.P2P_RELAY, packet);
      else if (pending > RELAY_UNRELIABLE_BACKLOG) return false;
      else socket.emit(TF2_C2S.P2P_RELAY, packet);
      return true;
    },
  },
};

/**
 * Listen to one hub event (the peer-to-peer controllers' signaling). Returns
 * the unsubscribe. Needs `connectTf2` first; a no-op before it.
 */
export function subscribeTf2<T = unknown>(event: string, fn: (payload: T) => void): () => void {
  const socket = client?.socket;
  if (!socket) return () => {};
  const handler = (payload: T) => fn(payload);
  socket.on(event, handler);
  return () => socket.off(event, handler);
}

/**
 * Reconnect so the handshake carries the session the page has now (a visitor
 * who signed in after the lobby connected). The room, if any, is rejoined.
 */
export function reauthenticateTf2(): void {
  const socket = client?.socket;
  // Only a socket that connected signed out needs it: a reconnect drops hub-side state (a P2P membership).
  if (!socket || handshakeSignedIn) return;
  socket.disconnect();
  socket.connect();
}

export function getTf2Socket(): Socket | null {
  return client?.socket ?? null;
}

/** Tear the transport down. Keeps the room code: a remount within the grace rejoins it. */
export function disconnectTf2(): void {
  stopPinging();
  client?.destroy();
  client = null;
}
