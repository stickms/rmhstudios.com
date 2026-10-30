/**
 * Balatro multiplayer — signalling, the relay fallback and the seat directory
 * on the games hub (`balatro:p2p:*`, `balatro:seat:query`; contract:
 * lib/balatro/net/events.ts, PLAN §3.a, WS1).
 *
 * A Balatro lobby runs in its host's browser; members connect to it over
 * WebRTC DataChannels (lib/shared/p2p). This handler carries no game traffic.
 * It:
 *
 *   - requires a signed-in account for every event (`auth-required`; the relay
 *     hot path drops silently) and **vouches** for it: a join request reaches
 *     the host with the hub's userId / name / avatar, never the peer's claim;
 *   - gates on the content hash (D-36: `version-mismatch`), kicked accounts
 *     (`kicked`), one seat per account (`seat-held` + `heldCode`), forfeited
 *     seats (`forfeited`), started lobbies (`started`, members and spectators
 *     excepted), capacity (`full`; spectators capped at 8) and the room limit;
 *   - forwards offers / answers / candidates only between the host and an
 *     admitted member (`routeSignal`);
 *   - relays opaque frames for members without a direct path under per-room
 *     and per-byte budgets (BALATRO_RELAY_LIMITS); a member whose reliable
 *     debt overflows is cut off the relay (`rate-limited`). The relay slot is
 *     the tail of the member's peer id (lib/shared/p2p/relay.ts);
 *   - holds a room whose host's socket dropped: `MIGRATE_GRACE_MS` (2 s) when
 *     someone can take over, else `HOST_GRACE_MS` (30 s); then promotes the
 *     successor (the host-named one, else the earliest-joined connected
 *     player) or closes (`host-lost`). A deliberate `leave` promotes at once;
 *   - lets a host `resume` its room after a socket blip, and re-claim its code
 *     after a hub restart when the code is free (NET-12).
 *
 * The matchmaking / party / invite / spectate-list events are WS12's
 * (handlers/balatro-queue.ts); until it lands, ../balatro/queue-placeholder.ts
 * answers them.
 *
 * NOTE: server code imports `lib/` RELATIVELY — server/CLAUDE.md gotcha 7.
 */

import { createHmac } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { z } from 'zod';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { sanitizeString } from '../utils';
import { bindEvents, type Handlers } from '../../shared/typed-socket';
import { buildIceServers } from '../../../lib/call/ice';
import { clampIceServers, type IceServerConfig } from '../../../lib/shared/p2p/ice';
import { BALATRO_LIMITS } from '../../../lib/balatro/net/limits';
import {
  BALATRO_EVENTS,
  BALATRO_S2C_EVENTS,
  type BalatroHubErrorCode,
  type BalatroS2CEvent,
  type BalatroS2CPayload,
} from '../../../lib/balatro/net/events';
import type { HubAccount } from '../p2p/signal-hub';
import {
  balatroHub,
  forfeit,
  isForfeited,
  lastPeerOf,
  newRoomMeta,
  playerCount,
  rememberPeer,
  resetBalatroDirectoryForTests,
  seat,
  seatOf,
  setBalatroHostTimeoutHandler,
  spectatorCount,
  unseat,
  unseatAll,
  type BalatroMember,
  type BalatroRoom,
} from '../balatro/directory';

/** The events this handler binds (the rest of BALATRO_C2S belongs to the queue handler). */
export const BALATRO_P2P_C2S_EVENTS = [
  'balatro:p2p:host',
  'balatro:p2p:join',
  'balatro:p2p:admit',
  'balatro:p2p:signal',
  'balatro:p2p:relay:start',
  'balatro:p2p:relay',
  'balatro:p2p:state',
  'balatro:p2p:kick',
  'balatro:p2p:forfeit-seat',
  'balatro:p2p:leave',
  'balatro:p2p:close',
  'balatro:seat:query',
] as const;
type P2pEvent = (typeof BALATRO_P2P_C2S_EVENTS)[number];

/** A typed sub-map of the contract holding only `events`. */
export function pickBalatroEvents<const K extends keyof typeof BALATRO_EVENTS>(
  events: readonly K[],
): Pick<typeof BALATRO_EVENTS, K> {
  const out = {} as Pick<typeof BALATRO_EVENTS, K>;
  for (const name of events) out[name] = BALATRO_EVENTS[name];
  return out;
}

