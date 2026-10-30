/**
 * RMH TF2 — the server browser, a P2P host's door and clock sync on the games
 * hub (docs/tf2-game.md "Peer-to-peer play").
 *
 * **This file never simulates, and neither does anything else on the hub.**
 * Every match runs in a player's browser: offline against bots, or as a
 * peer-to-peer listen server whose signaling, relay fallback and host
 * migration live in ./tf2-p2p.ts. This handler:
 *
 *   - lists the public peer-to-peer rooms for the server browser, a page at a
 *     time, and answers its details pane;
 *   - takes a P2P host's door commands (`tf2:room:admin`: lock, password) and
 *     hands them to ./tf2-p2p.ts, which checks the socket hosts the room;
 *   - answers clock-sync pings (the browser's ping column is the hub's round trip).
 *
 * **Multiplayer needs an account.** Browsing and pings stay open; the door is
 * refused with `auth-required` for a socket without a verified session.
 *
 * NOTE: server code imports `lib/` RELATIVELY — server/CLAUDE.md gotcha 7.
 */

import type { Server, Socket } from 'socket.io';
import { checkRateLimit } from '../rate-limit';
import { listPublicP2pRooms, p2pRoomAdmin, p2pRoomDetails, tf2Account } from './tf2-p2p';
import {
  TF2_C2S,
  TF2_LIMITS,
  TF2_S2C,
  type PongPayload,
  type RoomGame,
  type RoomDetailsPayload,
  type RoomsPayload,
  type Tf2ErrorCode,
} from '../../../lib/tf2-game/net/events';
import { zListRooms, zPing, zRoomAdmin, zRoomDetails } from '../../../lib/tf2-game/net/lobby-schema';

function fail(socket: Socket, code: Tf2ErrorCode, event?: string): void {
  socket.emit(TF2_S2C.ERROR, { code, event });
}

/** One page of one game's server browser (`BROWSE_CAP` rooms from `offset`), busiest first. Never an address. */
export function listPublicTf2Rooms(offset = 0, game: RoomGame = 'tf2'): RoomsPayload {
  const all = listPublicP2pRooms(game).sort((a, b) => b.players - a.players || a.code.localeCompare(b.code));
  const start = Math.max(0, Math.min(offset, all.length));
  return { rooms: all.slice(start, start + TF2_LIMITS.BROWSE_CAP), total: all.length, offset: start };
}

function roomDetails(code: string): RoomDetailsPayload {
  return { code, room: p2pRoomDetails(code) };
}

export function registerTf2GameHandlers(_io: Server, socket: Socket): void {
  /** Rate limit → account (the door) → schema, every time. Browsing and clock sync stay open. */
  const gate = <T>(
    event: string,
    schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
    payload: unknown,
    needsAccount = true,
  ): T | null => {
    if (!checkRateLimit(socket.id, event)) {
      fail(socket, 'rate-limited', event);
      return null;
    }
    if (needsAccount && !tf2Account(socket)) {
      fail(socket, 'auth-required', event);
      return null;
    }
    const parsed = schema.safeParse(payload ?? {});
    if (!parsed.success) {
      fail(socket, 'bad-payload', event);
      return null;
    }
    return parsed.data;
  };

  socket.on(TF2_C2S.LIST_ROOMS, (payload: unknown) => {
    const data = gate(TF2_C2S.LIST_ROOMS, zListRooms, payload, false);
    if (data === null) return;
    socket.emit(TF2_S2C.ROOMS, listPublicTf2Rooms(data.offset ?? 0, data.game ?? 'tf2'));
  });

  socket.on(TF2_C2S.ROOM_DETAILS, (payload: unknown) => {
    const data = gate(TF2_C2S.ROOM_DETAILS, zRoomDetails, payload, false);
    if (data === null) return;
    socket.emit(TF2_S2C.ROOM_DETAILS, roomDetails(data.code));
  });

  /** A peer-to-peer host's door: ./tf2-p2p.ts checks the socket hosts the room and logs it. */
  socket.on(TF2_C2S.ROOM_ADMIN, (payload: unknown) => {
    const data = gate(TF2_C2S.ROOM_ADMIN, zRoomAdmin, payload);
    if (!data) return;
    if (!p2pRoomAdmin(socket, data)) fail(socket, 'not-owner', TF2_C2S.ROOM_ADMIN);
  });

  socket.on(TF2_C2S.PING, (payload: unknown) => {
    const data = gate(TF2_C2S.PING, zPing, payload, false);
    if (!data) return;
    const pong: PongPayload = { t: data.t, serverTime: Date.now() };
    socket.emit(TF2_S2C.PONG, pong);
  });
}

export function handleTf2GameDisconnect(_io: Server, _socket: Socket): void {
  // Nothing to release: rooms belong to their hosts (./tf2-p2p.ts handles their sockets).
}
