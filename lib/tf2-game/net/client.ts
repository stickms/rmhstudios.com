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
 * Every match runs in a browser (offline, or a P2P host's listen server), so
 * the hub carries no game traffic of its own: the server browser, the host's
 * door, the ping column, and the signaling above.
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import {
  TF2_C2S,
  TF2_S2C,
  type ErrorPayload,
  type PongPayload,
  type RoomAdminPayload,
  type RoomDetailsPayload,
  type RoomGame,
  type RoomListEntry,
  type RoomsPayload,
} from './events';
import type { P2pAdmitPayload, P2pHostPayload, P2pJoinPayload, P2pSignalOut, P2pUpdatePayload } from './p2p/signal';

export interface Tf2ClientHandlers {
  onStatus?(status: RealtimeStatus): void;
  /** A page of the server browser (the public peer-to-peer rooms). */
  onRooms?(page: RoomsPayload): void;
  onRoomDetails?(details: RoomDetailsPayload): void;
  onError?(error: ErrorPayload): void;
}

/** Relayed unreliable packets are dropped while this many frames wait to be written. */
const RELAY_UNRELIABLE_BACKLOG = 16;

let client: RealtimeClient | null = null;
let handlers: Tf2ClientHandlers = {};
/** Pings waiting for their pong: sent-at → resolve with the round trip. */
const lobbyPings = new Map<number, (rttMs: number) => void>();
/** Whether the newest handshake carried a session token (false: the socket is signed out). */
let handshakeSignedIn = false;

const now = (): number => performance.now();

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
    onStatus: (status) => dispatch('onStatus', status),
    onConnect: (socket) => {
      socket.emit(TF2_C2S.LIST_ROOMS, {});
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

  socket.on(TF2_S2C.ERROR, (error: ErrorPayload) => dispatch('onError', error));

  socket.on(TF2_S2C.PONG, (pong: PongPayload) => {
    if (!pong || typeof pong.t !== 'number') return;
    const lobby = lobbyPings.get(pong.t);
    if (!lobby) return;
    lobbyPings.delete(pong.t);
    lobby(now() - pong.t);
  });
}

function emit(event: string, data?: unknown, queue = false): boolean {
  if (!client) return false;
  return client.emit(event, data, { queue });
}

/** Typed senders. `queue` holds an intent across a blip; positional/timed traffic never queues. */
export const tf2 = {
  listRooms: (offset = 0, game: RoomGame = 'tf2') => emit(TF2_C2S.LIST_ROOMS, game === 'tf2' ? { offset } : { offset, game }),
  roomDetails: (code: string) => emit(TF2_C2S.ROOM_DETAILS, { code }),
  /** The round trip to the hub, measured with one ping (the browser's ping column). */
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
  /** A P2P host's door (lock, password); kicks and the map are the host's own match. */
  roomAdmin: (payload: RoomAdminPayload) => emit(TF2_C2S.ROOM_ADMIN, payload, true),
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
 * who signed in after the lobby connected).
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

/** Tear the transport down. */
export function disconnectTf2(): void {
  client?.destroy();
  client = null;
}
