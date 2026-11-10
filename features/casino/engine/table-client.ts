/**
 * The casino table client — one factory for Hold'em, Blackjack, Baccarat and
 * Roulette, on top of `createRealtimeClient`.
 *
 * The four games used to carry four copies of the same bare `io()` client:
 * same auth callback, same connect/disconnect/connect_error trio, same room
 * events, same balance fan-out, same three-second error toast, and the same
 * `reconnectionAttempts: 5` that stranded a player whose phone slept through a
 * hand. What differs per game is only its table events and what a reconnect
 * may safely do, so that is all a game's `socket.ts` declares now.
 *
 * Connection lifecycle, reconnect tuning, wake signals, per-attempt credentials
 * and the protocol version (E2) all come from `lib/shared/realtime/client`.
 *
 * ## Reconnect
 *
 * A casino table retries the way every other realtime client does — forever,
 * 300 ms → 5 s with jitter, and immediately on any wake signal (tab visible,
 * `online`, focus, bfcache restore). Giving up after five attempts made no
 * sense for a table: the player is still sitting there, often with a stake on
 * it, and the hub is what decides whether that seat survives the drop.
 *
 * What a reconnect does next follows what the hub did on the disconnect
 * (`features/casino/server/<game>.ts`, `handle<Game>Disconnect`):
 *
 * - **Blackjack, Baccarat, Roulette hold the seat** mid-round (the player stays
 *   in `room.players` so the round settles to them) and release it between
 *   rounds. `rejoin-seat` re-sends `JOIN_ROOM { roomId }` for the table the UI
 *   is showing: the hub's reconnect branch re-attaches the held seat and
 *   answers with `ROOM_JOINED` + `TABLE_STATE`; a released seat is taken again
 *   at the same table (sitting down costs nothing in these games — every coin
 *   moves through an explicit bet). If the table is gone — the hub destroys a
 *   table when its last player leaves, which a between-rounds drop does — the
 *   hub answers with an ERROR and the UI goes back to the lobby.
 * - **Hold'em does not.** The hub folds the hand and cashes the stack out the
 *   moment the socket drops, so there is no seat to reclaim, and re-sending
 *   `JOIN_ROOM` would be a fresh buy-in debit the player never asked for.
 *   `back-to-lobby` puts the UI back on the room list instead of leaving it on
 *   a table the player is no longer at.
 *
 * Either way a player in the lobby re-asks for the room list, which also puts
 * the new socket back in the hub's lobby channel.
 */

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import { singleFlight } from '@/lib/shared/realtime/single-flight';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';

/**
 * The store surface every casino table shares. Method syntax on purpose: each
 * game's store narrows the payloads, and a method signature accepts that.
 */
export interface CasinoTableStore {
  roomInfo: { roomId: string } | null;
  setConnectionStatus(status: RealtimeStatus): void;
  setMyUserId(id: string | null): void;
  setError(message: string | null): void;
  setRoomList(rooms: unknown): void;
  setRoomJoined(info: unknown): void;
  setRoomLeft(): void;
  setRoomUpdated(info: unknown): void;
  setTableState(state: unknown): void;
  handlePlayerJoined(data: unknown): void;
  handlePlayerLeft(data: unknown): void;
  reset(): void;
}

/** The event names every casino table speaks, under its own prefix. */
export interface CasinoTableEvents {
  C2S: { LIST_ROOMS: string; JOIN_ROOM: string };
  S2C: {
    ROOM_LIST: string;
    ROOM_JOINED: string;
    ROOM_LEFT: string;
    ROOM_UPDATED: string;
    TABLE_STATE: string;
    PLAYER_JOINED: string;
    PLAYER_LEFT: string;
    BALANCE_UPDATE: string;
    ERROR: string;
  };
}

/** What a reconnect does for a player who was at a table. See the file header. */
export type CasinoReconnect = 'rejoin-seat' | 'back-to-lobby';

export interface CasinoTableSpec<S extends CasinoTableStore> {
  /** Used in log lines. */
  name: string;
  /** The game's Zustand `getState`. */
  store: () => S;
  events: CasinoTableEvents;
  onReconnect: CasinoReconnect;
  /** Wire the game's own table events (the shared room events are already bound). */
  bind: (socket: Socket, store: () => S) => void;
}

