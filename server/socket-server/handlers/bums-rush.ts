/**
 * Bum's Rush — room manager + validating relay (design doc §9).
 *
 * **This file never simulates anything, and it never will.** The hub runs ~18
 * games in ONE Node process; a 60 Hz matter-js world per room converts it from
 * I/O-bound to CPU-bound and takes Slice It, RMHType and the casino tables down
 * with it. So one CLIENT per room is authoritative (§9.1) and this handler
 * does four jobs and no others: it owns rooms and seats, it matchmakes, it
 * relays two opaque binary payloads, and it bound-checks the results the host
 * reports. There is no physics import below, and adding one would be a
 * platform-architecture regression rather than a feature.
 *
 * "Relay" is not the same as "dumb relay", and the difference is one check:
 *
 *   • `br:snapshot` is accepted ONLY from the room's current host, and
 *     broadcast ONLY to that room. Without it, any guest can puppet the room.
 *   • `br:input` is accepted only for seats the sender actually owns, and is
 *     forwarded ONLY to the host — nobody else has a use for it.
 *
 * Everything else here exists to make §9.7's "seamless" true: Quick Play seats
 * you and starts the level in the same tick, a joiner is sketched into a level
 * already running, and a dropped player's seats are held for 90 seconds with
 * their characters frozen as statues rather than ragdolls.
 *
 * NOTE: server code imports `lib/` RELATIVELY — `@/lib/...` resolves locally
 * and then ships a bundle that throws `MODULE_NOT_FOUND` on boot (see
 * server/CLAUDE.md §Gotchas 7).
 */

import type { Server, Socket } from 'socket.io';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { generateRoomCode, sanitizeUserName } from '../utils';
import {
  registerPartyGame,
  verifyPartyTicket,
  type PartyMember,
  type PartyTicket,
} from '../party-contract';
import { BR_C2S, BR_S2C, DEFAULT_ASSISTS, DEFAULT_COSMETICS, NET, NET_LIMITS } from '../../../lib/bums-rush/constants';
import { isValidCosmetics } from '../../../lib/bums-rush/cosmetics';
import type {
  Assists,
  Cosmetics,
  RoomMode,
  RoomView,
  SeatIndex,
  SeatView,
  ShowdownRoundKind,
} from '../../../lib/bums-rush/types';
import {
  zClaimSeat,
  zCreateRoom,
  zEmote,
  zEventMsg,
  zHostHandoff,
  zJoinRoom,
  zListRooms,
  zPing,
  zQuickPlay,
  zReady,
  zReleaseSeat,
  zResultMsg,
  zSelectLevel,
  zSetAssists,
  zSetCosmetics,
  zStart,
  verifyResult,
  type BrErrorCode,
  type DeviceKind,
  type ResultAckMsg,
  type RoomListEntry,
} from '../../../lib/bums-rush/net/protocol';
import {
  binaryCopy,
  isKeyframe,
  peekSnapshotHeader,
  type BinarySource,
} from '../../../lib/bums-rush/net/snapshot';
import { decodeInputSeats } from '../../../lib/bums-rush/net/input';
import { RttWindow, electHost, type HostCandidate } from '../../../lib/bums-rush/net/migration';

// ─── Constants ──────────────────────────────────────────────────────────────

const GAME_ID = 'bums-rush';
const ROOM_PREFIX = 'br:';

/** Bounded like every other hub map — a room map nobody caps is a memory leak. */
const MAX_ROOMS = 2_000;
const GC_INTERVAL_MS = 15_000;
/** A room nobody has touched in half an hour is not a room. */
const ROOM_IDLE_TIMEOUT_MS = 30 * 60_000;
const BROWSE_CAP = 30;

/**
 * Where Quick Play drops you when the client did not name a level.
 *
 * The client always should — it knows the player's progress — so this is the
 * floor rather than the policy, and world 1 level 1 is the only level every
 * player is guaranteed to have seen.
 */
const DEFAULT_LEVEL_ID = 'w1-01';

/** §8.4 — ranked Showdown runs with assists off for everybody. */
const RANKED_ASSISTS: Assists = {
  grabAssist: false,
  stickyGrip: false,
  analogTriggers: true,
  autoGrab: false,
  slowMo: false,
  extraCheckpoints: false,
  noFallDamage: false,
  aimSmoothing: 0,
  oneHanded: false,
};

// ─── Types ──────────────────────────────────────────────────────────────────

type Phase = RoomView['phase'];

interface BRSeat {
  seat: SeatIndex;
  /** Current owning socket. Changes on reconnect — `clientKey` is what persists. */
  socketId: string;
  clientKey: string;
  userId: string | null;
  name: string;
  localIndex: number;
  cosmetics: Cosmetics;
  assists: Assists;
  ready: boolean;
  connected: boolean;
  /** Epoch ms this seat stops being held for its absent owner (§9.6). */
  heldUntil: number | null;
}

interface BRClient {
  socketId: string;
  clientKey: string;
  userId: string | null;
  name: string;
  device: DeviceKind;
  /** Server-measured, via the ack on `br:pong` — see the ping handler. */
  rtt: RttWindow;
}

