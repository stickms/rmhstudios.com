/**
 * RMH TF2 — signaling (and the relay fallback) for peer-to-peer rooms
 * (`tf2:p2p:*`; docs/tf2-game.md "Peer-to-peer play").
 *
 * A P2P room's match runs in its host's browser (a listen server); members
 * connect to it over WebRTC DataChannels. This handler carries no game
 * traffic and never simulates. It:
 *
 *   - announces rooms (code, map, the host's digest for the server browser)
 *     and expires them when the host leaves (after a 30 s grace for a hub
 *     blip — the DataChannels do not need the hub once connected);
 *   - requires a signed-in account for every action, and **vouches** for it:
 *     a join request reaches the host with the hub-verified user id and
 *     account name, so the host never trusts what a peer claims;
 *   - relays offers / answers / ICE candidates only between the host and an
 *     admitted member of the same room, size-capped by schema;
 *   - enforces the host's kicks (a kicked account is refused at the hub too);
 *   - hands every account short-lived TURN credentials with its room (minted
 *     like a call's, lib/call/ice.ts — no static credential anywhere), so a pair
 *     that cannot connect directly tries TURN over UDP before the hub relay;
 *   - relays opaque packets for members whose direct connection failed (a
 *     symmetric NAT, blocked UDP): at most `MAX_PEERS_PER_ROOM` per room and
 *     `BYTES_PER_SEC` per member per direction (p2p/signal.ts). Unreliable
 *     packets past the budget are dropped; reliable ones run a bounded debt,
 *     past which the member is cut off the relay;
 *   - **migrates the host**: the host names a successor (`successor`) and sends
 *     it checkpoints over their DataChannel; when the host leaves (or its hub
 *     connection stays gone for `MIGRATE_GRACE_MS`) the hub makes the successor
 *     the host (`promoted`), tells everyone else (`migrating`) and asks the new
 *     host to admit each of them again — identities still vouched for here;
 *   - keeps the host's lock and password (`tf2:room:admin`) at the door.
 *
 * The hub sees no IP addresses here beyond its own connections; ICE
 * candidates (which carry addresses — WebRTC's nature) pass through it to the
 * one peer they are meant for and are never logged or listed.
 *
 * NOTE: server code imports `lib/` RELATIVELY — server/CLAUDE.md gotcha 7.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { generateRoomCode, sanitizeString } from '../utils';
import { findTf2Map } from '../../../lib/tf2-game/data/maps';
import type { Tf2Mode } from '../../../lib/tf2-game/data/maps';
import {
  TF2_C2S,
  TF2_LIMITS,
  TF2_S2C,
  type BotDifficulty,
  type RoomDetailsPayload,
  type RoomListEntry,
  type Tf2ErrorCode,
} from '../../../lib/tf2-game/net/events';
import {
  decodeRelay,
  encodeRelay,
  P2P_LIMITS,
  P2P_RELAY_LIMITS,
  zP2pAdmit,
  zP2pClose,
  zP2pHost,
  zP2pJoin,
  zP2pKick,
  zP2pRelayStart,
  zP2pSignal,
  zP2pSuccessor,
  zP2pUpdate,
  type P2pAdmittedPayload,
  type P2pCloseReason,
  type P2pHostedPayload,
  type P2pJoinRequest,
  type P2pMigratingPayload,
  type P2pPromotedPayload,
  type P2pRelayReadyPayload,
  type P2pSignalIn,
  type P2pUpdatePayload,
} from '../../../lib/tf2-game/net/p2p/signal';
import { zEmpty } from '../../../lib/tf2-game/net/lobby-schema';
import { buildIceServers } from '../../../lib/call/ice';
import type { IceServerConfig } from '../../../lib/tf2-game/net/p2p/ice';

// ─── Room codes (shared with the dedicated rooms in ./tf2-game.ts) ──────────

const codesInUse = new Set<string>();

/** A code no TF2 room (dedicated or P2P) uses, reserved until released. */
export function claimTf2RoomCode(): string | null {
  for (let i = 0; i < 20; i += 1) {
    const code = generateRoomCode();
    if (!codesInUse.has(code)) {
      codesInUse.add(code);
      return code;
    }
  }
  return null;
}