const P2P_EVENTS = pickBalatroEvents(BALATRO_P2P_C2S_EVENTS);

/** Relayed unreliable frames are dropped while this many frames wait to be written to the receiver. */
const RELAY_UNRELIABLE_BACKLOG = 16;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** The account behind the socket (soft auth: absent for a signed-out visitor). */
export function balatroAccount(socket: Socket): HubAccount | null {
  const data = (socket.data ?? {}) as { userId?: unknown; userName?: unknown; avatarUrl?: unknown };
  const userId = typeof data.userId === 'string' ? data.userId : '';
  if (!userId || userId.length > 64) return null;
  const name = sanitizeString(typeof data.userName === 'string' ? data.userName : '', 32) || 'Player';
  const avatar = typeof data.avatarUrl === 'string' && data.avatarUrl.length <= 512 ? data.avatarUrl : null;
  return { userId, name, avatarUrl: avatar };
}

/** STUN, then TURN with a credential minted for this account; trimmed to what browsers accept. */
export function iceFor(userId: string): IceServerConfig[] {
  return clampIceServers(
    buildIceServers({
      userId,
      now: Date.now(),
      hmacSha1Base64: (secret, message) => createHmac('sha1', secret).update(message).digest('base64'),
    }),
  );
}

function emitTo<K extends BalatroS2CEvent>(
  io: Server,
  socketId: string | null | undefined,
  event: K,
  payload: BalatroS2CPayload<K>,
): void {
  if (!socketId) return;
  io.sockets.sockets.get(socketId)?.emit(event, payload);
}

function fail(socket: Socket, event: string, code: BalatroHubErrorCode, heldCode?: string): void {
  const payload: BalatroS2CPayload<'balatro:p2p:error'> = { event, code };
  if (heldCode) payload.heldCode = heldCode;
  socket.emit(BALATRO_S2C_EVENTS['balatro:p2p:error'], payload);
}

function joinRequest(room: BalatroRoom, m: BalatroMember): BalatroS2CPayload<'balatro:p2p:join-request'> {
  return {
    peerId: m.peerId,
    userId: m.account.userId,
    name: m.account.name,
    avatarUrl: m.account.avatarUrl,
    role: m.role === 'spectator' ? 'spectator' : 'player',
    rejoin: room.meta.seats.has(m.account.userId) || m.meta.rejoin,
  };
}

/** Pending, connected members the host has not answered yet (re-sent when a host comes back). */
function resendPending(io: Server, room: BalatroRoom): void {
  for (const m of room.members.values()) {
    if (!m.admitted && m.socketId) emitTo(io, room.hostSocketId, 'balatro:p2p:join-request', joinRequest(room, m));
  }
}

function canSucceed(m: BalatroMember): boolean {
  return m.role === 'player';
}

// ─── Room lifecycle ─────────────────────────────────────────────────────────

function closeRoom(io: Server, room: BalatroRoom, reason: 'host-closed' | 'host-lost' | 'expired'): void {
  if (room.closed) return;
  unseatAll(room);
  const members = balatroHub.close(room);
  for (const m of members) emitTo(io, m.socketId, 'balatro:p2p:closed', { code: room.code, reason });
  logger.info({ event: 'balatro_p2p_room_closed', code: room.code, reason });
}

/** `successor` takes the host seat; everyone else is told and asked for again. */
function promoteRoom(io: Server, room: BalatroRoom, successor: BalatroMember): void {
  const previousPeer = room.hostPeerId;
  const previous = balatroHub.promote(room, successor);
  rememberPeer(room, previousPeer, previous.userId);
  seat(room, successor.account.userId);
  emitTo(io, room.hostSocketId, 'balatro:p2p:promote', {
    code: room.code,
    token: room.token,
    ice: iceFor(room.host.userId),
  });
  const changed = { code: room.code, hostPeerId: room.hostPeerId, hostUserId: room.host.userId };
  for (const m of room.members.values()) {
    if (!m.socketId) continue;
    emitTo(io, m.socketId, 'balatro:p2p:host-changed', changed);
    emitTo(io, room.hostSocketId, 'balatro:p2p:join-request', joinRequest(room, m));
  }
  logger.info({ event: 'balatro_p2p_host_migrated', code: room.code, migrations: room.migrations, members: room.members.size });
}