interface BRRoom {
  code: string;
  mode: RoomMode;
  isPrivate: boolean;
  hostSocketId: string;
  levelId: string | null;
  phase: Phase;
  seats: Map<SeatIndex, BRSeat>;
  clients: Map<string, BRClient>;
  /**
   * The most recent keyframe this room relayed, kept for host migration
   * (§9.6). One copy per second per room; the hub reads five bytes of every
   * snapshot to find them and nothing else.
   */
  lastKeyframe: { bytes: Uint8Array; at: number; frame: number } | null;
  showdown: {
    ranked: boolean;
    teams: boolean;
    scores: number[];
    round: number;
    roundKind: ShowdownRoundKind | null;
  } | null;
  createdAt: number;
  lastActivityAt: number;
  startedAt: number;
  /** Party seats reserved before anyone connected (§9.7 path 4). */
  reservedUserIds: Set<string>;
  pendingHostUserId: string | null;
}

const rooms = new Map<string, BRRoom>();
/** A socket is only ever in one Bum's Rush room. */
const socketRoom = new Map<string, string>();

let gcTimer: ReturnType<typeof setInterval> | null = null;

// ─── Small helpers ──────────────────────────────────────────────────────────

function roomChannel(code: string): string {
  return `${ROOM_PREFIX}${code}`;
}

function fail(socket: Socket, code: BrErrorCode, event?: string): void {
  socket.emit(BR_S2C.ERROR, { code, event });
}

function identity(socket: Socket): { userId: string | null; name: string } {
  const data = socket.data as { userId?: string; userName?: string };
  return { userId: data.userId ?? null, name: data.userName ?? 'Player' };
}

/**
 * The generic 1 KB cap from §9.3, applied before anything else touches a JSON
 * payload. `JSON.stringify` on an untrusted object is itself a cost, which is
 * why the two hot-path events are binary and never come through here.
 */
function withinGenericCap(payload: unknown): boolean {
  if (payload === undefined || payload === null) return true;
  try {
    return JSON.stringify(payload).length <= NET_LIMITS.GENERIC_BYTES;
  } catch {
    // Cyclic or otherwise unserialisable — nothing legitimate produces that.
    return false;
  }
}

/** socket.io hands binary through as a Node Buffer; accept either form. */
function binaryLength(payload: unknown): number | null {
  if (payload instanceof ArrayBuffer) return payload.byteLength;
  if (ArrayBuffer.isView(payload)) return payload.byteLength;
  return null;
}

function sanitizeCode(raw: string): string {
  return raw.trim().toUpperCase().slice(0, NET_LIMITS.MAX_CODE_LEN);
}

function uniqueCode(): string | null {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateRoomCode();
    if (!rooms.has(code)) return code;
  }
  return null;
}

function seatViews(room: BRRoom): SeatView[] {
  const views: SeatView[] = [];
  for (const seat of [...room.seats.values()].sort((a, b) => a.seat - b.seat)) {
    const client = room.clients.get(seat.socketId);
    views.push({
      seat: seat.seat,
      clientId: seat.socketId,
      userId: seat.userId,
      name: seat.name,
      localIndex: seat.localIndex,
      cosmetics: seat.cosmetics,
      assists: seat.assists,
      ready: seat.ready,
      connected: seat.connected,
      rtt: client ? client.rtt.median(Date.now()) : null,
    });
  }
  return views;
}

function roomView(room: BRRoom): RoomView {
  return {
    id: room.code,
    code: room.code,
    mode: room.mode,
    private: room.isPrivate,
    hostClientId: room.hostSocketId,
    levelId: room.levelId,
    phase: room.phase,
    seats: seatViews(room),
    ...(room.showdown ? { showdown: { ...room.showdown, scores: [...room.showdown.scores] } } : {}),
  };
}

function broadcastRoom(io: Server, room: BRRoom): void {
  io.to(roomChannel(room.code)).emit(BR_S2C.ROOM, roomView(room));
}

function seatsOf(room: BRRoom, socketId: string): SeatIndex[] {
  const seats: SeatIndex[] = [];
  for (const seat of room.seats.values()) if (seat.socketId === socketId) seats.push(seat.seat);
  return seats.sort((a, b) => a - b);
}

function sendSeatAssignment(socket: Socket, room: BRRoom): void {
  const seats = [...room.seats.values()]
    .filter((seat) => seat.socketId === socket.id)
    .sort((a, b) => a.seat - b.seat)
    .map((seat) => ({ seat: seat.seat, localIndex: seat.localIndex }));
  socket.emit(BR_S2C.SEAT, { clientId: socket.id, seats });
}

function myRoom(socket: Socket): BRRoom | null {
  const code = socketRoom.get(socket.id);
  return code ? (rooms.get(code) ?? null) : null;
}

function isHost(room: BRRoom, socketId: string): boolean {
  return room.hostSocketId === socketId;
}

function freeSeatIndex(room: BRRoom): SeatIndex | null {
  for (let i = 0; i < NET.MAX_SEATS; i++) {
    if (!room.seats.has(i as SeatIndex)) return i as SeatIndex;
  }
  return null;
}

/**
 * §9.7 path 1 — a campaign room starts the instant it exists.
 *
 * Showdown is inherently versus, so it waits for a second player; everything
 * else drops you into the level and sketches the joiner in when they arrive.
 * This is the whole difference between "seamless" and "a lobby with one person
 * in it".
 */
function startsSolo(mode: RoomMode): boolean {
  return mode !== 'showdown';
}

/**
 * A mid-level joiner gets the last keyframe attached (§9.7).
 *
 * Waiting for the host to notice PEER_JOINED and push a fresh one costs a
 * round trip plus a frame, and what the player sees in that window is an empty
 * sheet of paper. The hub already keeps the keyframe for host migration, so
 * handing it over here is free and the joiner is sketched into a world that is
 * at most one keyframe interval stale.
 */