export function releaseTf2RoomCode(code: string): void {
  codesInUse.delete(code);
}

/** Relayed unreliable packets are dropped while this many frames wait to be written to the receiver. */
const RELAY_UNRELIABLE_BACKLOG = 16;

// ─── State ──────────────────────────────────────────────────────────────────

interface Bucket {
  tokens: number;
  at: number;
}

interface Member {
  peerId: string;
  socketId: string;
  userId: string;
  name: string;
  slot: number;
  admitted: boolean;
  relay: boolean;
  /** May take the match over (host migration); false when the member opted out. */
  canHost: boolean;
  /** Member → host and host → member budgets. */
  up: Bucket;
  down: Bucket;
}

interface P2pRoom {
  code: string;
  token: string;
  hostSocketId: string | null;
  hostUserId: string;
  hostName: string;
  name: string;
  map: string;
  mode: Tf2Mode;
  maxPlayers: number;
  botCount: number;
  botDifficulty: BotDifficulty;
  isPrivate: boolean;
  members: Map<string, Member>;
  kicked: Set<string>;
  update: P2pUpdatePayload | null;
  hostGoneTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
  /** The member the host named to take over if it leaves (a peer id), or null. */
  successor: string | null;
  /** Times the match changed hosts. */
  migrations: number;
  /** The host's lock and password (`tf2:room:admin`): new accounts are refused / asked. */
  locked: boolean;
  password: string;
  /** Accounts that have played here (a rejoin is never asked for the password or refused by the lock). */
  seen: Set<string>;
}

const p2pRooms = new Map<string, P2pRoom>();
/** socket id → the room it hosts. */
const hosting = new Map<string, string>();
/** socket id → the room and member id it joined. */
const membership = new Map<string, { code: string; peerId: string }>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function fail(socket: Socket, code: Tf2ErrorCode, event?: string): void {
  socket.emit(TF2_S2C.ERROR, { code, event });
}

