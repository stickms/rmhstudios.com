/**
 * Hearthworks multiplayer — signalling and the relay fallback on the games hub (`hearthworks:p2p:*`;
 * contract: features/hearthworks/engine/net/events.ts, design docs/superpowers/specs/2026-11-04-hearthworks-design.md §5.4).
 *
 * A Hearthworks world runs in its host's browser (host-authoritative lockstep, features/hearthworks/engine/net/host.ts);
 * members connect to it over WebRTC DataChannels (lib/shared/p2p). This handler carries NO game traffic
 * and stores NO game state — not commands, ticks or the world. It is the generic signalling registry
 * (p2p/signal-hub.ts, shared with Balatro) plus Hearthworks' rules:
 *
 *   - requires a signed-in account for every event (`auth-required`; the relay hot path drops silently) and
 *     **vouches** for it: a join request reaches the host with the hub's userId and name, never the
 *     peer's claim — the host stamps that id on every command it orders;
 *   - lists public rooms (`list` → `rooms`): code, name, host name, player count, the world's seed and size;
 *   - forwards offers / answers / candidates only between the host and an admitted member (`routeSignal`);
 *   - hands each account short-lived TURN credentials with its room (lib/call/ice.ts);
 *   - relays opaque frames for a member without a direct path under a byte budget (HW_RELAY_LIMITS); a
 *     member whose reliable debt overflows is cut off the room, not left to rot on a dead relay;
 *   - tells everyone in a room who is in it (`roster`: hub membership — account ids and names);
 *   - **migrates the host**: the host names a successor (the longest-connected member, mirroring
 *     `HostSession.successor()`); when the host leaves, or its socket stays gone for `MIGRATE_GRACE_MS`,
 *     the hub promotes the host-named successor (else the earliest-joined admitted member), tells every
 *     other member (`host-changed`) and asks the new host to admit each of them again — identities still
 *     vouched for here. A host that vanishes with nobody to take over holds the room `HOST_GRACE_MS`, then
 *     the room expires;
 *   - enforces kicks at the door (a kicked account is refused for the room's life) and the player cap.
 *
 * NOTE: server code imports `lib/` RELATIVELY — server/CLAUDE.md gotcha 7.
 */

import { createHmac } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { logger } from '../../../server/socket-server/logger';
import { checkRateLimit } from '../../../server/socket-server/rate-limit';
import { generateRoomCode, sanitizeString } from '../../../server/socket-server/utils';
import { bindEvents, type Handlers } from '../../../server/shared/typed-socket';
import { buildIceServers } from '../../../lib/call/ice';
import { clampIceServers, type IceServerConfig } from '../../../lib/shared/p2p/ice';
import {
  HW_EVENTS,
  HW_LIMITS,
  HW_RELAY_LIMITS,
  type HwHubErrorCode,
  type HwRoomEntry,
  type HwRosterEntry,
  type HwS2CEvent,
  type HwS2CPayload,
  type WorldDigest,
} from '../engine/net/events';
import { SignalHub, type HubAccount, type HubMember, type HubRoom } from '../../../server/socket-server/p2p/signal-hub';
import { PasswordGuard, makeLock, type RoomLock } from '../../../server/socket-server/p2p/room-password';

interface RoomMeta {
  name: string;
  maxPlayers: number;
  world: WorldDigest;
  isPrivate: boolean;
  /** Set when the host locked the room. Only a salted hash is kept (room-password.ts); the room list says `locked`. */
  lock: RoomLock | null;
}
type MemberMeta = Record<string, never>;
type Room = HubRoom<RoomMeta, MemberMeta>;
type Member = HubMember<MemberMeta>;

/** Relayed unreliable frames are dropped while this many frames wait to be written to the receiver. */
const RELAY_UNRELIABLE_BACKLOG = 16;

let ioRef: Server | null = null;

/** Guesses at locked rooms: per account and room, per socket, per room (room-password.ts). */
const passwordGuard = new PasswordGuard();

