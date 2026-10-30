/**
 * Balatro multiplayer — casual matchmaking, party queueing, lobby invites and
 * the spectate directory on the games hub (`balatro:queue:*`,
 * `balatro:party:queue`, `balatro:invite`, `balatro:spectate:list`; contract:
 * lib/balatro/net/events.ts, PLAN §3.a; MM-01…07, LOB-04, D-33; WS12).
 *
 * Every event needs a signed-in account (`auth-required`) and is rate limited
 * (config.ts). The lobby itself still runs in its host's browser; the hub only
 * decides who plays together and who hosts:
 *
 *   1. **Queue.** `queue:join` puts a free player (no seat, no room on this
 *      socket) into the bucket of its mode and content hash; `party:queue`
 *      (the party host only, from its `party` room) puts the host plus every
 *      admitted, connected player of the party in as one ticket. Everyone on
 *      a ticket gets `queue:status {searching, waiting}` whenever the bucket
 *      changes. `queue:leave`, or any ticket socket dropping, cancels the
 *      whole ticket (`cancelled`).
 *   2. **Match** (queue.ts): oldest first, up to the mode's maximum, a short
 *      group after the 10 s gather window. A party's room is closed quietly
 *      (its seats released, no `closed` event: its players are about to sit
 *      down in the match), then the earliest player gets
 *      `matched {role:'host', waiting:n}` and the others `matched {role:'member'}`.
 *   3. **Host claim.** The elected host creates the room with an ordinary
 *      `balatro:p2p:host {kind:'casual'}` (handlers/balatro-p2p.ts). The hub
 *      watches for that room (same account, mode and hash) and then sends
 *      each member `matched {role:'member', code, waiting:n}`. If the host
 *      does not host within 15 s, or drops, the match falls through: solo
 *      members go back into the queue at their old place, party members and
 *      the host are told `cancelled`.
 *   4. **Invite** (LOB-04): only into a room the inviter holds a seat in, only
 *      to a mutual follow (both directions, the party.ts anti-spam check made
 *      stricter), at most `INVITES_PER_MIN` per account. Online invitees get
 *      `balatro:invited` on every hub socket; an invitee with none gets a
 *      notification row linking to `/balatro?lobby=CODE` (once per lobby per
 *      10 minutes).
 *   5. **Spectate list** (MM-07): spectatable rooms whose host is connected.
 *
 * NOTE: server code imports `lib/` RELATIVELY — server/CLAUDE.md gotcha 7.
 */

import type { Server, Socket } from 'socket.io';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { getPrismaClient } from '../prisma-client';
import { bindEvents, type Handlers } from '../../shared/typed-socket';
import {
  BALATRO_S2C_EVENTS,
  type BalatroHubErrorCode,
  type BalatroS2CEvent,
  type BalatroS2CPayload,
  type QueueMode,
} from '../../../lib/balatro/net/events';
import { BALATRO_LIMITS } from '../../../lib/balatro/net/limits';
import { LOBBY_LINK_PARAM } from '../../../lib/lobby-link';
import { balatroAccount, pickBalatroEvents } from './balatro-p2p';
import { balatroHub, listSpectatableLobbies, seatOf, unseatAll, type BalatroRoom } from '../balatro/directory';
import {
  InviteBudget,
  NotifyDedupe,
  QUEUE_TIMING,
  QueueBook,
  queueModeMax,
  type QueueMatch,
  type QueuePlayer,
  type QueueTicket,
} from '../balatro/queue';

export const BALATRO_QUEUE_C2S_EVENTS = [
  'balatro:queue:join',
  'balatro:queue:leave',
  'balatro:party:queue',
  'balatro:invite',
  'balatro:spectate:list',
] as const;
type QueueEvent = (typeof BALATRO_QUEUE_C2S_EVENTS)[number];

const QUEUE_EVENTS = pickBalatroEvents(BALATRO_QUEUE_C2S_EVENTS);

/* ─── The social seam (follows, notifications) ───────────────────────────── */

export interface BalatroSocialStore {
  /** Both accounts follow each other. */
  isMutual(a: string, b: string): Promise<boolean>;
  /** A notification for an invitee with no hub socket. */
  notifyInvite(n: { toUserId: string; fromUserId: string; fromName: string; code: string }): Promise<void>;
}