function startPayload(room: BRRoom, joinInProgress: boolean) {
  return {
    levelId: room.levelId ?? DEFAULT_LEVEL_ID,
    mode: room.mode,
    hostClientId: room.hostSocketId,
    startedAt: room.startedAt,
    seats: seatViews(room),
    joinInProgress,
    ...(room.showdown?.roundKind ? { roundKind: room.showdown.roundKind } : {}),
    ...(joinInProgress && room.lastKeyframe ? { keyframe: room.lastKeyframe.bytes } : {}),
  };
}

// ─── Room lifecycle ─────────────────────────────────────────────────────────

function createRoom(options: {
  mode: RoomMode;
  isPrivate: boolean;
  levelId: string | null;
  hostSocketId: string;
  pendingHostUserId: string | null;
  ranked?: boolean;
  teams?: boolean;
}): BRRoom | null {
  if (rooms.size >= MAX_ROOMS) return null;
  const code = uniqueCode();
  if (!code) return null;

  const now = Date.now();
  const room: BRRoom = {
    code,
    mode: options.mode,
    isPrivate: options.isPrivate,
    hostSocketId: options.hostSocketId,
    levelId: options.levelId,
    phase: 'lobby',
    seats: new Map(),
    clients: new Map(),
    lastKeyframe: null,
    showdown:
      options.mode === 'showdown'
        ? {
            ranked: options.ranked === true,
            teams: options.teams === true,
            scores: [0, 0, 0, 0],
            round: 0,
            roundKind: null,
          }
        : null,
    createdAt: now,
    lastActivityAt: now,
    startedAt: 0,
    reservedUserIds: new Set(),
    pendingHostUserId: options.pendingHostUserId,
  };
  rooms.set(code, room);
  return room;
}

function destroyRoom(io: Server, room: BRRoom): void {
  for (const socketId of room.clients.keys()) {
    socketRoom.delete(socketId);
    io.sockets.sockets.get(socketId)?.leave(roomChannel(room.code));
  }
  rooms.delete(room.code);
}

function attachClient(socket: Socket, room: BRRoom, info: { device: DeviceKind; clientKey: string; name: string }): BRClient {
  const existing = room.clients.get(socket.id);
  if (existing) return existing;
  const { userId } = identity(socket);
  const client: BRClient = {
    socketId: socket.id,
    clientKey: info.clientKey,
    userId,
    name: info.name,
    device: info.device,
    rtt: new RttWindow(),
  };
  room.clients.set(socket.id, client);
  socketRoom.set(socket.id, room.code);
  void socket.join(roomChannel(room.code));
  return client;
}

/**
 * Give this socket a seat, or re-attach the ones it is still holding.
 *
 * Reconnect first (§9.6): a client that comes back inside the 90-second grace
 * takes its own seats back rather than being handed new ones, which is what
 * keeps a mid-level drop from re-colouring everybody's character.
 */
function seatClient(
  socket: Socket,
  room: BRRoom,
  info: { clientKey: string; name: string; cosmetics: Cosmetics; localIndex?: number },
): SeatIndex | null {
  const { userId } = identity(socket);
  const now = Date.now();

  let reclaimed: SeatIndex | null = null;
  for (const seat of room.seats.values()) {
    const sameTab = info.clientKey !== '' && seat.clientKey === info.clientKey;
    const sameAccount = userId !== null && seat.userId === userId;
    if (!seat.connected && (sameTab || sameAccount) && (seat.heldUntil ?? 0) > now) {
      seat.socketId = socket.id;
      seat.connected = true;
      seat.heldUntil = null;
      if (reclaimed === null) reclaimed = seat.seat;
    }
  }
  if (reclaimed !== null) return reclaimed;

  const index = freeSeatIndex(room);
  if (index === null) return null;

  room.seats.set(index, {
    seat: index,
    socketId: socket.id,
    clientKey: info.clientKey,
    userId,
    name: info.name,
    localIndex: info.localIndex ?? 0,
    cosmetics: info.cosmetics,
    assists: room.showdown?.ranked ? { ...RANKED_ASSISTS } : { ...DEFAULT_ASSISTS },
    ready: false,
    connected: true,
    heldUntil: null,
  });
  return index;
}

/**
 * §9.6 host election, delegated to the shared rule in
 * `lib/bums-rush/net/migration.ts` so the hub and the HUD cannot disagree about
 * who is hosting.
 */
function electNewHost(room: BRRoom, excludeSocketId?: string): string | null {
  const now = Date.now();
  const bySocket = new Map<string, HostCandidate>();
  for (const seat of room.seats.values()) {
    if (seat.socketId === excludeSocketId) continue;
    if (!seat.connected) continue;
    const client = room.clients.get(seat.socketId);
    const existing = bySocket.get(seat.socketId);
    if (existing) {
      (existing.seats as SeatIndex[]).push(seat.seat);
      continue;
    }
    bySocket.set(seat.socketId, {
      clientId: seat.socketId,
      seats: [seat.seat],
      medianRtt: client ? client.rtt.median(now) : null,
      device: client?.device,
      connected: true,
    });
  }
  return electHost([...bySocket.values()]);
}

/**
 * Hand the room to a new host and give them what they need to resume (§9.6):
 * the last keyframe, and how old it is. Older than two seconds and the new host
 * rewinds to the last checkpoint instead — `planMigration` makes that call on
 * the client, because it is the client that knows where the checkpoint was.
 */
