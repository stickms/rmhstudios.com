/**
 * RMH TF2 — room manager and relay on the games hub (docs/tf2-game.md).
 *
 * **This file never simulates.** The hub runs ~18 games on one event loop
 * (see the rule at the top of bums-rush.ts); a TF2 match is a 66.67 Hz
 * authoritative simulation, so every match runs on a `worker_threads` worker
 * owned by the match pool (`lib/tf2-game/server/pool.server.ts`). This handler:
 *
 *   - owns rooms (list / create / join / leave) and maps sockets to players;
 *   - validates every inbound payload (rate limit → shape → room membership),
 *     including the map against the allowlist (`lib/tf2-game/data/maps.ts`);
 *   - forwards binary input and control commands to the player's match;
 *   - relays the match's packets to sockets: unreliable ones as volatile
 *     `tf2:snapshot` (dropped rather than queued behind a slow connection),
 *     reliable ones as `tf2:events`;
 *   - delivers chat (team chat by the team the match last reported);
 *   - closes rooms whose match failed, crashed, or emptied.
 *
 * Identity follows the hub's soft auth: a signed-in player is named by their
 * account; an anonymous one by the sanitised `playerName` they send.
 *
 * NOTE: server code imports `lib/` RELATIVELY — server/CLAUDE.md gotcha 7.
 */

import type { Server, Socket } from 'socket.io';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { generateRoomCode, sanitizeString, sanitizeUserName } from '../utils';
import { findTf2Map } from '../../../lib/tf2-game/data/maps';
import {
  TF2_C2S,
  TF2_LIMITS,
  TF2_S2C,
  type BotDifficulty,
  type ChatMessage,
  type JoinedPayload,
  type KickReason,
  type PongPayload,
  type RoomListEntry,
  type RoomState,
  type Tf2ErrorCode,
} from '../../../lib/tf2-game/net/events';
import {
  zChat,
  zClass,
  zCreateRoom,
  zEmpty,
  zExtraCommand,
  zJoinRoom,
  zPing,
  zTeam,
  zVoice,
} from '../../../lib/tf2-game/net/lobby-schema';
import type { Tf2Mode } from '../../../lib/tf2-game/data/maps';
import type { MatchCommand, RoomSummary } from '../../../lib/tf2-game/server/match-host';
import type { WirePacket } from '../../../lib/tf2-game/server/worker-protocol';
import {
  getMatchPool,
  type MatchHandle,
  type PoolCloseReason,
} from '../../../lib/tf2-game/server/pool.server';
import { TEAM_UNASSIGNED, TICK_INTERVAL } from '../../../lib/tf2-game/core/constants';

// ─── Constants ──────────────────────────────────────────────────────────────

const CHANNEL_PREFIX = 'tf2:';
/** A room whose last player DROPPED (not left) is held this long for a rejoin. */
export const ROOM_EMPTY_GRACE_MS = 30_000;
/** A match that has not loaded its map by now is not going to. */
export const MATCH_LOAD_TIMEOUT_MS = 60_000;

// ─── State ──────────────────────────────────────────────────────────────────

interface Tf2Player {
  playerId: number;
  socketId: string;
  name: string;
  userId: string | null;
}

interface Tf2Room {
  code: string;
  name: string;
  map: string;
  mode: Tf2Mode;
  maxPlayers: number;
  botCount: number;
  botDifficulty: BotDifficulty;
  isPrivate: boolean;
  state: RoomState;
  handle: MatchHandle;
  /** Humans, by player id. */
  players: Map<number, Tf2Player>;
  nextPlayerId: number;
  /** Team per player id, from the match's latest summary. */
  teams: Map<number, number>;
  summary: RoomSummary | null;
  /** Last tick the match reported, and when (epoch ms) — for clock sync. */
  tick: number;
  tickAt: number;
  tickInterval: number;
  emptyTimer: ReturnType<typeof setTimeout> | null;
  loadTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

const rooms = new Map<string, Tf2Room>();
/** A socket plays in at most one TF2 room. */
const seats = new Map<string, { code: string; playerId: number }>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function channel(code: string): string {
  return `${CHANNEL_PREFIX}${code}`;
}

function fail(socket: Socket, code: Tf2ErrorCode, event?: string): void {
  socket.emit(TF2_S2C.ERROR, { code, event });
}

function displayName(socket: Socket, requested: unknown): { name: string; userId: string | null } {
  const data = socket.data as { userId?: unknown; userName?: unknown };
  const userId = typeof data.userId === 'string' && data.userId ? data.userId : null;
  const name = sanitizeUserName(userId && typeof data.userName === 'string' ? data.userName : requested);
  return { name, userId };
}

/** Chat is rendered as text by React; strip control characters and cap it, nothing more. */
function cleanChat(raw: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, TF2_LIMITS.CHAT_MAX_LENGTH);
}