/** The host's grace ran out: promote if anyone can take over, else hold on to the full grace, then close. */
function onHostTimeout(io: Server, room: BalatroRoom): void {
  const successor = balatroHub.successorFor(room, canSucceed);
  if (successor) {
    promoteRoom(io, room, successor);
    return;
  }
  const goneFor = Date.now() - (room.hostGoneAt ?? 0);
  if (goneFor < BALATRO_LIMITS.HOST_GRACE_MS) {
    balatroHub.scheduleHostTimeout(room, BALATRO_LIMITS.HOST_GRACE_MS - goneFor);
    return;
  }
  closeRoom(io, room, 'host-lost');
}

/** The host leaves on purpose: hand over at once, or close. */
function hostLeaves(io: Server, room: BalatroRoom): void {
  const successor = balatroHub.successorFor(room, canSucceed);
  if (successor) promoteRoom(io, room, successor);
  else closeRoom(io, room, 'host-closed');
}

/** Drop a member entry and tell the host why. */
function dropMember(
  io: Server,
  room: BalatroRoom,
  m: BalatroMember,
  reason: 'left' | 'kicked' | 'disconnected',
): void {
  if (!balatroHub.removeMember(room, m)) return;
  emitTo(io, room.hostSocketId, 'balatro:p2p:member-left', { peerId: m.peerId, userId: m.account.userId, reason });
}

/** Every entry this account has in `room` other than `keep`. */
function entriesOf(room: BalatroRoom, userId: string, keep?: BalatroMember): BalatroMember[] {
  return [...room.members.values()].filter((m) => m.account.userId === userId && m !== keep);
}

/** Pending (not admitted) entries this account has in rooms other than `except` (a second join elsewhere). */
function dropPendingElsewhere(io: Server, userId: string, except: BalatroRoom): void {
  for (const room of balatroHub.rooms.values()) {
    if (room === except || room.closed) continue;
    for (const m of entriesOf(room, userId)) if (!m.admitted) dropMember(io, room, m, 'left');
  }
}

// ─── Registration ───────────────────────────────────────────────────────────

let timeoutBound = false;