function promoteHost(
  io: Server,
  room: BRRoom,
  newHostSocketId: string,
  reason: 'handoff' | 'host-left' | 'host-timeout',
): void {
  room.hostSocketId = newHostSocketId;
  const keyframe = room.lastKeyframe;
  const ageMs = keyframe ? Date.now() - keyframe.at : null;

  for (const socketId of room.clients.keys()) {
    const target = io.sockets.sockets.get(socketId);
    if (!target) continue;
    const youAreHost = socketId === newHostSocketId;
    target.emit(BR_S2C.HOST_CHANGED, {
      hostClientId: newHostSocketId,
      youAreHost,
      // Only the incoming host needs the bytes; sending a 2 KB keyframe to
      // everyone else would be a burst on exactly the connections that were
      // already struggling.
      keyframe: youAreHost && keyframe ? keyframe.bytes : null,
      keyframeAgeMs: youAreHost ? ageMs : null,
      reason,
    });
  }
  broadcastRoom(io, room);
  logger.info({ event: 'br_host_changed', code: room.code, host: newHostSocketId, reason });
}

/** Release a client's grip on the room, holding its seats for the grace period. */
function releaseClient(io: Server, socket: Socket, options: { immediate: boolean }): void {
  const room = myRoom(socket);
  if (!room) return;

  const wasHost = isHost(room, socket.id);
  const now = Date.now();

  for (const seat of [...room.seats.values()]) {
    if (seat.socketId !== socket.id) continue;
    if (options.immediate) {
      room.seats.delete(seat.seat);
    } else {
      // §9.6: the seat is HELD, not freed. Their character freezes as a statue
      // — the host does that on receipt of the room update — so a dropped
      // player cannot be the reason everybody else dies.
      seat.connected = false;
      seat.heldUntil = now + NET.RECONNECT_GRACE_MS;
      seat.ready = false;
    }
  }

  room.clients.delete(socket.id);
  socketRoom.delete(socket.id);
  void socket.leave(roomChannel(room.code));
  room.lastActivityAt = now;

  io.to(roomChannel(room.code)).emit(BR_S2C.PEER_LEFT, {
    clientId: socket.id,
    name: identity(socket).name,
    seats: [],
  });

  if (room.clients.size === 0 && room.seats.size === 0) {
    destroyRoom(io, room);
    return;
  }

  if (wasHost) {
    const next = electNewHost(room, socket.id);
    if (next) promoteHost(io, room, next, 'host-left');
    else logger.info({ event: 'br_room_hostless', code: room.code });
  }

  broadcastRoom(io, room);
}

// ─── Garbage collection ─────────────────────────────────────────────────────

function ensureGc(io: Server): void {
  if (gcTimer) return;
  gcTimer = setInterval(() => {
    const now = Date.now();
    for (const room of [...rooms.values()]) {
      let changed = false;
      for (const seat of [...room.seats.values()]) {
        if (!seat.connected && seat.heldUntil !== null && seat.heldUntil <= now) {
          room.seats.delete(seat.seat);
          changed = true;
        }
      }
      if (room.clients.size === 0 && room.seats.size === 0) {
        destroyRoom(io, room);
        continue;
      }
      if (now - room.lastActivityAt > ROOM_IDLE_TIMEOUT_MS) {
        destroyRoom(io, room);
        continue;
      }
      if (changed) broadcastRoom(io, room);
    }
  }, GC_INTERVAL_MS);
  if (gcTimer && typeof gcTimer === 'object' && 'unref' in gcTimer) gcTimer.unref();
}

// ─── Party contract (§9.7 path 4) ───────────────────────────────────────────

registerPartyGame(GAME_ID, {
  maxPartySize: NET.MAX_SEATS,
  async createRoomForParty(members: PartyMember[]) {
    const room = createRoom({
      mode: 'campaign',
      isPrivate: true,
      levelId: null,
      // No socket has arrived yet; the leader takes the chair on arrival.
      hostSocketId: '',
      pendingHostUserId: members[0]?.userId ?? null,
    });
    if (!room) throw new Error('room-capacity');
    for (const member of members) room.reservedUserIds.add(member.userId);
    return { game: GAME_ID, roomId: room.code };
  },
  async seatWithTicket(socket: Socket, ticket: PartyTicket) {
    const room = rooms.get(ticket.roomId);
    if (!room) throw new Error('room-not-found');
    const { userId, name } = identity(socket);
    if (!userId || userId !== ticket.userId) throw new Error('ticket-identity');
    attachClient(socket, room, { device: 'unknown', clientKey: '', name });
    const seat = seatClient(socket, room, {
      clientKey: '',
      name: sanitizeUserName(name),
      cosmetics: { ...DEFAULT_COSMETICS },
    });
    if (seat === null) throw new Error('room-full');
    room.reservedUserIds.delete(userId);
    if (room.hostSocketId === '' || room.pendingHostUserId === userId) {
      room.hostSocketId = socket.id;
      room.pendingHostUserId = null;
    }
  },
});

// ─── Registration ───────────────────────────────────────────────────────────