function estimatedTick(room: Tf2Room, now = Date.now()): number {
  if (room.state !== 'running') return room.tick;
  return room.tick + Math.max(0, Math.floor((now - room.tickAt) / (room.tickInterval * 1000)));
}

function asBytes(payload: unknown): Uint8Array | null {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  return null;
}

function listEntry(room: Tf2Room): RoomListEntry {
  const bots = room.summary ? room.summary.players.filter((p) => p.bot).length : room.botCount;
  return {
    code: room.code,
    name: room.name,
    map: room.map,
    mode: room.mode,
    players: room.players.size,
    bots,
    maxPlayers: room.maxPlayers,
    state: room.state,
  };
}

export function listPublicTf2Rooms(): RoomListEntry[] {
  return [...rooms.values()]
    .filter((room) => !room.isPrivate && !room.closed)
    .map(listEntry)
    .sort((a, b) => b.players - a.players)
    .slice(0, TF2_LIMITS.BROWSE_CAP);
}

function joinedPayload(room: Tf2Room, playerId: number): JoinedPayload {
  return {
    code: room.code,
    playerId,
    map: room.map,
    mode: room.mode,
    name: room.name,
    maxPlayers: room.maxPlayers,
    serverTick: estimatedTick(room),
    tickInterval: room.tickInterval,
  };
}

// ─── Room lifecycle ─────────────────────────────────────────────────────────

const KICK_REASON: Record<PoolCloseReason, KickReason> = {
  'map-failed': 'map-failed',
  'server-error': 'server-error',
  empty: 'room-closed',
};

/** Tell everyone, release the sockets, forget the room. Disposes the match unless it is already gone. */
function closeRoom(io: Server, room: Tf2Room, reason: KickReason, disposeMatch: boolean): void {
  if (room.closed) return;
  room.closed = true;
  if (room.emptyTimer) clearTimeout(room.emptyTimer);
  if (room.loadTimer) clearTimeout(room.loadTimer);
  room.emptyTimer = null;
  room.loadTimer = null;
  rooms.delete(room.code);
  if (disposeMatch) room.handle.dispose();

  for (const player of room.players.values()) {
    seats.delete(player.socketId);
    const socket = io.sockets.sockets.get(player.socketId);
    socket?.emit(TF2_S2C.KICKED, { code: room.code, reason });
    socket?.leave(channel(room.code));
  }
  room.players.clear();
  logger.info({ event: 'tf2_room_closed', code: room.code, reason });
}

function relay(io: Server, room: Tf2Room, packets: WirePacket[]): void {
  for (const packet of packets) {
    let target: string;
    if (packet.to === 'all') {
      target = channel(room.code);
    } else {
      const player = room.players.get(packet.to);
      if (!player) continue;
      target = player.socketId;
    }
    const data = new Uint8Array(packet.data);
    if (packet.reliable) io.to(target).emit(TF2_S2C.EVENTS, data);
    else io.to(target).volatile.emit(TF2_S2C.SNAPSHOT, data);
  }
}

function seat(socket: Socket, room: Tf2Room, requestedName: unknown): void {
  const { name, userId } = displayName(socket, requestedName);
  const playerId = room.nextPlayerId++;
  room.players.set(playerId, { playerId, socketId: socket.id, name, userId });
  seats.set(socket.id, { code: room.code, playerId });
  socket.join(channel(room.code));
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
  room.handle.addPlayer(playerId, userId ? { name, userId } : { name });
  // A loading room sends `joined` to everyone when its map is in (onReady).
  if (room.state === 'running') socket.emit(TF2_S2C.JOINED, joinedPayload(room, playerId));
}

/**
 * Take the socket out of its room. `dropped` (a disconnect) holds an emptied
 * room for a rejoin; an explicit leave closes it at once.
 */
function unseat(io: Server, socket: Socket, dropped: boolean): void {
  const where = seats.get(socket.id);
  if (!where) return;
  seats.delete(socket.id);
  const room = rooms.get(where.code);
  if (!room) return;
  room.players.delete(where.playerId);
  room.teams.delete(where.playerId);
  room.handle.removePlayer(where.playerId);
  socket.leave(channel(room.code));

  if (room.players.size > 0) return;
  if (!dropped) {
    closeRoom(io, room, 'room-closed', true);
    return;
  }
  room.emptyTimer ??= setTimeout(() => {
    room.emptyTimer = null;
    if (room.players.size === 0) closeRoom(io, room, 'room-closed', true);
  }, ROOM_EMPTY_GRACE_MS);
  room.emptyTimer.unref?.();
}