export function registerBalatroP2pHandlers(io: Server, socket: Socket): void {
  if (!timeoutBound) {
    setBalatroHostTimeoutHandler((room) => onHostTimeout(io, room));
    timeoutBound = true;
  }

  /** The account, or `auth-required` (silent on the relay hot path). */
  const account = (event: P2pEvent): HubAccount | null => {
    const a = balatroAccount(socket);
    if (!a && event !== 'balatro:p2p:relay') fail(socket, event, 'auth-required');
    return a;
  };

  const hosted = (event: P2pEvent): BalatroRoom | null => {
    const room = balatroHub.hostedBy(socket.id);
    if (!room) fail(socket, event, 'not-host');
    return room;
  };

  const sendHosted = (room: BalatroRoom) =>
    socket.emit(BALATRO_S2C_EVENTS['balatro:p2p:hosted'], {
      code: room.code,
      token: room.token,
      peerId: room.hostPeerId,
      ice: iceFor(room.host.userId),
    } satisfies BalatroS2CPayload<'balatro:p2p:hosted'>);

  const handlers: Handlers<typeof P2P_EVENTS> = {
    'balatro:p2p:host': (data) => {
      const event = 'balatro:p2p:host';
      const me = account(event);
      if (!me) return;
      if (data.resume) {
        const resumed = balatroHub.resume(socket.id, me, data.resume.code, data.resume.token);
        if (resumed === 'not-host') return fail(socket, event, 'not-host');
        if (resumed !== 'not-found') {
          if (resumed.meta.contentHash !== data.contentHash) return fail(socket, event, 'version-mismatch');
          seat(resumed, me.userId);
          sendHosted(resumed);
          resendPending(io, resumed);
          logger.info({ event: 'balatro_p2p_host_resumed', code: resumed.code });
          return;
        }
        // Unknown code: the hub restarted. Re-claim it if nobody else has it (NET-12).
      }
      const held = seatOf(me.userId);
      if (held) return fail(socket, event, 'seat-held', held.code);
      if (balatroHub.memberOf(socket.id)) return fail(socket, event, 'invalid');
      const meta = newRoomMeta({
        kind: data.kind,
        queueMode: data.queueMode,
        maxPlayers: data.maxPlayers,
        contentHash: data.contentHash,
        spectatable: data.spectatable,
      });
      meta.reclaimed = !!data.resume;
      const room = balatroHub.host(socket.id, me, meta, data.resume);
      if (room === 'room-limit') return fail(socket, event, 'room-limit');
      if (room === 'code-taken') return fail(socket, event, 'not-host');
      seat(room, me.userId);
      rememberPeer(room, room.hostPeerId, me.userId);
      logger.info({ event: 'balatro_p2p_room_hosted', code: room.code, kind: meta.kind, reclaimed: meta.reclaimed });
      sendHosted(room);
    },

    'balatro:p2p:join': (data) => {
      const event = 'balatro:p2p:join';
      const me = account(event);
      if (!me) return;
      const room = balatroHub.room(data.code);
      if (!room) return fail(socket, event, 'not-found');
      if (room.meta.contentHash !== data.contentHash) return fail(socket, event, 'version-mismatch');
      if (room.kicked.has(me.userId)) return fail(socket, event, 'kicked');
      if (room.host.userId === me.userId || balatroHub.hostedBy(socket.id)) return fail(socket, event, 'invalid');
      const held = seatOf(me.userId);
      if (held && held !== room) return fail(socket, event, 'seat-held', held.code);
      if (isForfeited(room, me.userId)) return fail(socket, event, 'forfeited');
      const state = room.meta.state;
      const rejoin = room.meta.seats.has(me.userId);
      if (data.role === 'spectator') {
        if (!room.meta.spectatable) return fail(socket, event, 'invalid');
        const mine = entriesOf(room, me.userId).filter((m) => m.role === 'spectator' && m.socketId).length;
        if (spectatorCount(room) - mine >= BALATRO_LIMITS.MAX_SPECTATORS) return fail(socket, event, 'full');
      } else if (!rejoin) {
        if (state?.started) return fail(socket, event, 'started');
        if (state && !state.open) return fail(socket, event, 'full');
        const cap = Math.min(room.meta.maxPlayers, BALATRO_LIMITS.MAX_PLAYERS);
        if (playerCount(room, me.userId) >= cap) return fail(socket, event, 'full');
      }
      // The same account from another tab, or back after a drop: the old entries go quietly.
      for (const old of entriesOf(room, me.userId)) balatroHub.removeMember(room, old);
      dropPendingElsewhere(io, me.userId, room);
      const member = balatroHub.addMember(room, socket.id, me, data.role, { rejoin });
      if (!member) return fail(socket, event, 'full');
      rememberPeer(room, member.peerId, me.userId);
      socket.emit(BALATRO_S2C_EVENTS['balatro:p2p:joining'], {
        code: room.code,
        peerId: member.peerId,
        hostUserId: room.host.userId,
      } satisfies BalatroS2CPayload<'balatro:p2p:joining'>);
      // With the host away the request waits; it is sent when the host resumes or is replaced.
      emitTo(io, room.hostSocketId, 'balatro:p2p:join-request', joinRequest(room, member));
    },

    'balatro:p2p:admit': (data) => {
      const event = 'balatro:p2p:admit';
      if (!account(event)) return;
      const room = hosted(event);
      if (!room) return;
      const member = room.members.get(data.peerId);
      if (!member || !member.socketId) return fail(socket, event, 'not-found');
      if (!data.accept) {
        balatroHub.removeMember(room, member);
        unseat(room, member.account.userId);
        emitTo(io, member.socketId, 'balatro:p2p:rejected', { code: room.code, reason: data.reason ?? 'host-refused' });
        return;
      }
      if (member.role === 'player' && !seat(room, member.account.userId)) {
        // Seated elsewhere since it asked (a race with another tab): it cannot hold two seats.
        balatroHub.removeMember(room, member);
        emitTo(io, member.socketId, 'balatro:p2p:rejected', { code: room.code, reason: 'seat-held' });
        emitTo(io, room.hostSocketId, 'balatro:p2p:member-left', {
          peerId: member.peerId,
          userId: member.account.userId,
          reason: 'left',
        });
        return;
      }
      balatroHub.admit(member);
      emitTo(io, member.socketId, 'balatro:p2p:admitted', {
        code: room.code,
        ice: iceFor(member.account.userId),
        hostPeerId: room.hostPeerId,
      });
    },

    'balatro:p2p:signal': (data) => {
      const event = 'balatro:p2p:signal';
      if (!account(event)) return;
      const route = balatroHub.routeSignal(socket.id, data.to);
      if (route === 'not-found' || route === 'invalid') return fail(socket, event, route);
      const out: BalatroS2CPayload<'balatro:p2p:signal'> = data.description
        ? { from: route.from, description: data.description }
        : { from: route.from, candidate: data.candidate };
      emitTo(io, route.toSocketId, 'balatro:p2p:signal', out);
    },

    'balatro:p2p:relay:start': () => {
      const event = 'balatro:p2p:relay:start';
      if (!account(event)) return;
      // The host has nothing to start: a member asks, and the host addresses it by its slot.
      if (balatroHub.hostedBy(socket.id)) return;
      const started = balatroHub.startRelay(socket.id);
      if (typeof started === 'string') return fail(socket, event, started);
      logger.info({ event: 'balatro_p2p_relay_start', code: started.room.code, relayed: balatroHub.relayedCount(started.room) });
    },

    /** The relay hot path: silent drops only (an error per packet would double a flood). */
    'balatro:p2p:relay': (bytes) => {
      if (!account('balatro:p2p:relay')) return;
      const verdict = balatroHub.relay(socket.id, bytes);
      if (verdict.kind === 'drop') return;
      if (verdict.kind === 'overflow') {
        balatroHub.stopRelay(verdict.member);
        logger.warn({ event: 'balatro_p2p_relay_overflow', code: verdict.room.code });
        const target = io.sockets.sockets.get(verdict.member.socketId ?? '');
        if (target) fail(target, 'balatro:p2p:relay', 'rate-limited');
        return;
      }
      const target = io.sockets.sockets.get(verdict.toSocketId);
      if (!target) return;
      const name = BALATRO_S2C_EVENTS['balatro:p2p:relay'];
      if (verdict.reliable) {
        target.emit(name, verdict.frame);
        return;
      }
      // Unreliable (pings): dropped when the receiver is backed up.
      const backlog = (target as unknown as { conn?: { writeBuffer?: unknown[] } }).conn?.writeBuffer?.length;
      if (backlog === undefined) target.volatile.emit(name, verdict.frame);
      else if (backlog <= RELAY_UNRELIABLE_BACKLOG) target.emit(name, verdict.frame);
    },

    'balatro:p2p:state': (data) => {
      const event = 'balatro:p2p:state';
      if (!account(event)) return;
      const room = hosted(event);
      if (!room) return;
      const state = {
        ...data,
        summary: {
          players: Math.max(0, Math.min(BALATRO_LIMITS.MAX_PLAYERS, data.summary.players)),
          ante: data.summary.ante === null ? null : Math.max(-100, Math.min(10_000, data.summary.ante)),
        },
      };
      room.meta.state = state;
      room.meta.spectatable = state.spectatable;
      const named = state.successor ? room.members.get(state.successor) : undefined;
      room.successor = named && canSucceed(named) ? named.peerId : null;
      if (room.meta.reclaimed) {
        // After a hub restart the host re-declares who holds a seat (R-08), once.
        room.meta.reclaimed = false;
        for (const userId of state.members) if (userId && !room.kicked.has(userId)) seat(room, userId);
      }
    },

    'balatro:p2p:kick': (data) => {
      const event = 'balatro:p2p:kick';
      if (!account(event)) return;
      const room = hosted(event);
      if (!room) return;
      if (data.peerId === room.hostPeerId) return fail(socket, event, 'invalid');
      const member = room.members.get(data.peerId);
      const userId = member?.account.userId ?? room.meta.peerUsers.get(data.peerId);
      if (!userId || userId === room.host.userId) return fail(socket, event, 'not-found');
      room.kicked.add(userId);
      unseat(room, userId);
      for (const m of entriesOf(room, userId)) {
        balatroHub.removeMember(room, m);
        emitTo(io, m.socketId, 'balatro:p2p:rejected', { code: room.code, reason: 'kicked' });
      }
      socket.emit(BALATRO_S2C_EVENTS['balatro:p2p:member-left'], {
        peerId: data.peerId,
        userId,
        reason: 'kicked',
      } satisfies BalatroS2CPayload<'balatro:p2p:member-left'>);
    },

    'balatro:p2p:forfeit-seat': (data) => {
      const event = 'balatro:p2p:forfeit-seat';
      if (!account(event)) return;
      const room = hosted(event);
      if (!room) return;
      if (!data.userId || !data.runId || data.userId === room.host.userId) return fail(socket, event, 'invalid');
      forfeit(room, data.runId, data.userId);
      unseat(room, data.userId);
      // A forfeited account that is not connected leaves no entry behind.
      for (const m of entriesOf(room, data.userId)) if (!m.socketId) balatroHub.removeMember(room, m);
    },

    'balatro:p2p:leave': () => {
      const event = 'balatro:p2p:leave';
      const me = account(event);
      if (!me) return;
      const room = balatroHub.hostedBy(socket.id);
      if (room) {
        unseat(room, me.userId);
        hostLeaves(io, room);
        return;
      }
      const mine = balatroHub.memberOf(socket.id);
      if (mine) {
        unseat(mine.room, me.userId);
        dropMember(io, mine.room, mine.member, 'left');
        return;
      }
      // Not in a room on this socket: give up a seat held from an earlier one ("Seat held" → Leave).
      const held = seatOf(me.userId);
      if (!held) return;
      unseat(held, me.userId);
      if (held.host.userId === me.userId) {
        // Its own room, whose host socket is gone: hand it over now rather than after the grace.
        if (!held.hostSocketId) hostLeaves(io, held);
        return;
      }
      const entries = entriesOf(held, me.userId);
      for (const m of entries) dropMember(io, held, m, 'left');
      if (entries.length === 0) {
        const peerId = lastPeerOf(held, me.userId);
        if (peerId) emitTo(io, held.hostSocketId, 'balatro:p2p:member-left', { peerId, userId: me.userId, reason: 'left' });
      }
    },

    'balatro:p2p:close': () => {
      const event = 'balatro:p2p:close';
      if (!account(event)) return;
      const room = hosted(event);
      if (!room) return;
      closeRoom(io, room, 'host-closed');
    },

    'balatro:seat:query': () => {
      const me = account('balatro:seat:query');
      if (!me) return;
      const room = seatOf(me.userId);
      socket.emit(BALATRO_S2C_EVENTS['balatro:seat'], {
        code: room?.code ?? null,
        hostOnline: !!room?.hostSocketId,
        runId: room?.meta.state?.runId ?? null,
        started: room?.meta.state?.started ?? false,
      } satisfies BalatroS2CPayload<'balatro:seat'>);
    },
  };

  bindEvents(socket, P2P_EVENTS, handlers, {
    app: 'balatro',
    logger,
    rateLimit: checkRateLimit,
    onRateLimited: (sock, name) => {
      if (name !== 'balatro:p2p:relay') fail(sock, name, 'rate-limited');
    },
  });
}

/** The socket went: a host's room is held for its grace; a member's seat stays, its entry may not. */
export function handleBalatroP2pDisconnect(io: Server, socket: Socket): void {
  const mine = balatroHub.memberOf(socket.id);
  if (mine) {
    const { room, member } = mine;
    if (member.admitted && member.role === 'player') {
      balatroHub.detachMember(room, member);
      emitTo(io, room.hostSocketId, 'balatro:p2p:member-away', { peerId: member.peerId, away: true });
    } else {
      dropMember(io, room, member, 'disconnected');
    }
  }
  balatroHub.hostDisconnected(socket.id, (room) =>
    balatroHub.successorFor(room, canSucceed) ? BALATRO_LIMITS.MIGRATE_GRACE_MS : BALATRO_LIMITS.HOST_GRACE_MS,
  );
}

/** Test seam: forget every room, seat and timer. */
export function resetBalatroP2pForTests(): void {
  resetBalatroDirectoryForTests();
  timeoutBound = false;
  setBalatroHostTimeoutHandler(null);
}

export type BalatroP2pPayload<K extends P2pEvent> = z.infer<(typeof P2P_EVENTS)[K]['c2s']>;