export function registerBumsRushHandlers(io: Server, socket: Socket): void {
  ensureGc(io);

  /** Rate limit → size cap → schema. In that order, every time. */
  const gate = <T>(
    event: string,
    schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
    payload: unknown,
  ): T | null => {
    if (!checkRateLimit(socket.id, event)) {
      fail(socket, 'rate-limited', event);
      return null;
    }
    if (!withinGenericCap(payload)) {
      fail(socket, 'too-large', event);
      return null;
    }
    const parsed = schema.safeParse(payload ?? {});
    if (!parsed.success) {
      fail(socket, 'bad-payload', event);
      return null;
    }
    return parsed.data;
  };

  const requireRoom = (event: string): BRRoom | null => {
    const room = myRoom(socket);
    if (!room) {
      fail(socket, 'not-in-room', event);
      return null;
    }
    room.lastActivityAt = Date.now();
    return room;
  };

  const requireHost = (event: string): BRRoom | null => {
    const room = requireRoom(event);
    if (!room) return null;
    if (!isHost(room, socket.id)) {
      fail(socket, 'host-only', event);
      return null;
    }
    return room;
  };

  const requireOwnSeat = (room: BRRoom, seatIndex: SeatIndex, event: string): BRSeat | null => {
    const seat = room.seats.get(seatIndex);
    if (!seat || seat.socketId !== socket.id) {
      fail(socket, 'not-your-seat', event);
      return null;
    }
    return seat;
  };

  // ── Doors into a room (§9.7) ─────────────────────────────────────────────

  socket.on(BR_C2S.CREATE_ROOM, (payload: unknown) => {
    const data = gate(BR_C2S.CREATE_ROOM, zCreateRoom, payload);
    if (!data) return;
    if (!isValidCosmetics(data.cosmetics)) return fail(socket, 'unknown-cosmetic', BR_C2S.CREATE_ROOM);

    releaseClient(io, socket, { immediate: true });

    const room = createRoom({
      mode: data.mode,
      isPrivate: data.private,
      levelId: data.levelId ?? null,
      hostSocketId: socket.id,
      pendingHostUserId: null,
      ranked: data.ranked,
      teams: data.teams,
    });
    if (!room) return fail(socket, 'server-busy', BR_C2S.CREATE_ROOM);

    const name = sanitizeUserName(data.name);
    attachClient(socket, room, {
      device: data.device ?? 'unknown',
      clientKey: data.clientKey ?? '',
      name,
    });
    seatClient(socket, room, { clientKey: data.clientKey ?? '', name, cosmetics: data.cosmetics });

    sendSeatAssignment(socket, room);
    broadcastRoom(io, room);
    logger.info({ event: 'br_room_created', code: room.code, mode: room.mode, private: room.isPrivate });
  });

  socket.on(BR_C2S.JOIN_ROOM, (payload: unknown) => {
    const data = gate(BR_C2S.JOIN_ROOM, zJoinRoom, payload);
    if (!data) return;
    if (!isValidCosmetics(data.cosmetics)) return fail(socket, 'unknown-cosmetic', BR_C2S.JOIN_ROOM);

    const code = sanitizeCode(data.code);
    const room = rooms.get(code);
    if (!room) return fail(socket, 'room-not-found', BR_C2S.JOIN_ROOM);

    const { userId } = identity(socket);

    // A party ticket is a bearer secret naming one user and one room; both must
    // match, and it is the only thing that consumes a party reservation.
    if (data.ticket !== undefined) {
      const ticket = verifyPartyTicket(data.ticket);
      if (!ticket || ticket.game !== GAME_ID || ticket.roomId !== code || ticket.userId !== userId) {
        return fail(socket, 'invalid-ticket', BR_C2S.JOIN_ROOM);
      }
      if (userId) room.reservedUserIds.delete(userId);
    }

    const name = sanitizeUserName(data.name);
    const current = socketRoom.get(socket.id);
    if (current && current !== code) releaseClient(io, socket, { immediate: true });

    attachClient(socket, room, {
      device: data.device ?? 'unknown',
      clientKey: data.clientKey ?? '',
      name,
    });

    const seat = seatClient(socket, room, {
      clientKey: data.clientKey ?? '',
      name,
      cosmetics: data.cosmetics,
    });
    if (seat === null) {
      // No seat, but they are in the room: a spectator is better than a door
      // slammed in someone's face, and the seat frees up when a grace expires.
      fail(socket, 'room-full', BR_C2S.JOIN_ROOM);
    }

    // A room whose host left entirely (or a party room nobody has claimed) is
    // adopted by the first arrival rather than staying un-simulated.
    if (room.hostSocketId === '' || !room.clients.has(room.hostSocketId)) {
      const elected = electNewHost(room);
      if (elected) promoteHost(io, room, elected, 'host-timeout');
    }

    sendSeatAssignment(socket, room);
    socket.to(roomChannel(room.code)).emit(BR_S2C.PEER_JOINED, {
      clientId: socket.id,
      name,
      seats: seatsOf(room, socket.id),
    });
    broadcastRoom(io, room);

    // §9.7: a level already running does not stop for a joiner — they are
    // sketched in. The host sends a keyframe on PEER_JOINED so they resync
    // within one snapshot rather than one keyframe interval.
    if (room.phase === 'playing') {
      socket.emit(BR_S2C.START, startPayload(room, true));
    }
  });

  socket.on(BR_C2S.QUICK_PLAY, (payload: unknown) => {
    const data = gate(BR_C2S.QUICK_PLAY, zQuickPlay, payload);
    if (!data) return;
    if (!isValidCosmetics(data.cosmetics)) return fail(socket, 'unknown-cosmetic', BR_C2S.QUICK_PLAY);

    releaseClient(io, socket, { immediate: true });

    const name = sanitizeUserName(data.name);

    // §9.7: the OLDEST open room matching mode, so waiting players pool up
    // instead of scattering one-per-room. A room already playing is a
    // perfectly good match — that is the point.
    let best: BRRoom | null = null;
    for (const room of rooms.values()) {
      if (room.isPrivate || room.mode !== data.mode) continue;
      if (room.phase === 'results') continue;
      if (room.seats.size >= NET.MAX_SEATS) continue;
      if (room.reservedUserIds.size > 0) continue;
      if (!best || room.createdAt < best.createdAt) best = room;
    }

    let joined = false;
    if (best) {
      attachClient(socket, best, {
        device: data.device ?? 'unknown',
        clientKey: data.clientKey ?? '',
        name,
      });
      const seat = seatClient(socket, best, {
        clientKey: data.clientKey ?? '',
        name,
        cosmetics: data.cosmetics,
      });
      if (seat !== null) {
        joined = true;
        sendSeatAssignment(socket, best);
        socket.to(roomChannel(best.code)).emit(BR_S2C.PEER_JOINED, {
          clientId: socket.id,
          name,
          seats: seatsOf(best, socket.id),
        });
        broadcastRoom(io, best);

        if (best.phase === 'lobby' && best.seats.size >= data.minPlayers) {
          best.phase = 'playing';
          best.startedAt = Date.now();
          io.to(roomChannel(best.code)).emit(BR_S2C.START, startPayload(best, false));
        } else if (best.phase === 'playing') {
          socket.emit(BR_S2C.START, startPayload(best, true));
        }
      } else {
        releaseClient(io, socket, { immediate: true });
      }
    }

    if (joined) return;

    const room = createRoom({
      mode: data.mode,
      isPrivate: false,
      levelId: data.levelId ?? DEFAULT_LEVEL_ID,
      hostSocketId: socket.id,
      pendingHostUserId: null,
    });
    if (!room) return fail(socket, 'server-busy', BR_C2S.QUICK_PLAY);

    attachClient(socket, room, {
      device: data.device ?? 'unknown',
      clientKey: data.clientKey ?? '',
      name,
    });
    seatClient(socket, room, { clientKey: data.clientKey ?? '', name, cosmetics: data.cosmetics });
    sendSeatAssignment(socket, room);

    // THE requirement: you are already playing while you wait. A solo campaign
    // room starts in the same tick it is created; nobody stares at a lobby.
    if (startsSolo(room.mode)) {
      room.phase = 'playing';
      room.startedAt = Date.now();
    }
    broadcastRoom(io, room);
    if (room.phase === 'playing') socket.emit(BR_S2C.START, startPayload(room, false));
  });

  socket.on(BR_C2S.LIST_ROOMS, (payload: unknown) => {
    const data = gate(BR_C2S.LIST_ROOMS, zListRooms, payload);
    if (!data) return;
    const now = Date.now();
    const list: RoomListEntry[] = [];
    for (const room of rooms.values()) {
      if (room.isPrivate || room.mode !== data.mode) continue;
      if (room.seats.size >= NET.MAX_SEATS) continue;
      list.push({
        code: room.code,
        mode: room.mode,
        phase: room.phase,
        seatCount: room.seats.size,
        maxSeats: NET.MAX_SEATS,
        levelId: room.levelId,
        ageSec: Math.floor((now - room.createdAt) / 1000),
      });
      if (list.length >= BROWSE_CAP) break;
    }
    socket.emit(BR_S2C.ROOM_LIST, list);
  });

  // ── Seats ────────────────────────────────────────────────────────────────

  socket.on(BR_C2S.CLAIM_SEAT, (payload: unknown) => {
    const data = gate(BR_C2S.CLAIM_SEAT, zClaimSeat, payload);
    if (!data) return;
    const room = requireRoom(BR_C2S.CLAIM_SEAT);
    if (!room) return;
    if (data.cosmetics && !isValidCosmetics(data.cosmetics)) {
      return fail(socket, 'unknown-cosmetic', BR_C2S.CLAIM_SEAT);
    }

    // Couch co-op: one client, several seats (§9.2). The cap is on the ROOM,
    // not on the client, which is what makes "two on the sofa + two online"
    // fall out with no special case.
    const client = room.clients.get(socket.id);
    const index = freeSeatIndex(room);
    if (index === null) return fail(socket, 'room-full', BR_C2S.CLAIM_SEAT);
    for (const seat of room.seats.values()) {
      if (seat.socketId === socket.id && seat.localIndex === data.localIndex) {
        return fail(socket, 'seat-taken', BR_C2S.CLAIM_SEAT);
      }
    }

    const { userId } = identity(socket);
    room.seats.set(index, {
      seat: index,
      socketId: socket.id,
      clientKey: client?.clientKey ?? '',
      userId,
      name: data.name ? sanitizeUserName(data.name) : (client?.name ?? 'Player'),
      localIndex: data.localIndex,
      cosmetics: data.cosmetics ?? { ...DEFAULT_COSMETICS },
      assists: room.showdown?.ranked ? { ...RANKED_ASSISTS } : { ...DEFAULT_ASSISTS },
      ready: false,
      connected: true,
      heldUntil: null,
    });

    sendSeatAssignment(socket, room);
    broadcastRoom(io, room);
  });

  socket.on(BR_C2S.RELEASE_SEAT, (payload: unknown) => {
    const data = gate(BR_C2S.RELEASE_SEAT, zReleaseSeat, payload);
    if (!data) return;
    const room = requireRoom(BR_C2S.RELEASE_SEAT);
    if (!room) return;
    if (!requireOwnSeat(room, data.seatIndex, BR_C2S.RELEASE_SEAT)) return;

    room.seats.delete(data.seatIndex);
    sendSeatAssignment(socket, room);

    if (isHost(room, socket.id) && seatsOf(room, socket.id).length === 0) {
      const next = electNewHost(room, socket.id);
      if (next) promoteHost(io, room, next, 'handoff');
    }
    broadcastRoom(io, room);
  });

  socket.on(BR_C2S.SET_COSMETICS, (payload: unknown) => {
    const data = gate(BR_C2S.SET_COSMETICS, zSetCosmetics, payload);
    if (!data) return;
    const room = requireRoom(BR_C2S.SET_COSMETICS);
    if (!room) return;
    const seat = requireOwnSeat(room, data.seatIndex, BR_C2S.SET_COSMETICS);
    if (!seat) return;

    const cosmetics: Cosmetics = {
      head: data.head,
      hat: data.hat,
      gloves: data.gloves,
      ink: data.ink,
    };
    // The allowlist, not just the shape: a client cannot invent a head id, and
    // every other browser in the room renders this string.
    if (!isValidCosmetics(cosmetics)) {
      return fail(socket, 'unknown-cosmetic', BR_C2S.SET_COSMETICS);
    }
    seat.cosmetics = cosmetics;
    broadcastRoom(io, room);
  });

  socket.on(BR_C2S.SET_ASSISTS, (payload: unknown) => {
    const data = gate(BR_C2S.SET_ASSISTS, zSetAssists, payload);
    if (!data) return;
    const room = requireRoom(BR_C2S.SET_ASSISTS);
    if (!room) return;
    const seat = requireOwnSeat(room, data.seatIndex, BR_C2S.SET_ASSISTS);
    if (!seat) return;

    // §8.4 — ranked Showdown runs assist-free for everyone, and the server is
    // where that is true rather than the settings screen.
    seat.assists = room.showdown?.ranked ? { ...RANKED_ASSISTS } : data.assists;
    broadcastRoom(io, room);
  });

  socket.on(BR_C2S.READY, (payload: unknown) => {
    const data = gate(BR_C2S.READY, zReady, payload);
    if (!data) return;
    const room = requireRoom(BR_C2S.READY);
    if (!room) return;
    const seat = requireOwnSeat(room, data.seatIndex, BR_C2S.READY);
    if (!seat) return;
    seat.ready = data.ready;
    broadcastRoom(io, room);
  });

  // ── Match control ────────────────────────────────────────────────────────

  socket.on(BR_C2S.SELECT_LEVEL, (payload: unknown) => {
    const data = gate(BR_C2S.SELECT_LEVEL, zSelectLevel, payload);
    if (!data) return;
    const room = requireHost(BR_C2S.SELECT_LEVEL);
    if (!room) return;
    room.levelId = data.levelId;
    broadcastRoom(io, room);
  });

  socket.on(BR_C2S.START, (payload: unknown) => {
    const data = gate(BR_C2S.START, zStart, payload);
    if (!data) return;
    const room = requireHost(BR_C2S.START);
    if (!room) return;

    if (data.levelId) room.levelId = data.levelId;
    if (room.showdown && data.roundKind) {
      room.showdown.roundKind = data.roundKind;
      room.showdown.round += 1;
    }
    room.phase = 'playing';
    room.startedAt = Date.now();
    room.lastKeyframe = null;
    io.to(roomChannel(room.code)).emit(BR_S2C.START, startPayload(room, false));
    broadcastRoom(io, room);
  });

  // ── The hot path ─────────────────────────────────────────────────────────

  /**
   * `br:input` — guest → host.
   *
   * Two checks and a forward. The seat check is the one that matters: a client
   * may only send input for seats the HUB says it owns, so a guest cannot drive
   * somebody else's character by editing a byte. Forwarded to the host alone;
   * no other client has any use for it.
   */
  socket.on(BR_C2S.INPUT, (payload: unknown) => {
    if (!checkRateLimit(socket.id, BR_C2S.INPUT)) return;
    const length = binaryLength(payload);
    if (length === null || length > NET_LIMITS.INPUT_BYTES) return;

    const room = myRoom(socket);
    if (!room || room.phase !== 'playing') return;
    if (isHost(room, socket.id)) return; // the host's own input never leaves the tab

    const claimed = decodeInputSeats(payload as BinarySource);
    if (!claimed || claimed.length === 0) return;
    const owned = new Set(seatsOf(room, socket.id));
    for (const seat of claimed) {
      if (!owned.has(seat)) return; // one bad seat rejects the whole packet
    }

    io.sockets.sockets.get(room.hostSocketId)?.emit(BR_S2C.INPUT, payload);
  });

  /**
   * `br:snapshot` — host → guests. **The one check that matters** (§9.3).
   *
   * Accepted only from the room's current host, broadcast only to that room.
   * Without it any guest can puppet everybody else's world, which for a game
   * built entirely out of grabbing each other is total control of the room.
   */
  socket.on(BR_C2S.SNAPSHOT, (payload: unknown) => {
    if (!checkRateLimit(socket.id, BR_C2S.SNAPSHOT)) return;
    const length = binaryLength(payload);
    if (length === null || length > NET_LIMITS.SNAPSHOT_BYTES) return;

    const room = myRoom(socket);
    if (!room) return;
    if (!isHost(room, socket.id)) return;

    // Five bytes of inspection: enough to keep the newest keyframe for host
    // migration (§9.6), and nothing else. The payload itself is opaque.
    const source = payload as BinarySource;
    if (isKeyframe(source)) {
      const header = peekSnapshotHeader(source);
      // Copied, not referenced: socket.io's Buffer is a view into a pooled
      // allocation that is reused the moment this handler returns.
      room.lastKeyframe = { bytes: binaryCopy(source), at: Date.now(), frame: header?.frame ?? 0 };
    }

    room.lastActivityAt = Date.now();
    socket.to(roomChannel(room.code)).emit(BR_S2C.SNAPSHOT, payload);
  });

  socket.on(BR_C2S.EVENT, (payload: unknown) => {
    const data = gate(BR_C2S.EVENT, zEventMsg, payload);
    if (!data) return;
    const room = requireHost(BR_C2S.EVENT);
    if (!room) return;
    socket.to(roomChannel(room.code)).emit(BR_S2C.EVENT, data);
  });

  socket.on(BR_C2S.EMOTE, (payload: unknown) => {
    const data = gate(BR_C2S.EMOTE, zEmote, payload);
    if (!data) return;
    const room = requireRoom(BR_C2S.EMOTE);
    if (!room) return;
    if (!requireOwnSeat(room, data.seatIndex, BR_C2S.EMOTE)) return;
    io.to(roomChannel(room.code)).emit(BR_S2C.EMOTE, data);
  });

  // ── Results (§9.8) ───────────────────────────────────────────────────────

  /**
   * The host reports; the hub bound-checks and answers on the socket.io ack.
   *
   * It does NOT write to the database. Persistence is `/api/bums-rush/*` on the
   * web tier (§10.3), where the session lives and where a signed-out player's
   * local save and a signed-in player's row are the same code path. Failing a
   * bound downgrades a result to unranked and says why — never a silent drop,
   * because a dropped clear is a support ticket.
   */
  socket.on(BR_C2S.RESULT, (payload: unknown, ack?: (response: ResultAckMsg | null) => void) => {
    const data = gate(BR_C2S.RESULT, zResultMsg, payload);
    if (!data) return ack?.(null);
    const room = requireHost(BR_C2S.RESULT);
    if (!room) return ack?.(null);

    const verdict = verifyResult(data, {
      roomSeats: [...room.seats.keys()],
      roomId: room.code,
      hostClientId: room.hostSocketId,
      // Per-level bounds (`minPlausibleSeconds`, `parSeconds`, the objective
      // ids) need the level manifest, which the hub deliberately does not load
      // — `verifyResult` applies them when the persistence route passes them in.
    });

    room.phase = 'results';
    broadcastRoom(io, room);

    if (!verdict.ranked) {
      logger.warn({
        event: 'br_result_unranked',
        code: room.code,
        reasons: verdict.reasons.join(','),
      });
    }

    ack?.({
      accepted: true,
      ranked: verdict.ranked,
      reasons: verdict.reasons,
      persistVia:
        data.body.kind === 'level' ? '/api/bums-rush/clear' : '/api/bums-rush/showdown',
    });
  });

  // ── Host migration & health ──────────────────────────────────────────────

  socket.on(BR_C2S.HOST_HANDOFF, (payload: unknown) => {
    const data = gate(BR_C2S.HOST_HANDOFF, zHostHandoff, payload);
    if (!data) return;
    const room = requireHost(BR_C2S.HOST_HANDOFF);
    if (!room) return;
    // Only a seat-owning, connected client can be handed the room — handing it
    // to a spectator stops the simulation entirely.
    if (seatsOf(room, data.toClientId).length === 0 || !room.clients.has(data.toClientId)) {
      return fail(socket, 'bad-payload', BR_C2S.HOST_HANDOFF);
    }
    promoteHost(io, room, data.toClientId, 'handoff');
  });

  /**
   * `br:ping` — the client's RTT probe, and the hub's.
   *
   * The client measures RTT from its own `t`. The hub gets its own sample from
   * the ACK on the pong, which is what host election reads (§9.6): a client
   * cannot be trusted to report the number that decides whether it becomes the
   * authority for everyone else.
   */
  socket.on(BR_C2S.PING, (payload: unknown) => {
    const data = gate(BR_C2S.PING, zPing, payload);
    if (!data) return;
    const sentAt = Date.now();
    const room = myRoom(socket);
    const client = room?.clients.get(socket.id);

    socket
      .timeout(5_000)
      .emit(BR_S2C.PONG, { t: data.t, serverT: sentAt }, (error: Error | null) => {
        if (error || !client) return;
        const now = Date.now();
        client.rtt.push(now - sentAt, now);
      });
  });

  socket.on(BR_C2S.LEAVE, (payload: unknown) => {
    if (!checkRateLimit(socket.id, BR_C2S.LEAVE)) return;
    if (!withinGenericCap(payload)) return;
    releaseClient(io, socket, { immediate: true });
  });
}

/**
 * Disconnect: seats are HELD, not freed (§9.6).
 *
 * Ninety seconds of grace, their characters frozen as statues by the host, and
 * the room re-elects a host if the one that vanished was it.
 */
export function handleBumsRushDisconnect(io: Server, socket: Socket): void {
  releaseClient(io, socket, { immediate: false });
}