function uniqueCode(): string | null {
  for (let i = 0; i < 20; i += 1) {
    const code = generateRoomCode();
    if (!rooms.has(code)) return code;
  }
  return null;
}

// ─── Registration ───────────────────────────────────────────────────────────

export function registerTf2GameHandlers(io: Server, socket: Socket): void {
  /** Rate limit → schema. Every control-plane event, every time. */
  const gate = <T>(
    event: string,
    schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
    payload: unknown,
  ): T | null => {
    if (!checkRateLimit(socket.id, event)) {
      fail(socket, 'rate-limited', event);
      return null;
    }
    const parsed = schema.safeParse(payload ?? {});
    if (!parsed.success) {
      fail(socket, 'bad-payload', event);
      return null;
    }
    return parsed.data;
  };

  const myRoom = (event?: string): { room: Tf2Room; playerId: number } | null => {
    const where = seats.get(socket.id);
    const room = where ? rooms.get(where.code) : undefined;
    if (!where || !room || room.closed) {
      if (event) fail(socket, 'not-in-room', event);
      return null;
    }
    return { room, playerId: where.playerId };
  };

  const forward = (event: string, cmd: MatchCommand): void => {
    const mine = myRoom(event);
    if (!mine) return;
    mine.room.handle.command(mine.playerId, cmd);
  };

  socket.on(TF2_C2S.LIST_ROOMS, (payload: unknown) => {
    if (gate(TF2_C2S.LIST_ROOMS, zEmpty, payload) === null) return;
    socket.emit(TF2_S2C.ROOMS, listPublicTf2Rooms());
  });

  socket.on(TF2_C2S.CREATE_ROOM, (payload: unknown) => {
    const data = gate(TF2_C2S.CREATE_ROOM, zCreateRoom, payload);
    if (!data) return;
    const map = findTf2Map(data.map);
    if (!map) {
      fail(socket, 'unknown-map', TF2_C2S.CREATE_ROOM);
      return;
    }
    if (data.mode && data.mode !== map.mode) {
      fail(socket, 'bad-mode', TF2_C2S.CREATE_ROOM);
      return;
    }
    const code = uniqueCode();
    if (!code) {
      fail(socket, 'capacity', TF2_C2S.CREATE_ROOM);
      return;
    }

    unseat(io, socket, false);

    const maxPlayers = data.maxPlayers;
    const botCount = Math.min(data.botCount, maxPlayers - 1);
    const name = sanitizeString(data.name, TF2_LIMITS.ROOM_NAME_MAX_LENGTH) || map.title;
    // Assigned once the pool accepts; the listener only fires after that.
    let room: Tf2Room | null = null;

    const result = getMatchPool(logger).createMatch(
      {
        matchId: code,
        map: map.name,
        mode: map.mode,
        maxPlayers,
        botCount,
        botDifficulty: data.botDifficulty,
        name,
        seed: Math.floor(Math.random() * 0x7fffffff),
      },
      {
        onReady: ({ tick, tickInterval }) => {
          if (!room || room.closed) return;
          room.state = 'running';
          room.tick = tick;
          room.tickAt = Date.now();
          room.tickInterval = tickInterval;
          if (room.loadTimer) clearTimeout(room.loadTimer);
          room.loadTimer = null;
          for (const player of room.players.values()) {
            io.to(player.socketId).emit(TF2_S2C.JOINED, joinedPayload(room, player.playerId));
          }
        },
        onFrame: (tick, packets) => {
          if (!room || room.closed) return;
          room.tick = tick;
          room.tickAt = Date.now();
          relay(io, room, packets);
        },
        onSummary: (summary) => {
          if (!room || room.closed) return;
          room.summary = summary;
          room.teams.clear();
          for (const p of summary.players) if (!p.bot) room.teams.set(p.id, p.team);
        },
        onClosed: (reason) => {
          if (room) closeRoom(io, room, KICK_REASON[reason], false);
        },
      },
    );
    if (!result.ok) {
      fail(socket, result.error, TF2_C2S.CREATE_ROOM);
      return;
    }

    const created: Tf2Room = {
      code,
      name,
      map: map.name,
      mode: map.mode,
      maxPlayers,
      botCount,
      botDifficulty: data.botDifficulty,
      isPrivate: data.private === true,
      state: 'loading',
      handle: result.handle,
      players: new Map(),
      nextPlayerId: 1,
      teams: new Map(),
      summary: null,
      tick: 0,
      tickAt: Date.now(),
      tickInterval: TICK_INTERVAL,
      emptyTimer: null,
      loadTimer: null,
      closed: false,
    };
    room = created;
    rooms.set(code, created);
    created.loadTimer = setTimeout(() => {
      created.loadTimer = null;
      if (created.state === 'loading') closeRoom(io, created, 'map-failed', true);
    }, MATCH_LOAD_TIMEOUT_MS);
    created.loadTimer.unref?.();

    logger.info({ event: 'tf2_room_created', code, map: map.name, maxPlayers, botCount });
    seat(socket, created, data.playerName);
  });

  socket.on(TF2_C2S.JOIN_ROOM, (payload: unknown) => {
    const data = gate(TF2_C2S.JOIN_ROOM, zJoinRoom, payload);
    if (!data) return;
    const room = rooms.get(data.code);
    if (!room || room.closed) {
      fail(socket, 'no-such-room', TF2_C2S.JOIN_ROOM);
      return;
    }
    const current = seats.get(socket.id);
    if (current?.code === room.code) {
      // Already here (a duplicate join after a reconnect race): just restate it.
      if (room.state === 'running') socket.emit(TF2_S2C.JOINED, joinedPayload(room, current.playerId));
      return;
    }
    if (room.players.size >= room.maxPlayers) {
      fail(socket, 'room-full', TF2_C2S.JOIN_ROOM);
      return;
    }
    unseat(io, socket, false);
    seat(socket, room, data.playerName);
  });

  socket.on(TF2_C2S.LEAVE, (payload: unknown) => {
    if (gate(TF2_C2S.LEAVE, zEmpty, payload) === null) return;
    unseat(io, socket, false);
  });

  /**
   * The hot path: opaque bytes for the match. Silent drops only — answering a
   * flood with an error per packet would double it.
   */
  socket.on(TF2_C2S.INPUT, (payload: unknown) => {
    if (!checkRateLimit(socket.id, TF2_C2S.INPUT)) return;
    const bytes = asBytes(payload);
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > TF2_LIMITS.INPUT_MAX_BYTES) return;
    const mine = myRoom();
    if (!mine || mine.room.state !== 'running') return;
    mine.room.handle.input(mine.playerId, bytes);
  });

  socket.on(TF2_C2S.CHAT, (payload: unknown) => {
    const data = gate(TF2_C2S.CHAT, zChat, payload);
    if (!data) return;
    const mine = myRoom(TF2_C2S.CHAT);
    if (!mine) return;
    const text = cleanChat(data.text);
    if (!text) return;
    const { room, playerId } = mine;
    const sender = room.players.get(playerId);
    if (!sender) return;
    const teamOnly = data.teamOnly === true;
    const team = room.teams.get(playerId) ?? TEAM_UNASSIGNED;
    const message: ChatMessage = { from: playerId, name: sender.name, text, teamOnly, team, at: Date.now() };

    if (teamOnly) {
      for (const player of room.players.values()) {
        if ((room.teams.get(player.playerId) ?? TEAM_UNASSIGNED) === team) {
          io.to(player.socketId).emit(TF2_S2C.CHAT, message);
        }
      }
    } else {
      io.to(channel(room.code)).emit(TF2_S2C.CHAT, message);
    }
    room.handle.command(playerId, { kind: 'chat', text, teamOnly });
  });

  socket.on(TF2_C2S.TEAM, (payload: unknown) => {
    const data = gate(TF2_C2S.TEAM, zTeam, payload);
    if (data) forward(TF2_C2S.TEAM, { kind: 'team', team: data.team });
  });

  socket.on(TF2_C2S.CLASS, (payload: unknown) => {
    const data = gate(TF2_C2S.CLASS, zClass, payload);
    if (data) forward(TF2_C2S.CLASS, { kind: 'class', cls: data.cls });
  });

  socket.on(TF2_C2S.VOICE, (payload: unknown) => {
    const data = gate(TF2_C2S.VOICE, zVoice, payload);
    if (data) forward(TF2_C2S.VOICE, { kind: 'voice', menu: data.menu, item: data.item });
  });

  socket.on(TF2_C2S.EXTRA, (payload: unknown) => {
    const data = gate(TF2_C2S.EXTRA, zExtraCommand, payload);
    if (data) forward(TF2_C2S.EXTRA, { kind: 'extra', command: data.command, args: data.args });
  });

  socket.on(TF2_C2S.PING, (payload: unknown) => {
    const data = gate(TF2_C2S.PING, zPing, payload);
    if (!data) return;
    const mine = myRoom();
    const pong: PongPayload = {
      t: data.t,
      serverTime: Date.now(),
      tick: mine && mine.room.state === 'running' ? estimatedTick(mine.room) : null,
    };
    socket.emit(TF2_S2C.PONG, pong);
  });
}

export function handleTf2GameDisconnect(io: Server, socket: Socket): void {
  unseat(io, socket, true);
}

/** Test seam: close every room and forget every seat. */
export function resetTf2GameForTests(io: Server): void {
  for (const room of [...rooms.values()]) closeRoom(io, room, 'room-closed', true);
  seats.clear();
}