const prismaStore: BalatroSocialStore = {
  async isMutual(a, b) {
    const n = await getPrismaClient().follow.count({
      where: {
        OR: [
          { followerId: a, followingId: b },
          { followerId: b, followingId: a },
        ],
      },
    });
    return n >= 2;
  },
  async notifyInvite({ toUserId, fromUserId, fromName, code }) {
    await getPrismaClient().notification.create({
      data: {
        userId: toUserId,
        actorId: fromUserId,
        type: 'SYSTEM',
        entityType: 'balatro_lobby',
        entityId: code,
        preview: `${fromName} invited you to a Balatro lobby`.slice(0, 280),
        link: `/balatro?${LOBBY_LINK_PARAM}=${code}`,
      },
    });
  },
};

let store: BalatroSocialStore = prismaStore;

/** Test seam: a fake follow graph and notification sink (null restores Prisma). */
export function setBalatroSocialStoreForTests(s: BalatroSocialStore | null): void {
  store = s ?? prismaStore;
}

/* ─── State ──────────────────────────────────────────────────────────────── */

interface PendingMatch {
  queueMode: QueueMode;
  contentHash: string;
  host: QueuePlayer;
  members: QueuePlayer[];
  /** The member tickets, for a fall-through re-queue. */
  tickets: QueueTicket[];
  waiting: number;
  deadline: number;
}

const book = new QueueBook();
const budget = new InviteBudget();
const dedupe = new NotifyDedupe();
const pending = new Set<PendingMatch>();
/** userId → its hub sockets (every connected socket registers here). */
const userSockets = new Map<string, Set<string>>();
let ioRef: Server | null = null;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function unref<T>(t: T): T {
  (t as { unref?: () => void }).unref?.();
  return t;
}

/* ─── Emitting ───────────────────────────────────────────────────────────── */

function emitTo<K extends BalatroS2CEvent>(socketId: string, event: K, payload: BalatroS2CPayload<K>): void {
  ioRef?.sockets.sockets.get(socketId)?.emit(event, payload);
}

function fail(socket: Socket, event: string, code: BalatroHubErrorCode, heldCode?: string): void {
  const payload: BalatroS2CPayload<'balatro:p2p:error'> = { event, code };
  if (heldCode) payload.heldCode = heldCode;
  socket.emit(BALATRO_S2C_EVENTS['balatro:p2p:error'], payload);
}

function status(socketId: string, payload: BalatroS2CPayload<'balatro:queue:status'>): void {
  emitTo(socketId, 'balatro:queue:status', payload);
}

function socketAlive(socketId: string): boolean {
  return !!ioRef?.sockets.sockets.get(socketId);
}

/** Everyone waiting in this bucket learns the new head count. */
function announceBucket(queueMode: QueueMode, contentHash: string): void {
  const waiting = book.waiting(queueMode, contentHash);
  for (const t of book.all()) {
    if (t.queueMode !== queueMode || t.contentHash !== contentHash) continue;
    for (const p of t.players) status(p.socketId, { state: 'searching', queueMode, waiting });
  }
}

/* ─── Tickets ────────────────────────────────────────────────────────────── */

function cancelTicket(ticket: QueueTicket, why: string): void {
  if (!book.remove(ticket)) return;
  for (const p of ticket.players) status(p.socketId, { state: 'cancelled', queueMode: ticket.queueMode });
  logger.info({ event: 'balatro_queue_cancelled', queueMode: ticket.queueMode, players: ticket.players.length, why });
  announceBucket(ticket.queueMode, ticket.contentHash);
}

function enqueue(t: Omit<QueueTicket, 'id'>): void {
  for (const p of t.players) {
    const old = book.ticketOf(p.userId);
    if (old) cancelTicket(old, 'replaced');
    cancelPendingFor(p.userId);
  }
  book.add(t);
  announceBucket(t.queueMode, t.contentHash);
  runMatching();
}

/** Why this player cannot sit down in a match right now (null = free). */
function busy(p: QueuePlayer, partyCode: string | null): string | null {
  if (!socketAlive(p.socketId)) return 'gone';
  const seat = seatOf(p.userId);
  if (seat && seat.code !== partyCode) return 'seated';
  const hosted = balatroHub.hostedBy(p.socketId);
  if (hosted && hosted.code !== partyCode) return 'hosting';
  const mine = balatroHub.memberOf(p.socketId);
  if (mine && mine.room.code !== partyCode) return 'in-room';
  return null;
}

