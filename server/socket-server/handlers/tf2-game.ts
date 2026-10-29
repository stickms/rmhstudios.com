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
 *   - closes rooms whose match failed, crashed, or emptied;
 *   - lists rooms for the server browser — these and the peer-to-peer rooms
 *     whose signaling lives in ./tf2-p2p.ts — and answers its details pane;
 *   - gives every room an **owner** — the account that created it; the owner
 *     can hand it on, and when the owner leaves the oldest remaining signed-in
 *     player inherits it — who administers the room (`tf2:room:admin`): kick
 *     (refused for the room's life), change the map (allowlisted), lock it,
 *     set a password, say something as the server; and, through the console
 *     (`tf2:extra` to the match), the match settings (mp_timelimit,
 *     mp_winlimit, tf_bot_quota, tf_bot_difficulty). Every admin action is
 *     checked here and logged; cheats stay off in a dedicated room whoever owns it.
 *
 * **Multiplayer needs an account.** The hub's auth is soft (anyone may
 * connect and browse), but creating, joining and playing in a room is refused
 * with `auth-required` for a socket without a verified session, and a player
 * is named by their account. Offline play against bots never reaches the hub.
 *
 * NOTE: server code imports `lib/` RELATIVELY — server/CLAUDE.md gotcha 7.
 */

import type { Server, Socket } from 'socket.io';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { sanitizeString, sanitizeUserName } from '../utils';
import {
  claimTf2RoomCode,
  isP2pRoom,
  listPublicP2pRooms,
  p2pRoomAdmin,
  p2pRoomDetails,
  releaseTf2RoomCode,
  samePassword,
  tf2Account,
} from './tf2-p2p';
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
  type RoomDetailsPayload,
  type RoomInfoPayload,
  type RoomListEntry,
  type RoomsPayload,
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
  zListRooms,
  zLoadout,
  zRoomAdmin,
  zRoomDetails,
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
import { startItemCatalogFeed } from '../../../lib/tf2-game/server/item-catalog.server';
import { getPrismaClient } from '../prisma-client';

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
  /** The owner (an account; its player id while in the room) — administers the room. */
  ownerUserId: string | null;
  ownerPlayerId: number | null;
  /** The owner's door: no new accounts / a password for new accounts. */
  locked: boolean;
  password: string;
  /** Accounts kicked by the owner (refused for the room's life) and those who played here. */
  banned: Set<string>;
  seen: Set<string>;
}

const rooms = new Map<string, Tf2Room>();

/**
 * The item schema for the matches (items beyond stock, equip checks): the loadout catalog the web
 * tier stores, watched from the first room on and handed to the match pool (docs/tf2-game.md
 * "Items and loadouts"). Not without a database (tests, the echo host).
 */
let stopItemCatalogFeed: (() => void) | null = null;
function ensureItemCatalogFeed(): void {
  if (stopItemCatalogFeed || !process.env.DATABASE_URL || process.env.TF2_MATCH_HOST === 'echo') return;
  try {
    const pool = getMatchPool(logger);
    stopItemCatalogFeed = startItemCatalogFeed(getPrismaClient(), (catalog) => pool.setItemCatalog(catalog), logger);
  } catch (error) {
    logger.warn({ event: 'tf2_item_catalog_unavailable', error: error instanceof Error ? error.message : String(error) });
  }
}
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
    kind: 'dedicated',
    teamScores: room.summary?.teamScores,
    round: room.summary?.round ?? null,
    locked: room.locked || undefined,
    passworded: room.password !== '' || undefined,
  };
}

/** Every public room, dedicated and peer-to-peer, busiest first. */
function allPublicRooms(): RoomListEntry[] {
  return [
    ...[...rooms.values()].filter((room) => !room.isPrivate && !room.closed).map(listEntry),
    ...listPublicP2pRooms(),
  ].sort((a, b) => b.players - a.players || a.code.localeCompare(b.code));
}