const hub = new SignalHub<RoomMeta, MemberMeta>({
  limits: {
    PEER_ID_LENGTH: HW_LIMITS.PEER_ID_LENGTH,
    TOKEN_LENGTH: HW_LIMITS.TOKEN_LENGTH,
    MAX_ROOMS: HW_LIMITS.MAX_ROOMS,
  },
  relay: HW_RELAY_LIMITS,
  generateCode: () => generateRoomCode(),
  onHostTimeout: (room) => {
    if (ioRef) onHostTimeout(ioRef, room);
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** The account behind the socket (soft auth: absent for a signed-out visitor). */
export function hearthworksAccount(socket: Socket): HubAccount | null {
  const data = (socket.data ?? {}) as { userId?: unknown; userName?: unknown; avatarUrl?: unknown };
  const userId = typeof data.userId === 'string' ? data.userId : '';
  if (!userId || userId.length > 64) return null;
  const name = sanitizeString(typeof data.userName === 'string' ? data.userName : '', 32) || 'Player';
  return { userId, name, avatarUrl: null };
}

/** STUN, then TURN with a credential minted for this account; trimmed to what browsers accept. */
function iceFor(userId: string): IceServerConfig[] {
  return clampIceServers(
    buildIceServers({
      userId,
      now: Date.now(),
      hmacSha1Base64: (secret, message) => createHmac('sha1', secret).update(message).digest('base64'),
    }),
  );
}

function emitTo<K extends HwS2CEvent>(
  io: Server,
  socketId: string | null | undefined,
  event: K,
  payload: HwS2CPayload<K>,
): void {
  if (!socketId) return;
  io.sockets.sockets.get(socketId)?.emit(event, payload);
}

function fail(socket: Socket, event: string, code: HwHubErrorCode): void {
  const payload: HwS2CPayload<'hearthworks:p2p:error'> = { event, code };
  socket.emit('hearthworks:p2p:error', payload);
}

function roster(room: Room): HwRosterEntry[] {
  const out: HwRosterEntry[] = [{ id: room.host.userId, name: room.host.name, host: true }];
  for (const m of room.members.values()) {
    if (m.admitted && m.socketId) out.push({ id: m.account.userId, name: m.account.name, host: false });
  }
  return out;
}

/** The host and every admitted member learn who is in the room. */
function broadcastRoster(io: Server, room: Room): void {
  if (room.closed) return;
  const payload: HwS2CPayload<'hearthworks:p2p:roster'> = { code: room.code, players: roster(room) };
  emitTo(io, room.hostSocketId, 'hearthworks:p2p:roster', payload);
  for (const m of room.members.values()) if (m.admitted) emitTo(io, m.socketId, 'hearthworks:p2p:roster', payload);
}

function entry(room: Room): HwRoomEntry {
  const admitted = [...room.members.values()].filter((m) => m.admitted).length;
  return {
    code: room.code,
    name: room.meta.name,
    host: room.host.name,
    players: Math.min(HW_LIMITS.MAX_PLAYERS, 1 + admitted),
    maxPlayers: room.meta.maxPlayers,
    world: room.meta.world,
    ...(room.meta.lock ? { locked: true as const } : {}),
  };
}

/** Public rooms whose host is connected, newest first. */
function listRooms(): HwRoomEntry[] {
  return [...hub.rooms.values()]
    .filter((r) => !r.closed && !r.meta.isPrivate && r.hostSocketId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, HW_LIMITS.LIST_MAX)
    .map(entry);
}

function joinRequest(m: Member): HwS2CPayload<'hearthworks:p2p:join-request'> {
  return { peerId: m.peerId, userId: m.account.userId, name: m.account.name };
}

/** Pending, connected members the host has not answered yet (re-sent when a host comes back). */
function resendPending(io: Server, room: Room): void {
  for (const m of room.members.values()) {
    if (!m.admitted && m.socketId) emitTo(io, room.hostSocketId, 'hearthworks:p2p:join-request', joinRequest(m));
  }
}

/** Every entry this account has in `room` other than `keep`. */
function entriesOf(room: Room, userId: string, keep?: Member): Member[] {
  return [...room.members.values()].filter((m) => m.account.userId === userId && m !== keep);
}

// ─── Room lifecycle ─────────────────────────────────────────────────────────

function closeRoom(io: Server, room: Room, reason: 'host-closed' | 'host-lost'): void {
  if (room.closed) return;
  const members = hub.close(room);
  passwordGuard.forgetRoom(room.code);
  for (const m of members) emitTo(io, m.socketId, 'hearthworks:p2p:closed', { code: room.code, reason });
  logger.info({ event: 'hearthworks_p2p_room_closed', code: room.code, reason });
}

/** `successor` takes the host seat; everyone else is told and asked for again. */
function promoteRoom(io: Server, room: Room, successor: Member): void {
  hub.promote(room, successor);
  emitTo(io, room.hostSocketId, 'hearthworks:p2p:promote', {
    code: room.code,
    token: room.token,
    peerId: room.hostPeerId,
    ice: iceFor(room.host.userId),
  });
  const changed = {
    code: room.code,
    hostPeerId: room.hostPeerId,
    hostUserId: room.host.userId,
    hostName: room.host.name,
  };
  for (const m of room.members.values()) {
    if (!m.socketId) continue;
    emitTo(io, m.socketId, 'hearthworks:p2p:host-changed', changed);
    emitTo(io, room.hostSocketId, 'hearthworks:p2p:join-request', joinRequest(m));
  }
  logger.info({ event: 'hearthworks_p2p_host_migrated', code: room.code, migrations: room.migrations, members: room.members.size });
}

/** Rooms whose host is being probed right now (one probe per room at a time). */
const probing = new Set<string>();

/**
 * A member says the host went silent. If the host's hub socket is still open, ask it to answer: the answer is
 * produced by socket.io-client itself, so a frozen tab or a dead network cannot give it. No answer in
 * `PROBE_MS` and the host is treated as gone at once — `hostDisconnected` with the migrate grace — instead of
 * waiting out the socket heartbeat. The deposed socket is told, so a tab that thaws does not go on hosting.
 */
function probeHost(io: Server, room: Room): void {
  const hostSocketId = room.hostSocketId;
  if (room.closed || !hostSocketId || probing.has(room.code)) return;
  const hostSocket = io.sockets.sockets.get(hostSocketId);
  if (!hostSocket) return;
  probing.add(room.code);
  hostSocket.timeout(HW_LIMITS.PROBE_MS).emit('hearthworks:p2p:probe', {}, (err: unknown) => {
    probing.delete(room.code);
    if (!err || room.closed || room.hostSocketId !== hostSocketId) return; // alive, or already handled
    logger.info({ event: 'hearthworks_p2p_host_probe_failed', code: room.code });
    hub.hostDisconnected(hostSocketId, () => HW_LIMITS.MIGRATE_GRACE_MS);
    hostSocket.emit('hearthworks:p2p:closed', { code: room.code, reason: 'host-lost' } satisfies HwS2CPayload<'hearthworks:p2p:closed'>);
  });
}

/** The host's grace ran out: promote if anyone can take over, else hold on to the full grace, then expire. */
function onHostTimeout(io: Server, room: Room): void {
  const successor = hub.successorFor(room);
  if (successor) {
    promoteRoom(io, room, successor);
    return;
  }
  const goneFor = Date.now() - (room.hostGoneAt ?? 0);
  if (goneFor < HW_LIMITS.HOST_GRACE_MS) {
    hub.scheduleHostTimeout(room, HW_LIMITS.HOST_GRACE_MS - goneFor);
    return;
  }
  closeRoom(io, room, 'host-lost');
}

/** The host leaves on purpose: hand over at once, or close. */
function hostLeaves(io: Server, room: Room): void {
  const successor = hub.successorFor(room);
  if (successor) promoteRoom(io, room, successor);
  else closeRoom(io, room, 'host-closed');
}

/** Drop a member entry, tell the host why and everyone who is left. */
function dropMember(io: Server, room: Room, m: Member, reason: 'left' | 'kicked' | 'disconnected'): void {
  if (!hub.removeMember(room, m)) return;
  emitTo(io, room.hostSocketId, 'hearthworks:p2p:member-left', { peerId: m.peerId, userId: m.account.userId, reason });
  broadcastRoster(io, room);
}

// ─── Registration ───────────────────────────────────────────────────────────

export function registerHearthworksP2pHandlers(io: Server, socket: Socket): void {
  ioRef = io;

  /** The account, or `auth-required` (silent on the relay hot path). */
  const account = (event: string): HubAccount | null => {
    const a = hearthworksAccount(socket);
    if (!a && event !== 'hearthworks:p2p:relay') fail(socket, event, 'auth-required');
    return a;
  };

  const hosted = (event: string): Room | null => {
    const room = hub.hostedBy(socket.id);
    if (!room) fail(socket, event, 'not-host');
    return room;
  };

  const sendHosted = (room: Room) =>
    socket.emit('hearthworks:p2p:hosted', {
      code: room.code,
      token: room.token,
      peerId: room.hostPeerId,
      ice: iceFor(room.host.userId),
    } satisfies HwS2CPayload<'hearthworks:p2p:hosted'>);

  const handlers: Handlers<typeof HW_EVENTS> = {
    'hearthworks:p2p:host': (data) => {
      const event = 'hearthworks:p2p:host';
      const me = account(event);
      if (!me) return;
      if (!data.resume && (hub.hostedBy(socket.id) || hub.memberOf(socket.id))) return fail(socket, event, 'invalid');
      if (data.resume) {
        const resumed = hub.resume(socket.id, me, data.resume.code, data.resume.token);
        if (resumed === 'not-host') return fail(socket, event, 'not-host');
        if (resumed !== 'not-found') {
          sendHosted(resumed);
          resendPending(io, resumed);
          broadcastRoster(io, resumed);
          logger.info({ event: 'hearthworks_p2p_host_resumed', code: resumed.code });
          return;
        }
        // Unknown code: the hub restarted and forgot the room. Re-claim it if nobody else has the code.
      }
      if (hub.hostedBy(socket.id) || hub.memberOf(socket.id)) return fail(socket, event, 'invalid');
      const meta: RoomMeta = {
        name: sanitizeString(data.name, HW_LIMITS.NAME_MAX) || `${me.name}`,
        maxPlayers: data.maxPlayers,
        world: data.world,
        isPrivate: data.private === true,
        // Hashed here and dropped: the plaintext is never stored, logged or sent anywhere.
        lock: data.password ? makeLock(data.password) : null,
      };
      const room = hub.host(socket.id, me, meta, data.resume);
      if (room === 'room-limit') return fail(socket, event, 'room-limit');
      if (room === 'code-taken') return fail(socket, event, 'not-host');
      logger.info({ event: 'hearthworks_p2p_room_hosted', code: room.code, reclaimed: !!data.resume });
      sendHosted(room);
    },

    'hearthworks:p2p:list': () => {
      if (!account('hearthworks:p2p:list')) return;
      socket.emit('hearthworks:p2p:rooms', { rooms: listRooms() } satisfies HwS2CPayload<'hearthworks:p2p:rooms'>);
    },

    'hearthworks:p2p:join': (data) => {
      const event = 'hearthworks:p2p:join';
      const me = account(event);
      if (!me) return;
      const room = hub.room(data.code);
      if (!room) return fail(socket, event, 'not-found');
      if (room.kicked.has(me.userId)) return fail(socket, event, 'kicked');
      if (room.host.userId === me.userId || hub.hostedBy(socket.id)) return fail(socket, event, 'invalid');
      // A locked room opens to the right password only. An account already seated in the room (a reconnect)
      // proved itself once and is not asked again.
      if (room.meta.lock && !entriesOf(room, me.userId).some((m) => m.admitted)) {
        if (!data.password) return fail(socket, event, 'password-required');
        const verdict = passwordGuard.attempt(room.meta.lock, data.password, { roomCode: room.code, userId: me.userId, socketId: socket.id });
        if (verdict === 'rate-limited') return fail(socket, event, 'rate-limited');
        if (verdict === 'wrong') return fail(socket, event, 'wrong-password');
      }
      // The same account from another socket (a rejoin after a drop, a second tab): the old entries go quietly. A
      // seat the host already admitted is kept — its place in the line of succession too — so a member that
      // re-asks while the host is unreachable does not lose its right to take the room over (the host still gets a
      // join request and re-connects it).
      const previous = entriesOf(room, me.userId);
      const seat = previous.find((m) => m.admitted) ?? null;
      const wasSuccessor = !!seat && room.successor === seat.peerId;
      for (const old of previous) hub.removeMember(room, old);
      // This socket was a member somewhere else: leave there first, and tell that host.
      const elsewhere = hub.memberOf(socket.id);
      if (elsewhere) dropMember(io, elsewhere.room, elsewhere.member, 'left');
      if (1 + room.members.size >= room.meta.maxPlayers) return fail(socket, event, 'full');
      const member = hub.addMember(room, socket.id, me, 'player', {});
      if (!member) return fail(socket, event, 'full');
      if (seat) {
        hub.admit(member);
        member.joinSeq = seat.joinSeq;
        if (wasSuccessor) room.successor = member.peerId;
      }
      socket.emit('hearthworks:p2p:joining', {
        code: room.code,
        peerId: member.peerId,
        hostUserId: room.host.userId,
        hostName: room.host.name,
        name: room.meta.name,
        maxPlayers: room.meta.maxPlayers,
        world: room.meta.world,
      } satisfies HwS2CPayload<'hearthworks:p2p:joining'>);
      // With the host away the request waits; it is sent when the host resumes or is replaced.
      emitTo(io, room.hostSocketId, 'hearthworks:p2p:join-request', joinRequest(member));
    },

    'hearthworks:p2p:admit': (data) => {
      const event = 'hearthworks:p2p:admit';
      if (!account(event)) return;
      const room = hosted(event);
      if (!room) return;
      const member = room.members.get(data.peerId);
      if (!member || !member.socketId) return fail(socket, event, 'not-found');
      if (!data.accept) {
        hub.removeMember(room, member);
        emitTo(io, member.socketId, 'hearthworks:p2p:rejected', { code: room.code, reason: data.reason ?? 'host-refused' });
        broadcastRoster(io, room);
        return;
      }
      hub.admit(member);
      emitTo(io, member.socketId, 'hearthworks:p2p:admitted', {
        code: room.code,
        ice: iceFor(member.account.userId),
        hostPeerId: room.hostPeerId,
      });
      broadcastRoster(io, room);
    },

    'hearthworks:p2p:signal': (data) => {
      const event = 'hearthworks:p2p:signal';
      if (!account(event)) return;
      const route = hub.routeSignal(socket.id, data.to);
      if (route === 'not-found' || route === 'invalid') return fail(socket, event, route);
      const out: HwS2CPayload<'hearthworks:p2p:signal'> = data.description
        ? { from: route.from, description: data.description }
        : { from: route.from, candidate: data.candidate };
      emitTo(io, route.toSocketId, 'hearthworks:p2p:signal', out);
    },

    'hearthworks:p2p:relay:start': () => {
      const event = 'hearthworks:p2p:relay:start';
      if (!account(event)) return;
      // The host has nothing to start: a member asks, and the host addresses it by its slot.
      if (hub.hostedBy(socket.id)) return;
      const started = hub.startRelay(socket.id);
      if (typeof started === 'string') return fail(socket, event, started);
      logger.info({ event: 'hearthworks_p2p_relay_start', code: started.room.code, relayed: hub.relayedCount(started.room) });
    },

    /** The relay hot path: silent drops only (an error per packet would double a flood). */
    'hearthworks:p2p:relay': (bytes) => {
      if (!account('hearthworks:p2p:relay')) return;
      const verdict = hub.relay(socket.id, bytes);
      if (verdict.kind === 'drop') return;
      if (verdict.kind === 'overflow') {
        logger.warn({ event: 'hearthworks_p2p_relay_overflow', code: verdict.room.code });
        const { room, member } = verdict;
        // Whichever direction ran into debt, the relayed member is the one that cannot keep up: cut it loose.
        hub.stopRelay(member);
        if (hub.removeMember(room, member)) {
          emitTo(io, member.socketId, 'hearthworks:p2p:rejected', { code: room.code, reason: 'relay-overflow' });
          emitTo(io, room.hostSocketId, 'hearthworks:p2p:member-left', {
            peerId: member.peerId,
            userId: member.account.userId,
            reason: 'disconnected',
          });
          broadcastRoster(io, room);
        }
        return;
      }
      const target = io.sockets.sockets.get(verdict.toSocketId);
      if (!target) return;
      const name: HwS2CEvent = 'hearthworks:p2p:relay';
      if (verdict.reliable) {
        target.emit(name, verdict.frame);
        return;
      }
      // Unreliable (pings): dropped when the receiver is backed up.
      const backlog = (target as unknown as { conn?: { writeBuffer?: unknown[] } }).conn?.writeBuffer?.length;
      if (backlog === undefined) target.volatile.emit(name, verdict.frame);
      else if (backlog <= RELAY_UNRELIABLE_BACKLOG) target.emit(name, verdict.frame);
    },

    'hearthworks:p2p:successor': (data) => {
      const event = 'hearthworks:p2p:successor';
      if (!account(event)) return;
      const room = hosted(event);
      if (!room) return;
      if (data.peerId === null) {
        room.successor = null;
        return;
      }
      const named = room.members.get(data.peerId);
      if (!named || !named.admitted || !named.socketId) return fail(socket, event, 'not-found');
      room.successor = named.peerId;
    },

    'hearthworks:p2p:kick': (data) => {
      const event = 'hearthworks:p2p:kick';
      if (!account(event)) return;
      const room = hosted(event);
      if (!room) return;
      const member = room.members.get(data.peerId);
      if (!member || member.account.userId === room.host.userId) return fail(socket, event, 'not-found');
      room.kicked.add(member.account.userId);
      for (const m of entriesOf(room, member.account.userId)) {
        hub.removeMember(room, m);
        emitTo(io, m.socketId, 'hearthworks:p2p:rejected', { code: room.code, reason: 'kicked' });
      }
      socket.emit('hearthworks:p2p:member-left', {
        peerId: member.peerId,
        userId: member.account.userId,
        reason: 'kicked',
      } satisfies HwS2CPayload<'hearthworks:p2p:member-left'>);
      broadcastRoster(io, room);
    },

    'hearthworks:p2p:host-silent': () => {
      if (!account('hearthworks:p2p:host-silent')) return;
      const mine = hub.memberOf(socket.id);
      if (mine?.member.admitted) probeHost(io, mine.room);
    },

    'hearthworks:p2p:leave': () => {
      if (!account('hearthworks:p2p:leave')) return;
      const room = hub.hostedBy(socket.id);
      if (room) {
        hostLeaves(io, room);
        return;
      }
      const mine = hub.memberOf(socket.id);
      if (mine) dropMember(io, mine.room, mine.member, 'left');
    },
  };

  bindEvents(socket, HW_EVENTS, handlers, {
    app: 'hearthworks',
    logger,
    rateLimit: checkRateLimit,
    onRateLimited: (sock, name) => {
      if (name !== 'hearthworks:p2p:relay') fail(sock, name, 'rate-limited');
    },
  });
}

/** The socket went: a member's entry goes with it; a host's room is held for its grace. */
export function handleHearthworksP2pDisconnect(io: Server, socket: Socket): void {
  passwordGuard.forgetSocket(socket.id);
  const mine = hub.memberOf(socket.id);
  if (mine) dropMember(io, mine.room, mine.member, 'disconnected');
  hub.hostDisconnected(socket.id, (room) => (hub.successorFor(room) ? HW_LIMITS.MIGRATE_GRACE_MS : HW_LIMITS.HOST_GRACE_MS));
}

/** Test seam: forget every room and timer. */
export function resetHearthworksP2pForTests(): void {
  hub.reset();
  passwordGuard.reset();
  probing.clear();
  ioRef = null;
}