export interface CasinoTableClient {
  /** Open the table socket; concurrent callers share one in-flight connect. */
  connect: () => Promise<Socket>;
  /** The table socket (connected or retrying), or null before connect / after disconnect. */
  getSocket: () => Socket | null;
  /** Close the socket and reset the game's store. */
  disconnect: () => void;
  /** Subscribe to the hub's balance pushes; returns the unsubscribe. */
  onBalanceUpdate: (cb: (coins: number) => void) => () => void;
}

/** How long a server error stays on screen. */
const ERROR_VISIBLE_MS = 3_000;

export function createCasinoTableClient<S extends CasinoTableStore>(
  spec: CasinoTableSpec<S>,
): CasinoTableClient {
  const { name, store, events, onReconnect } = spec;
  const { C2S, S2C } = events;
  let client: RealtimeClient | null = null;
  const balanceListeners = new Set<(coins: number) => void>();

  /**
   * The table a reconnect asked to sit back down at, until the hub answers.
   * The JOIN_ROOM is the first thing the new socket sends, so the next
   * ROOM_JOINED or ERROR is its answer.
   */
  let rejoining: string | null = null;

  const backToLobby = (socket: Socket) => {
    if (store().roomInfo) store().setRoomLeft();
    socket.emit(C2S.LIST_ROOMS);
  };

  const bindTable = (socket: Socket) => {
    socket.on(S2C.ROOM_LIST, (data) => store().setRoomList(data.rooms));
    socket.on(S2C.ROOM_JOINED, (data) => {
      rejoining = null;
      store().setRoomJoined(data);
    });
    socket.on(S2C.ROOM_LEFT, () => store().setRoomLeft());
    socket.on(S2C.ROOM_UPDATED, (data) => store().setRoomUpdated(data));
    socket.on(S2C.TABLE_STATE, (data) => store().setTableState(data));
    socket.on(S2C.PLAYER_JOINED, (data) => store().handlePlayerJoined(data));
    socket.on(S2C.PLAYER_LEFT, (data) => store().handlePlayerLeft(data));

    socket.on(S2C.BALANCE_UPDATE, (data) => {
      balanceListeners.forEach((cb) => cb(data.coins));
    });
    socket.on(S2C.ERROR, (data) => {
      store().setError(data.message);
      setTimeout(() => store().setError(null), ERROR_VISIBLE_MS);
      // The table did not survive the drop (a table whose last player left is
      // destroyed, or it filled): show the lobby rather than a dead table.
      if (rejoining) {
        rejoining = null;
        backToLobby(socket);
      }
    });

    spec.bind(socket, store);
  };

  /** The hub dropped this socket's table mapping on disconnect; restore what it allows. */
  const recover = (socket: Socket) => {
    rejoining = null;
    const roomId = store().roomInfo?.roomId;
    if (roomId && onReconnect === 'rejoin-seat') {
      rejoining = roomId;
      socket.emit(C2S.JOIN_ROOM, { roomId });
      return;
    }
    backToLobby(socket);
  };

  async function connectInner(): Promise<Socket> {
    if (client?.socket.connected) return client.socket;

    if (client) {
      client.destroy();
      client = null;
    }

    store().setConnectionStatus('connecting');

    const session = await authClient.getSession();
    const token = session?.data?.session?.token;
    if (!token) {
      store().setConnectionStatus('error');
      throw new Error('Not authenticated');
    }

    store().setMyUserId(session.data?.user?.id ?? null);

    try {
      client = createRealtimeClient({
        name,
        url: import.meta.env.VITE_SOCKET_URL,
        path: '/socket/',
        auth: async () => {
          // Re-read per attempt so a reconnect after a refresh carries the new
          // token; fall back to the one this connect started with.
          try {
            const fresh = await authClient.getSession();
            return { token: fresh?.data?.session?.token ?? token };
          } catch {
            return { token };
          }
        },
        onStatus: (status) => store().setConnectionStatus(status),
        onConnect: (socket, { isReconnect }) => {
          if (isReconnect) recover(socket);
        },
        bind: bindTable,
      });
    } catch (error) {
      store().setConnectionStatus('error');
      throw error;
    }

    return client.socket;
  }

  return {
    connect: singleFlight(connectInner),
    getSocket: () => client?.socket ?? null,
    disconnect() {
      client?.destroy();
      client = null;
      store().reset();
    },
    onBalanceUpdate(cb) {
      balanceListeners.add(cb);
      return () => balanceListeners.delete(cb);
    },
  };
}