/** One page of the server browser (`BROWSE_CAP` rooms from `offset`). Never an address. */
export function listPublicTf2Rooms(offset = 0): RoomsPayload {
  const all = allPublicRooms();
  const start = Math.max(0, Math.min(offset, all.length));
  return { rooms: all.slice(start, start + TF2_LIMITS.BROWSE_CAP), total: all.length, offset: start };
}

function roomDetails(code: string): RoomDetailsPayload {
  const room = rooms.get(code);
  if (room && !room.closed) {
    const roster = (room.summary?.players ?? []).map((p) => ({ name: p.name, team: p.team, cls: p.cls, score: p.score, bot: p.bot }));
    return { code, room: { ...listEntry(room), roster } };
  }
  return { code, room: p2pRoomDetails(code) };
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
  releaseTf2RoomCode(room.code);
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

function seat(io: Server, socket: Socket, room: Tf2Room, requestedName: unknown, spectate = false): void {
  const { name, userId } = displayName(socket, requestedName);
  const playerId = room.nextPlayerId++;
  room.players.set(playerId, { playerId, socketId: socket.id, name, userId });
  seats.set(socket.id, { code: room.code, playerId });
  if (userId) room.seen.add(userId);
  socket.join(channel(room.code));
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
  // The joining choice (spectate) rides the join itself: the match seats them with the spectators.
  room.handle.addPlayer(playerId, { name, ...(userId ? { userId } : {}), ...(spectate ? { spectate: true } : {}) });
  // The owner, back in the room (or arriving first), administers it again.
  if (userId && userId === room.ownerUserId) setOwner(io, room, playerId);
  else broadcastInfo(io, room);
  // A loading room sends `joined` to everyone when its map is in (onReady).
  if (room.state === 'running') socket.emit(TF2_S2C.JOINED, joinedPayload(room, playerId));
}

function roomInfo(room: Tf2Room): RoomInfoPayload {
  const owner = room.ownerPlayerId !== null ? room.players.get(room.ownerPlayerId) : undefined;
  return {
    code: room.code,
    ownerId: owner ? owner.playerId : null,
    ownerName: owner ? owner.name : null,
    locked: room.locked,
    passworded: room.password !== '',
    players: [...room.players.values()].map((p) => ({ id: p.playerId, name: p.name, account: !!p.userId })),
  };
}

/** Everyone in the room hears its administration again (someone joined or left, the owner changed something). */
function broadcastInfo(io: Server, room: Tf2Room): void {
  io.to(channel(room.code)).emit(TF2_S2C.ROOM_INFO, roomInfo(room));
}

/** The room's owner is now this player (or nobody): the match lets them change its settings; everyone hears. */
function setOwner(io: Server, room: Tf2Room, playerId: number | null): void {
  const player = playerId !== null ? room.players.get(playerId) : undefined;
  room.ownerPlayerId = player ? player.playerId : null;
  if (player?.userId) room.ownerUserId = player.userId;
  room.handle.setOwner(room.ownerPlayerId);
  io.to(channel(room.code)).emit(TF2_S2C.ROOM_INFO, roomInfo(room));
}

/** The owner left: the oldest remaining signed-in player inherits the room (nobody: it waits for them). */
function passOwnership(io: Server, room: Tf2Room): void {
  let heir: Tf2Player | null = null;
  for (const p of room.players.values()) {
    if (p.userId && (!heir || p.playerId < heir.playerId)) heir = p;
  }
  if (heir) {
    room.ownerUserId = heir.userId;
    logger.info({ event: 'tf2_room_owner', code: room.code, reason: 'owner-left', owner: heir.userId });
  }
  setOwner(io, room, heir ? heir.playerId : null);
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
  if (room.ownerPlayerId === where.playerId) passOwnership(io, room);
  else if (room.players.size > 0) broadcastInfo(io, room);

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


// ─── Registration ───────────────────────────────────────────────────────────

export function registerTf2GameHandlers(io: Server, socket: Socket): void {
  /**
   * Rate limit → account (multiplayer actions) → schema. Every control-plane
   * event, every time. Browsing (`list`, `details`) and clock sync stay open.
   */
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
    const data = gate(TF2_C2S.LIST_ROOMS, zListRooms, payload, false);
    if (data === null) return;
    socket.emit(TF2_S2C.ROOMS, listPublicTf2Rooms(data.offset ?? 0));
  });

  socket.on(TF2_C2S.ROOM_DETAILS, (payload: unknown) => {
    const data = gate(TF2_C2S.ROOM_DETAILS, zRoomDetails, payload, false);
    if (data === null) return;
    socket.emit(TF2_S2C.ROOM_DETAILS, roomDetails(data.code));
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
    const code = claimTf2RoomCode();
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

    ensureItemCatalogFeed();
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
          // A level change: the browser lists the room on its new map.
          if (summary.map !== room.map) {
            const next = findTf2Map(summary.map);
            if (next) {
              logger.info({ event: 'tf2_room_level_changed', code: room.code, from: room.map, to: next.name });
              room.map = next.name;
              room.mode = next.mode;
            }
          }
        },
        onClosed: (reason) => {
          if (room) closeRoom(io, room, KICK_REASON[reason], false);
        },
      },
    );
    if (!result.ok) {
      releaseTf2RoomCode(code);
      fail(socket, result.error, TF2_C2S.CREATE_ROOM);
      return;
    }

    const creator = tf2Account(socket);
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
      ownerUserId: creator?.userId ?? null,
      ownerPlayerId: null,
      locked: false,
      password: '',
      banned: new Set(),
      seen: new Set(),
    };
    room = created;
    rooms.set(code, created);
    created.loadTimer = setTimeout(() => {
      created.loadTimer = null;
      if (created.state === 'loading') closeRoom(io, created, 'map-failed', true);
    }, MATCH_LOAD_TIMEOUT_MS);
    created.loadTimer.unref?.();

    logger.info({ event: 'tf2_room_created', code, map: map.name, maxPlayers, botCount, owner: creator?.userId ?? null });
    seat(io, socket, created, data.playerName);
  });

  socket.on(TF2_C2S.JOIN_ROOM, (payload: unknown) => {
    const data = gate(TF2_C2S.JOIN_ROOM, zJoinRoom, payload);
    if (!data) return;
    const room = rooms.get(data.code);
    if (!room || room.closed) {
      // A peer-to-peer room joins over WebRTC (`tf2:p2p:join`); the client switches paths.
      fail(socket, isP2pRoom(data.code) ? 'p2p-room' : 'no-such-room', TF2_C2S.JOIN_ROOM);
      return;
    }
    const current = seats.get(socket.id);
    if (current?.code === room.code) {
      // Already here (a duplicate join after a reconnect race): just restate it.
      if (room.state === 'running') socket.emit(TF2_S2C.JOINED, joinedPayload(room, current.playerId));
      return;
    }
    const account = tf2Account(socket);
    if (account && room.banned.has(account.userId)) {
      fail(socket, 'kicked', TF2_C2S.JOIN_ROOM);
      return;
    }
    // The owner's lock and password keep new accounts out; anyone who played here rejoins freely.
    if (!account || !room.seen.has(account.userId)) {
      if (room.locked) {
        fail(socket, 'locked', TF2_C2S.JOIN_ROOM);
        return;
      }
      if (room.password && !samePassword(data.password ?? '', room.password)) {
        fail(socket, 'password', TF2_C2S.JOIN_ROOM);
        return;
      }
    }
    if (room.players.size >= room.maxPlayers) {
      fail(socket, 'room-full', TF2_C2S.JOIN_ROOM);
      return;
    }
    unseat(io, socket, false);
    seat(io, socket, room, data.playerName, data.spectate === true);
  });

  /**
   * Room administration: the owner of a dedicated room (or a peer-to-peer host, for its door). Every
   * action is checked here — who asks, the target, the map against the allowlist — and logged.
   */
  socket.on(TF2_C2S.ROOM_ADMIN, (payload: unknown) => {
    const data = gate(TF2_C2S.ROOM_ADMIN, zRoomAdmin, payload);
    if (!data) return;
    if (p2pRoomAdmin(socket, data)) return;
    const mine = myRoom(TF2_C2S.ROOM_ADMIN);
    if (!mine) return;
    const { room, playerId } = mine;
    const by = room.players.get(playerId);
    if (room.ownerPlayerId !== playerId || !by?.userId) {
      fail(socket, 'not-owner', TF2_C2S.ROOM_ADMIN);
      return;
    }
    const log = (extra: Record<string, unknown>) =>
      logger.info({ event: 'tf2_room_admin', code: room.code, action: data.action, by: by.userId, ...extra });
    switch (data.action) {
      case 'kick': {
        const target = room.players.get(data.playerId);
        if (!target || target.playerId === playerId) {
          fail(socket, 'bad-payload', TF2_C2S.ROOM_ADMIN);
          return;
        }
        if (target.userId) room.banned.add(target.userId);
        const ts = io.sockets.sockets.get(target.socketId);
        log({ target: target.userId ?? target.name });
        if (ts) {
          unseat(io, ts, false);
          ts.emit(TF2_S2C.KICKED, { code: room.code, reason: 'kicked' });
        }
        return;
      }
      case 'transfer': {
        const target = room.players.get(data.playerId);
        if (!target || !target.userId || target.playerId === playerId) {
          fail(socket, 'bad-payload', TF2_C2S.ROOM_ADMIN);
          return;
        }
        room.ownerUserId = target.userId;
        log({ target: target.userId });
        setOwner(io, room, target.playerId);
        return;
      }
      case 'changelevel': {
        const map = findTf2Map(data.map);
        if (!map) {
          fail(socket, 'unknown-map', TF2_C2S.ROOM_ADMIN);
          return;
        }
        log({ map: map.name });
        room.handle.changeLevel(map.name);
        return;
      }
      case 'lock':
        room.locked = data.locked;
        log({ locked: room.locked });
        io.to(channel(room.code)).emit(TF2_S2C.ROOM_INFO, roomInfo(room));
        return;
      case 'password':
        room.password = sanitizeString(data.password, 32);
        // Never the password itself in a log line.
        log({ password: room.password ? 'set' : 'cleared' });
        io.to(channel(room.code)).emit(TF2_S2C.ROOM_INFO, roomInfo(room));
        return;
      case 'say': {
        const text = cleanChat(data.text);
        if (!text) return;
        log({ length: text.length });
        const message: ChatMessage = { from: 0, name: 'Console', text, teamOnly: false, team: TEAM_UNASSIGNED, at: Date.now() };
        io.to(channel(room.code)).emit(TF2_S2C.CHAT, message);
        return;
      }
    }
  });

  socket.on(TF2_C2S.LEAVE, (payload: unknown) => {
    if (gate(TF2_C2S.LEAVE, zEmpty, payload, false) === null) return;
    unseat(io, socket, false);
  });

  /**
   * The hot path: opaque bytes for the match. Silent drops only — answering a
   * flood with an error per packet would double it.
   */
  socket.on(TF2_C2S.INPUT, (payload: unknown) => {
    if (!checkRateLimit(socket.id, TF2_C2S.INPUT)) return;
    if (!tf2Account(socket)) return;
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
    if (!data) return;
    // The owner's match settings (the console checks the owner again in the match): an audit line.
    const mine = myRoom();
    if (mine && mine.room.ownerPlayerId === mine.playerId && data.args.length > 0 && /^(mp_|tf_bot_)/.test(data.command)) {
      logger.info({ event: 'tf2_room_admin', code: mine.room.code, action: data.command, by: tf2Account(socket)?.userId ?? null, value: String(data.args[0]).slice(0, 32) });
    }
    forward(TF2_C2S.EXTRA, { kind: 'extra', command: data.command, args: data.args });
  });

  socket.on(TF2_C2S.LOADOUT, (payload: unknown) => {
    const data = gate(TF2_C2S.LOADOUT, zLoadout, payload);
    if (data) forward(TF2_C2S.LOADOUT, { kind: 'loadout', cls: data.cls, slots: data.slots });
  });

  socket.on(TF2_C2S.PING, (payload: unknown) => {
    const data = gate(TF2_C2S.PING, zPing, payload, false);
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