/** A party ticket is still good: its room lives, under the same host, and nobody on it is busy elsewhere. */
function ticketValid(t: QueueTicket): boolean {
  if (t.partyCode) {
    const room = balatroHub.room(t.partyCode);
    if (!room || room.meta.kind !== 'party' || room.hostSocketId !== t.players[0].socketId) return false;
  }
  return t.players.every((p) => busy(p, t.partyCode) === null);
}

/* ─── Matching ───────────────────────────────────────────────────────────── */

function scheduleWake(): void {
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = null;
  const now = Date.now();
  const at = book.nextWake(now);
  if (at === null) return;
  wakeTimer = unref(setTimeout(() => {
    wakeTimer = null;
    runMatching();
  }, Math.max(0, at - now)));
}

function runMatching(): void {
  for (;;) {
    const matches = book.takeMatches(Date.now());
    if (matches.length === 0) break;
    for (const m of matches) startMatch(m);
  }
  scheduleWake();
}

/** Close a party room without telling its members: they are about to meet again in the match. */
function closePartyQuietly(room: BalatroRoom): void {
  unseatAll(room);
  balatroHub.close(room);
  logger.info({ event: 'balatro_party_matched', code: room.code });
}

function startMatch(m: QueueMatch): void {
  // Anything that went stale while waiting (a socket gone, a seat taken elsewhere, a party
  // room closed) drops out; the rest go back in at their old place if the group no longer holds.
  const good = m.tickets.filter(ticketValid);
  for (const t of m.tickets) {
    if (good.includes(t)) continue;
    for (const p of t.players) status(p.socketId, { state: 'cancelled', queueMode: t.queueMode });
  }
  if (good.length !== m.tickets.length) {
    for (const t of good) book.add(t);
    for (const t of good) announceBucket(t.queueMode, t.contentHash);
    return;
  }
  for (const t of good) {
    const room = t.partyCode ? balatroHub.room(t.partyCode) : null;
    if (room) closePartyQuietly(room);
  }
  const players = good.flatMap((t) => t.players);
  const host = players[0];
  const members = players.slice(1);
  const waiting = players.length;
  status(host.socketId, { state: 'matched', queueMode: m.queueMode, role: 'host', waiting });
  for (const p of members) status(p.socketId, { state: 'matched', queueMode: m.queueMode, role: 'member', waiting });
  pending.add({
    queueMode: m.queueMode,
    contentHash: m.contentHash,
    host,
    members,
    tickets: good.filter((t) => t.players[0] !== host || t.players.length > 1),
    waiting,
    deadline: Date.now() + QUEUE_TIMING.HOST_CLAIM_MS,
  });
  logger.info({ event: 'balatro_queue_matched', queueMode: m.queueMode, players: waiting, tickets: good.length });
  ensurePoll();
  announceBucket(m.queueMode, m.contentHash);
}

function ensurePoll(): void {
  if (pollTimer || pending.size === 0) return;
  pollTimer = unref(setInterval(pollPending, QUEUE_TIMING.HOST_POLL_MS));
}