/** The account behind the socket (soft auth: absent for a signed-out visitor). */
export function tf2Account(socket: Socket): { userId: string; name: string } | null {
  const data = socket.data as { userId?: unknown; userName?: unknown };
  const userId = typeof data.userId === 'string' ? data.userId : '';
  if (!userId) return null;
  const name = sanitizeString(typeof data.userName === 'string' ? data.userName : '', 32) || 'Player';
  return { userId, name };
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomId(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALNUM[bytes[i] % ALNUM.length];
  return out;
}

function toSocket(io: Server, socketId: string | null): Socket | undefined {
  return socketId ? io.sockets.sockets.get(socketId) : undefined;
}

function freeSlot(room: P2pRoom): number {
  const used = new Set([...room.members.values()].map((m) => m.slot));
  for (let s = 1; s < 128; s += 1) if (!used.has(s)) return s;
  return 0;
}

function bucket(): Bucket {
  return { tokens: P2P_RELAY_LIMITS.BURST_BYTES, at: Date.now() };
}

/** Refill, then take `bytes`. Unreliable: only if it fits. Reliable: always (a bounded debt). */
function spend(b: Bucket, bytes: number, reliable: boolean): 'ok' | 'drop' | 'overflow' {
  const now = Date.now();
  b.tokens = Math.min(P2P_RELAY_LIMITS.BURST_BYTES, b.tokens + ((now - b.at) / 1000) * P2P_RELAY_LIMITS.BYTES_PER_SEC);
  b.at = now;
  if (!reliable) {
    if (b.tokens < bytes) return 'drop';
    b.tokens -= bytes;
    return 'ok';
  }
  b.tokens -= bytes;
  return b.tokens < -P2P_RELAY_LIMITS.MAX_DEBT_BYTES ? 'overflow' : 'ok';
}

function asBytes(payload: unknown): Uint8Array | null {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (ArrayBuffer.isView(payload)) return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  return null;
}

/** STUN, then TURN with a credential minted for this account (none configured: STUN only). */
export function iceFor(userId: string): IceServerConfig[] {
  return buildIceServers({
    userId,
    now: Date.now(),
    hmacSha1Base64: (secret, message) => createHmac('sha1', secret).update(message).digest('base64'),
  });
}

/** A constant-time comparison of a room password. */
export function samePassword(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

function relayedCount(room: P2pRoom): number {
  let n = 0;
  for (const m of room.members.values()) if (m.relay) n += 1;
  return n;
}

// ─── Room lifecycle ─────────────────────────────────────────────────────────

/** Tell every member the room is gone, release the code, forget the room. */
function closeP2pRoom(io: Server, room: P2pRoom, reason: P2pCloseReason): void {
  if (room.closed) return;
  room.closed = true;
  if (room.hostGoneTimer) clearTimeout(room.hostGoneTimer);
  room.hostGoneTimer = null;
  p2pRooms.delete(room.code);
  releaseTf2RoomCode(room.code);
  if (room.hostSocketId && hosting.get(room.hostSocketId) === room.code) hosting.delete(room.hostSocketId);
  for (const m of room.members.values()) {
    membership.delete(m.socketId);
    toSocket(io, m.socketId)?.emit(TF2_S2C.P2P_CLOSED, { code: room.code, reason });
  }
  room.members.clear();
  logger.info({ event: 'tf2_p2p_room_closed', code: room.code, reason });
}

/** Drop a member: tell it why (when there is a why), and tell the host it went. */
function removeMember(io: Server, room: P2pRoom, member: Member, reason: P2pCloseReason | null): void {
  if (room.members.get(member.peerId) !== member) return;
  room.members.delete(member.peerId);
  if (room.successor === member.peerId) room.successor = null;
  if (membership.get(member.socketId)?.peerId === member.peerId) membership.delete(member.socketId);
  if (reason) toSocket(io, member.socketId)?.emit(TF2_S2C.P2P_CLOSED, { code: room.code, reason });
  toSocket(io, room.hostSocketId)?.emit(TF2_S2C.P2P_PEER_LEFT, { peerId: member.peerId });
}

function leaveMembership(io: Server, socket: Socket): void {
  const where = membership.get(socket.id);
  if (!where) return;
  membership.delete(socket.id);
  const room = p2pRooms.get(where.code);
  const member = room?.members.get(where.peerId);
  if (room && member) removeMember(io, room, member, null);
}

/**
 * Host migration: the named successor becomes the host. It gets the room (a new resume token, its
 * own ICE credentials) and starts the match from the checkpoint the old host sent it; every other
 * member is told and asked for again — the new host sees join requests with the accounts the hub
 * vouches for, as on a first join. False when there is no successor to promote.
 */
function promote(io: Server, room: P2pRoom): boolean {
  const successor = room.successor ? room.members.get(room.successor) : undefined;
  const target = successor ? toSocket(io, successor.socketId) : undefined;
  if (!successor || !successor.admitted || !target || room.closed) return false;
  const previousHost = room.hostName;
  if (room.hostSocketId && hosting.get(room.hostSocketId) === room.code) hosting.delete(room.hostSocketId);
  if (room.hostGoneTimer) clearTimeout(room.hostGoneTimer);
  room.hostGoneTimer = null;
  room.members.delete(successor.peerId);
  membership.delete(successor.socketId);
  room.hostSocketId = successor.socketId;
  room.hostUserId = successor.userId;
  room.hostName = successor.name;
  room.token = randomId(P2P_LIMITS.TOKEN_LENGTH);
  room.successor = null;
  room.migrations += 1;
  hosting.set(successor.socketId, room.code);
  const promoted: P2pPromotedPayload = { hosted: hostedPayload(room, true), previousHost };
  target.emit(TF2_S2C.P2P_PROMOTED, promoted);
  const migrating: P2pMigratingPayload = { code: room.code, host: room.hostName };
  for (const m of room.members.values()) {
    m.admitted = false;
    m.relay = false;
    m.up = bucket();
    m.down = bucket();
    toSocket(io, m.socketId)?.emit(TF2_S2C.P2P_MIGRATING, migrating);
    const request: P2pJoinRequest = { code: room.code, peerId: m.peerId, userId: m.userId, name: m.name, canHost: m.canHost };
    target.emit(TF2_S2C.P2P_JOIN_REQUEST, request);
  }
  logger.info({ event: 'tf2_p2p_host_migrated', code: room.code, migrations: room.migrations, members: room.members.size });
  return true;
}

function stopHosting(io: Server, socket: Socket, reason: P2pCloseReason): void {
  const code = hosting.get(socket.id);
  if (!code) return;
  hosting.delete(socket.id);
  const room = p2pRooms.get(code);
  if (room) closeP2pRoom(io, room, reason);
}

// ─── Browser ────────────────────────────────────────────────────────────────

function entry(room: P2pRoom): RoomListEntry {
  const lock = { locked: room.locked || undefined, passworded: room.password !== '' || undefined };
  const players = room.update ? room.update.players.filter((p) => !p.bot).length : 1 + [...room.members.values()].filter((m) => m.admitted).length;
  const bots = room.update ? room.update.players.filter((p) => p.bot).length : room.botCount;
  return {
    code: room.code,
    name: room.name,
    map: room.map,
    mode: room.mode,
    players,
    bots,
    maxPlayers: room.maxPlayers,
    state: room.update?.state ?? 'loading',
    kind: 'p2p',
    host: room.hostName,
    teamScores: room.update?.teamScores,
    round: room.update?.round ?? null,
    ...lock,
  };
}

/** Public P2P rooms whose host is connected, for `tf2:rooms:list`. */
export function listPublicP2pRooms(): RoomListEntry[] {
  return [...p2pRooms.values()].filter((r) => !r.isPrivate && !r.closed && r.hostSocketId).map(entry);
}

export function isP2pRoom(code: string): boolean {
  return p2pRooms.has(code);
}

/** The details pane for a P2P room (private rooms answer too: their code was shared). */
export function p2pRoomDetails(code: string): RoomDetailsPayload['room'] {
  const room = p2pRooms.get(code);
  if (!room || room.closed) return null;
  return { ...entry(room), roster: room.update?.players ?? [] };
}

// ─── Registration ───────────────────────────────────────────────────────────

export function registerTf2P2pHandlers(io: Server, socket: Socket): void {
  /** Rate limit → account → schema, for every event. */
  const gate = <T>(
    event: string,
    schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
    payload: unknown,
  ): { data: T; account: { userId: string; name: string } } | null => {
    if (!checkRateLimit(socket.id, event)) {
      fail(socket, 'rate-limited', event);
      return null;
    }
    const account = tf2Account(socket);
    if (!account) {
      fail(socket, 'auth-required', event);
      return null;
    }
    const parsed = schema.safeParse(payload ?? {});
    if (!parsed.success) {
      fail(socket, 'bad-payload', event);
      return null;
    }
    return { data: parsed.data, account };
  };

  const hostedRoom = (event: string): P2pRoom | null => {
    const code = hosting.get(socket.id);
    const room = code ? p2pRooms.get(code) : undefined;
    if (!room || room.closed || room.hostSocketId !== socket.id) {
      fail(socket, 'not-host', event);
      return null;
    }
    return room;
  };

  const joined = (event?: string): { room: P2pRoom; member: Member } | null => {
    const where = membership.get(socket.id);
    const room = where ? p2pRooms.get(where.code) : undefined;
    const member = where ? room?.members.get(where.peerId) : undefined;
    if (!room || !member || room.closed) {
      if (event) fail(socket, 'not-in-room', event);
      return null;
    }
    return { room, member };
  };

  socket.on(TF2_C2S.P2P_HOST, (payload: unknown) => {
    const g = gate(TF2_C2S.P2P_HOST, zP2pHost, payload);
    if (!g) return;
    const { data, account } = g;

    if (data.resume) {
      // The host's socket reconnected: reclaim the room (same account, the secret it was given).
      const room = p2pRooms.get(data.resume.code);
      if (!room || room.closed || room.token !== data.resume.token || room.hostUserId !== account.userId) {
        fail(socket, 'no-such-room', TF2_C2S.P2P_HOST);
        return;
      }
      if (room.hostSocketId && room.hostSocketId !== socket.id) hosting.delete(room.hostSocketId);
      room.hostSocketId = socket.id;
      hosting.set(socket.id, room.code);
      if (room.hostGoneTimer) clearTimeout(room.hostGoneTimer);
      room.hostGoneTimer = null;
      socket.emit(TF2_S2C.P2P_HOSTED, hostedPayload(room, true));
      return;
    }

    const map = findTf2Map(data.map);
    if (!map) {
      fail(socket, 'unknown-map', TF2_C2S.P2P_HOST);
      return;
    }
    if (data.mode && data.mode !== map.mode) {
      fail(socket, 'bad-mode', TF2_C2S.P2P_HOST);
      return;
    }
    if (p2pRooms.size >= P2P_LIMITS.MAX_ROOMS) {
      fail(socket, 'capacity', TF2_C2S.P2P_HOST);
      return;
    }
    stopHosting(io, socket, 'host-closed');
    leaveMembership(io, socket);
    const code = claimTf2RoomCode();
    if (!code) {
      fail(socket, 'capacity', TF2_C2S.P2P_HOST);
      return;
    }
    const room: P2pRoom = {
      code,
      token: randomId(P2P_LIMITS.TOKEN_LENGTH),
      hostSocketId: socket.id,
      hostUserId: account.userId,
      hostName: account.name,
      name: sanitizeString(data.name, TF2_LIMITS.ROOM_NAME_MAX_LENGTH) || map.title,
      map: map.name,
      mode: map.mode,
      maxPlayers: data.maxPlayers,
      botCount: Math.min(data.botCount, data.maxPlayers - 1),
      botDifficulty: data.botDifficulty,
      isPrivate: data.private === true,
      members: new Map(),
      kicked: new Set(),
      update: null,
      hostGoneTimer: null,
      closed: false,
      successor: null,
      migrations: 0,
      locked: false,
      password: '',
      seen: new Set([account.userId]),
    };
    p2pRooms.set(code, room);
    hosting.set(socket.id, code);
    logger.info({ event: 'tf2_p2p_room_hosted', code, map: map.name, maxPlayers: room.maxPlayers });
    socket.emit(TF2_S2C.P2P_HOSTED, hostedPayload(room, false));
  });

  socket.on(TF2_C2S.P2P_UPDATE, (payload: unknown) => {
    const g = gate(TF2_C2S.P2P_UPDATE, zP2pUpdate, payload);
    if (!g) return;
    const room = hostedRoom(TF2_C2S.P2P_UPDATE);
    if (!room) return;
    // The host changed level: the browser lists the room on its new map (published maps only).
    const moved = g.data.map ? findTf2Map(g.data.map) : null;
    if (moved && moved.name !== room.map) {
      logger.info({ event: 'tf2_p2p_level_changed', code: room.code, from: room.map, to: moved.name });
      room.map = moved.name;
      room.mode = moved.mode;
    }
    room.update = {
      state: g.data.state,
      players: g.data.players.map((p) => ({ ...p, name: sanitizeString(p.name, 32) || 'Player' })),
      teamScores: g.data.teamScores,
      round: g.data.round ? { state: sanitizeString(g.data.round.state, 32), timeLeft: g.data.round.timeLeft } : null,
    };
  });

  socket.on(TF2_C2S.P2P_CLOSE, (payload: unknown) => {
    const g = gate(TF2_C2S.P2P_CLOSE, zP2pClose, payload);
    if (!g) return;
    const room = hostedRoom(TF2_C2S.P2P_CLOSE);
    if (!room) return;
    // Leaving with a successor named: the match goes on in its browser.
    if (g.data.migrate && promote(io, room)) return;
    stopHosting(io, socket, 'host-closed');
  });

  socket.on(TF2_C2S.P2P_SUCCESSOR, (payload: unknown) => {
    const g = gate(TF2_C2S.P2P_SUCCESSOR, zP2pSuccessor, payload);
    if (!g) return;
    const room = hostedRoom(TF2_C2S.P2P_SUCCESSOR);
    if (!room) return;
    const peer = g.data.peerId;
    const member = peer ? room.members.get(peer) : undefined;
    if (peer && (!member || !member.admitted || !member.canHost)) {
      fail(socket, 'not-in-room', TF2_C2S.P2P_SUCCESSOR);
      return;
    }
    room.successor = peer;
  });

  socket.on(TF2_C2S.P2P_JOIN, (payload: unknown) => {
    const g = gate(TF2_C2S.P2P_JOIN, zP2pJoin, payload);
    if (!g) return;
    const { data, account } = g;
    const room = p2pRooms.get(data.code);
    // A room whose host just went, with a successor named, is about to move: a member asking again
    // (its link to the old host died) waits in it, and the new host is asked for it on promotion.
    if (!room || room.closed || (!room.hostSocketId && !room.successor)) {
      fail(socket, 'no-such-room', TF2_C2S.P2P_JOIN);
      return;
    }
    if (room.kicked.has(account.userId)) {
      fail(socket, 'kicked', TF2_C2S.P2P_JOIN);
      return;
    }
    // The host's lock and password keep new accounts out; anyone who played here rejoins freely.
    if (!room.seen.has(account.userId)) {
      if (room.locked) {
        fail(socket, 'locked', TF2_C2S.P2P_JOIN);
        return;
      }
      if (room.password && !samePassword(data.password ?? '', room.password)) {
        fail(socket, 'password', TF2_C2S.P2P_JOIN);
        return;
      }
    }
    if (room.hostUserId === account.userId || hosting.has(socket.id)) {
      fail(socket, 'bad-payload', TF2_C2S.P2P_JOIN);
      return;
    }
    leaveMembership(io, socket);
    // The same account from another socket (a rejoin, a second tab): the old membership goes.
    for (const m of [...room.members.values()]) if (m.userId === account.userId) removeMember(io, room, m, null);
    if (room.members.size >= Math.min(P2P_LIMITS.MAX_MEMBERS, room.maxPlayers - 1)) {
      fail(socket, 'room-full', TF2_C2S.P2P_JOIN);
      return;
    }
    const slot = freeSlot(room);
    if (!slot) {
      fail(socket, 'room-full', TF2_C2S.P2P_JOIN);
      return;
    }
    const member: Member = {
      peerId: randomId(P2P_LIMITS.PEER_ID_LENGTH),
      socketId: socket.id,
      userId: account.userId,
      name: account.name,
      slot,
      admitted: false,
      relay: false,
      canHost: data.canHost !== false,
      up: bucket(),
      down: bucket(),
    };
    room.members.set(member.peerId, member);
    membership.set(socket.id, { code: room.code, peerId: member.peerId });
    const request: P2pJoinRequest = {
      code: room.code,
      peerId: member.peerId,
      userId: account.userId,
      name: account.name,
      spectate: data.spectate === true,
      canHost: member.canHost,
    };
    if (room.hostSocketId) toSocket(io, room.hostSocketId)?.emit(TF2_S2C.P2P_JOIN_REQUEST, request);
  });

  socket.on(TF2_C2S.P2P_LEAVE, (payload: unknown) => {
    if (!gate(TF2_C2S.P2P_LEAVE, zEmpty, payload)) return;
    leaveMembership(io, socket);
  });

  socket.on(TF2_C2S.P2P_ADMIT, (payload: unknown) => {
    const g = gate(TF2_C2S.P2P_ADMIT, zP2pAdmit, payload);
    if (!g) return;
    const room = hostedRoom(TF2_C2S.P2P_ADMIT);
    if (!room) return;
    const member = room.members.get(g.data.peerId);
    if (!member) return;
    if (!g.data.accept) {
      if (g.data.reason === 'kicked') room.kicked.add(member.userId);
      removeMember(io, room, member, g.data.reason ?? 'refused');
      return;
    }
    member.admitted = true;
    room.seen.add(member.userId);
    const admitted: P2pAdmittedPayload = {
      code: room.code,
      peerId: member.peerId,
      host: room.hostName,
      map: room.map,
      mode: room.mode,
      name: room.name,
      maxPlayers: room.maxPlayers,
      ice: iceFor(member.userId),
    };
    toSocket(io, member.socketId)?.emit(TF2_S2C.P2P_ADMITTED, admitted);
  });

  socket.on(TF2_C2S.P2P_KICK, (payload: unknown) => {
    const g = gate(TF2_C2S.P2P_KICK, zP2pKick, payload);
    if (!g) return;
    const room = hostedRoom(TF2_C2S.P2P_KICK);
    if (!room) return;
    const member = room.members.get(g.data.peerId);
    if (!member) return;
    room.kicked.add(member.userId);
    removeMember(io, room, member, 'kicked');
  });

  socket.on(TF2_C2S.P2P_SIGNAL, (payload: unknown) => {
    const g = gate(TF2_C2S.P2P_SIGNAL, zP2pSignal, payload);
    if (!g) return;
    const { to, description, candidate } = g.data;
    const body = description !== undefined ? { description } : { candidate };
    const hostedCode = hosting.get(socket.id);
    if (hostedCode) {
      const room = p2pRooms.get(hostedCode);
      const member = to ? room?.members.get(to) : undefined;
      if (!room || !member || !member.admitted) {
        fail(socket, 'not-in-room', TF2_C2S.P2P_SIGNAL);
        return;
      }
      const out: P2pSignalIn = { code: room.code, from: 'host', ...body };
      toSocket(io, member.socketId)?.emit(TF2_S2C.P2P_SIGNAL, out);
      return;
    }
    const mine = joined(TF2_C2S.P2P_SIGNAL);
    if (!mine) return;
    if (to !== undefined || !mine.member.admitted) {
      fail(socket, 'bad-payload', TF2_C2S.P2P_SIGNAL);
      return;
    }
    const out: P2pSignalIn = { code: mine.room.code, from: mine.member.peerId, ...body };
    toSocket(io, mine.room.hostSocketId)?.emit(TF2_S2C.P2P_SIGNAL, out);
  });

  socket.on(TF2_C2S.P2P_RELAY_START, (payload: unknown) => {
    const g = gate(TF2_C2S.P2P_RELAY_START, zP2pRelayStart, payload);
    if (!g) return;
    let room: P2pRoom | undefined;
    let member: Member | undefined;
    const hostedCode = hosting.get(socket.id);
    if (hostedCode) {
      room = p2pRooms.get(hostedCode);
      member = g.data.peerId ? room?.members.get(g.data.peerId) : undefined;
    } else {
      const mine = joined();
      room = mine?.room;
      member = mine?.member;
    }
    if (!room || !member || !member.admitted) {
      fail(socket, 'not-in-room', TF2_C2S.P2P_RELAY_START);
      return;
    }
    if (!member.relay) {
      if (relayedCount(room) >= P2P_RELAY_LIMITS.MAX_PEERS_PER_ROOM) {
        fail(socket, 'relay-full', TF2_C2S.P2P_RELAY_START);
        return;
      }
      member.relay = true;
      member.up = bucket();
      member.down = bucket();
      logger.info({ event: 'tf2_p2p_relay_start', code: room.code, relayed: relayedCount(room) });
    }
    const ready: P2pRelayReadyPayload = { code: room.code, peerId: member.peerId, slot: member.slot };
    toSocket(io, room.hostSocketId)?.emit(TF2_S2C.P2P_RELAY_READY, ready);
    toSocket(io, member.socketId)?.emit(TF2_S2C.P2P_RELAY_READY, ready);
  });

  /** The relay hot path: silent drops only (an error per packet would double a flood). */
  socket.on(TF2_C2S.P2P_RELAY, (payload: unknown) => {
    if (!checkRateLimit(socket.id, TF2_C2S.P2P_RELAY)) return;
    const bytes = asBytes(payload);
    if (!bytes || bytes.byteLength > P2P_RELAY_LIMITS.MAX_PACKET_BYTES) return;
    const packet = decodeRelay(bytes);
    if (!packet) return;
    if (!packet.reliable && packet.payload.byteLength > P2P_RELAY_LIMITS.MAX_UNRELIABLE_BYTES) return;
    const hostedCode = hosting.get(socket.id);
    let room: P2pRoom | undefined;
    let member: Member | undefined;
    let toHost: boolean;
    if (hostedCode) {
      room = p2pRooms.get(hostedCode);
      member = room ? [...room.members.values()].find((m) => m.slot === packet.slot) : undefined;
      toHost = false;
    } else {
      const mine = joined();
      room = mine?.room;
      member = mine?.member;
      toHost = true;
    }
    if (!room || !member || !member.relay || room.closed) return;
    const verdict = spend(toHost ? member.up : member.down, packet.payload.byteLength, packet.reliable);
    if (verdict === 'drop') return;
    if (verdict === 'overflow') {
      logger.warn({ event: 'tf2_p2p_relay_overflow', code: room.code });
      removeMember(io, room, member, 'relay-overflow');
      return;
    }
    const target = toSocket(io, toHost ? room.hostSocketId : member.socketId);
    if (!target) return;
    const out = encodeRelay(member.slot, packet.reliable, packet.payload);
    if (packet.reliable) {
      target.emit(TF2_S2C.P2P_RELAY, out);
      return;
    }
    // Unreliable: dropped when the receiver is backed up. Not socket.io's `volatile`, which
    // also drops whatever arrives while the previous frame is still being written — the
    // snapshot right behind its tick's reliable batch, every time.
    const backlog = (target as unknown as { conn?: { writeBuffer?: unknown[] } }).conn?.writeBuffer?.length;
    if (backlog === undefined) target.volatile.emit(TF2_S2C.P2P_RELAY, out);
    else if (backlog <= RELAY_UNRELIABLE_BACKLOG) target.emit(TF2_S2C.P2P_RELAY, out);
  });
}

function hostedPayload(room: P2pRoom, resumed: boolean): P2pHostedPayload {
  return {
    code: room.code,
    token: room.token,
    hostName: room.hostName,
    hostUserId: room.hostUserId,
    resumed,
    relay: { maxPeers: P2P_RELAY_LIMITS.MAX_PEERS_PER_ROOM, bytesPerSec: P2P_RELAY_LIMITS.BYTES_PER_SEC },
    ice: iceFor(room.hostUserId),
  };
}

/**
 * A peer-to-peer host's door (`tf2:room:admin` from the socket hosting the room): lock it, set or
 * clear its password. True when the socket hosts a room (handled, or refused); false otherwise.
 */
export function p2pRoomAdmin(socket: Socket, action: { action: string; locked?: boolean; password?: string }): boolean {
  const code = hosting.get(socket.id);
  const room = code ? p2pRooms.get(code) : undefined;
  if (!room || room.closed || room.hostSocketId !== socket.id) return false;
  if (action.action === 'lock') room.locked = action.locked === true;
  else if (action.action === 'password') room.password = sanitizeString(action.password ?? '', P2P_LIMITS.PASSWORD_MAX_LENGTH);
  else {
    // Kicks, the map and messages are the host's own (its match runs in its browser).
    fail(socket, 'bad-payload', TF2_C2S.ROOM_ADMIN);
    return true;
  }
  logger.info({ event: 'tf2_p2p_room_admin', code: room.code, action: action.action, value: action.action === 'lock' ? room.locked : room.password ? 'set' : 'cleared' });
  return true;
}

export function handleTf2P2pDisconnect(io: Server, socket: Socket): void {
  leaveMembership(io, socket);
  const code = hosting.get(socket.id);
  if (!code) return;
  hosting.delete(socket.id);
  const room = p2pRooms.get(code);
  if (!room || room.closed) return;
  // The DataChannels may well be fine; give the host's socket the grace to come back. With a successor
  // named, a short one: then the match moves to it (a closed tab never comes back).
  room.hostSocketId = null;
  const grace = room.successor ? P2P_LIMITS.MIGRATE_GRACE_MS : P2P_LIMITS.HOST_GRACE_MS;
  room.hostGoneTimer = setTimeout(() => {
    room.hostGoneTimer = null;
    if (room.hostSocketId) return;
    if (!promote(io, room)) closeP2pRoom(io, room, 'host-left');
  }, grace);
  room.hostGoneTimer.unref?.();
}

/** Test seam: forget every P2P room. */
export function resetTf2P2pForTests(io: Server): void {
  for (const room of [...p2pRooms.values()]) closeP2pRoom(io, room, 'host-closed');
  hosting.clear();
  membership.clear();
  codesInUse.clear();
}