function stopPollIfIdle(): void {
  if (pending.size > 0 || !pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

/** The casual room the elected host made for this match, or null. */
function claimedRoom(p: PendingMatch): BalatroRoom | null {
  const room = balatroHub.hostedBy(p.host.socketId);
  if (!room || room.host.userId !== p.host.userId) return null;
  const meta = room.meta;
  if (meta.kind !== 'casual' || meta.queueMode !== p.queueMode || meta.contentHash !== p.contentHash) return null;
  return room;
}

function pollPending(): void {
  const now = Date.now();
  for (const p of [...pending]) {
    const room = claimedRoom(p);
    if (room) {
      pending.delete(p);
      for (const m of p.members) {
        status(m.socketId, { state: 'matched', queueMode: p.queueMode, role: 'member', code: room.code, waiting: p.waiting });
      }
      logger.info({ event: 'balatro_queue_lobby_ready', code: room.code, players: p.waiting });
      continue;
    }
    if (now >= p.deadline || !socketAlive(p.host.socketId)) fallThrough(p, 'host-missing');
  }
  stopPollIfIdle();
}

/** The host never hosted: solo members queue again where they were; everyone else is cancelled. */
function fallThrough(p: PendingMatch, why: string): void {
  if (!pending.delete(p)) return;
  status(p.host.socketId, { state: 'cancelled', queueMode: p.queueMode });
  const requeue: QueueTicket[] = [];
  for (const t of p.tickets) {
    const members = t.players.filter((pl) => pl.userId !== p.host.userId);
    const solo = t.partyCode === null && members.length === 1;
    for (const pl of members) {
      if (solo && busy(pl, null) === null && !book.ticketOf(pl.userId)) requeue.push(t);
      else status(pl.socketId, { state: 'cancelled', queueMode: p.queueMode });
    }
  }
  for (const t of requeue) book.add({ ...t, players: t.players.filter((pl) => pl.userId !== p.host.userId) });
  logger.info({ event: 'balatro_queue_fell_through', queueMode: p.queueMode, requeued: requeue.length, why });
  announceBucket(p.queueMode, p.contentHash);
  runMatching();
  stopPollIfIdle();
}

/** This account leaves any match still waiting for its host. */
function cancelPendingFor(userId: string): void {
  for (const p of [...pending]) {
    if (p.host.userId === userId) {
      fallThrough(p, 'host-left');
      continue;
    }
    const i = p.members.findIndex((m) => m.userId === userId);
    if (i >= 0) {
      status(p.members[i].socketId, { state: 'cancelled', queueMode: p.queueMode });
      p.members.splice(i, 1);
      p.tickets = p.tickets.filter((t) => !t.players.some((pl) => pl.userId === userId));
    }
  }
}

/* ─── Registration ───────────────────────────────────────────────────────── */

export function registerBalatroQueueHandlers(io: Server, socket: Socket): void {
  ioRef = io;
  const acct = balatroAccount(socket);
  if (acct) {
    const set = userSockets.get(acct.userId) ?? new Set<string>();
    set.add(socket.id);
    userSockets.set(acct.userId, set);
  }

  const account = (event: QueueEvent) => {
    const a = balatroAccount(socket);
    if (!a) fail(socket, event, 'auth-required');
    return a;
  };

  /** Queue the party hosted on this socket as one ticket. */
  const queueParty = (event: QueueEvent, code: string, queueMode: QueueMode, contentHash?: string) => {
    const room = balatroHub.hostedBy(socket.id);
    if (!room || room.code !== code || room.meta.kind !== 'party') return fail(socket, event, 'not-host');
    if (contentHash && room.meta.contentHash !== contentHash) return fail(socket, event, 'version-mismatch');
    if (room.meta.state?.started) return fail(socket, event, 'started');
    const players: QueuePlayer[] = [{ userId: room.host.userId, socketId: socket.id }];
    for (const m of room.members.values()) {
      if (m.role !== 'player' || !m.admitted || !m.socketId) continue;
      if (players.some((p) => p.userId === m.account.userId)) continue;
      players.push({ userId: m.account.userId, socketId: m.socketId });
    }
    // A party never fills a match on its own (it would only play itself).
    if (players.length > BALATRO_LIMITS.PARTY_MAX || players.length >= queueModeMax(queueMode)) {
      return fail(socket, event, 'full');
    }
    const ticket: Omit<QueueTicket, 'id'> = {
      queueMode,
      contentHash: room.meta.contentHash,
      enqueuedAt: Date.now(),
      players,
      partyCode: room.code,
    };
    if (!players.every((p) => busy(p, room.code) === null)) return fail(socket, event, 'invalid');
    enqueue(ticket);
    logger.info({ event: 'balatro_party_queued', code: room.code, queueMode, players: players.length });
  };

  const handlers: Handlers<typeof QUEUE_EVENTS> = {
    'balatro:queue:join': (data) => {
      const event = 'balatro:queue:join';
      const me = account(event);
      if (!me) return;
      if (data.partyCode) return queueParty(event, data.partyCode, data.queueMode, data.contentHash);
      const held = seatOf(me.userId);
      if (held) return fail(socket, event, 'seat-held', held.code);
      if (balatroHub.hostedBy(socket.id) || balatroHub.memberOf(socket.id)) return fail(socket, event, 'invalid');
      const current = book.ticketOf(me.userId);
      if (current?.partyCode) return fail(socket, event, 'invalid');
      if (
        current &&
        current.queueMode === data.queueMode &&
        current.contentHash === data.contentHash &&
        current.players[0].socketId === socket.id
      ) {
        // Idempotent: the same search again just repeats the status.
        status(socket.id, { state: 'searching', queueMode: data.queueMode, waiting: book.waiting(data.queueMode, data.contentHash) });
        return;
      }
      enqueue({
        queueMode: data.queueMode,
        contentHash: data.contentHash,
        enqueuedAt: Date.now(),
        players: [{ userId: me.userId, socketId: socket.id }],
        partyCode: null,
      });
    },

    'balatro:queue:leave': () => {
      const me = account('balatro:queue:leave');
      if (!me) return;
      const ticket = book.ticketOf(me.userId);
      if (ticket) cancelTicket(ticket, 'left');
      cancelPendingFor(me.userId);
      runMatching();
    },

    'balatro:party:queue': (data) => {
      const event = 'balatro:party:queue';
      if (!account(event)) return;
      queueParty(event, data.code, data.queueMode);
    },

    'balatro:invite': async (data) => {
      const event = 'balatro:invite';
      const me = account(event);
      if (!me) return;
      const to = data.toUserId;
      if (!to || to === me.userId) return fail(socket, event, 'invalid');
      const room = balatroHub.room(data.code);
      if (!room || seatOf(me.userId) !== room) return fail(socket, event, 'not-found');
      if (!budget.take(me.userId, Date.now())) return fail(socket, event, 'rate-limited');
      const mutual = await store.isMutual(me.userId, to).catch((err: unknown) => {
        logger.warn({ event: 'balatro_invite_follow_check_failed', err: String(err) });
        return false;
      });
      if (!mutual) return fail(socket, event, 'invalid');
      if (!balatroHub.room(data.code)) return fail(socket, event, 'not-found');
      const invited: BalatroS2CPayload<'balatro:invited'> = { code: data.code, fromUserId: me.userId, fromName: me.name };
      const sockets = [...(userSockets.get(to) ?? [])].filter(socketAlive);
      for (const id of sockets) emitTo(id, 'balatro:invited', invited);
      if (sockets.length === 0 && dedupe.take(to, data.code, Date.now())) {
        store
          .notifyInvite({ toUserId: to, fromUserId: me.userId, fromName: me.name, code: data.code })
          .catch((err: unknown) => logger.warn({ event: 'balatro_invite_notify_failed', err: String(err) }));
      }
      logger.info({ event: 'balatro_invite_sent', code: data.code, online: sockets.length > 0 });
    },

    'balatro:spectate:list': () => {
      if (!account('balatro:spectate:list')) return;
      socket.emit(BALATRO_S2C_EVENTS['balatro:spectate:lobbies'], {
        lobbies: listSpectatableLobbies(),
      } satisfies BalatroS2CPayload<'balatro:spectate:lobbies'>);
    },
  };

  bindEvents(socket, QUEUE_EVENTS, handlers, {
    app: 'balatro',
    logger,
    rateLimit: checkRateLimit,
    onRateLimited: (sock, name) => fail(sock, name, 'rate-limited'),
  });
}

/** The socket went: its tickets are cancelled (a whole party with it), a pending host falls through. */
export function handleBalatroQueueDisconnect(_io: Server, socket: Socket): void {
  const acct = balatroAccount(socket);
  if (acct) {
    const set = userSockets.get(acct.userId);
    set?.delete(socket.id);
    if (set && set.size === 0) userSockets.delete(acct.userId);
  }
  for (const t of book.ticketsOnSocket(socket.id)) cancelTicket(t, 'disconnected');
  for (const p of [...pending]) {
    if (p.host.socketId === socket.id) fallThrough(p, 'host-disconnected');
    else if (acct && p.members.some((m) => m.socketId === socket.id)) cancelPendingFor(acct.userId);
  }
  stopPollIfIdle();
  runMatching();
}

/** Test seam: forget every ticket, pending match, invite budget and timer. */
export function resetBalatroQueueForTests(): void {
  book.clear();
  budget.clear();
  dedupe.clear();
  pending.clear();
  userSockets.clear();
  if (wakeTimer) clearTimeout(wakeTimer);
  if (pollTimer) clearInterval(pollTimer);
  wakeTimer = null;
  pollTimer = null;
  ioRef = null;
  store = prismaStore;
}

/** Test seam: what the queue holds. */
export function balatroQueueSnapshotForTests(): { tickets: QueueTicket[]; pending: number } {
  return { tickets: book.all(), pending: pending.size };
}
