/**
 * Group voice calls — mesh signalling relay.
 *
 * The group sibling of `handlers/call.ts`, and the same shape of thing: the
 * server never sees audio. Every participant holds a direct peer connection to
 * every other participant (`lib/groupcall/events.ts` argues the mesh, and why it
 * stops at eight), so this handler's whole job is to be the authority on the
 * facts a client cannot be trusted with — who may ring whom, who may walk into
 * an open room, who is already busy, when a ring gives up, and which single
 * socket is a given user's media leg.
 *
 * ## The three addressing modes, which are not interchangeable
 *
 * 1. **Ringing** goes to `user:<userId>`, so an ad-hoc call rings every tab the
 *    person has open and they can answer on whichever one they like. Same as
 *    the 1:1 handler.
 * 2. **Media/signalling** goes to one socket id — the socket that sent `JOIN`,
 *    which is the tab holding the microphone. Sending SDP to the user room
 *    instead would hand a second tab half a negotiation and produce a duplicate,
 *    dead mesh leg for every peer in the room.
 * 3. **Roster/state** goes to the socket room `gcall:<callId>`, plus the user
 *    rooms of anyone still ringing — they are not in the socket room (they have
 *    not accepted anything) but the incoming-call card shows the roster, and
 *    `reduce()` in `lib/groupcall/state.ts` accepts `peer-joined`/`peer-left`
 *    in the `incoming` phase for exactly that reason.
 *
 * ## Identity is the userId
 *
 * Nothing on this wire mentions sockets. A participant is a user; the bound
 * media socket is an implementation detail this file keeps to itself.
 *
 * ## When a room ends (the deliberate asymmetry)
 *
 * - **Ad-hoc** ends as soon as fewer than two people are joined and nobody is
 *   still ringing. A mesh of one is over: the room was *about* the people who
 *   were rung, and leaving the host sitting alone in it would be a call that
 *   never hangs up.
 * - **An open community/party room lingers at one person, and only closes when
 *   it reaches zero.** This is the one place the "fewer than two ends it" rule
 *   is wrong. Being first into a voice room and waiting for company is the
 *   entire point of an open room — it is what `gcall:active`'s "Join voice · 1"
 *   pill advertises — and ending the room the instant the second person leaves
 *   would evict the person still sitting in it and make the pill vanish, so the
 *   room could only ever be re-formed by someone pressing Start again. A room
 *   of one costs a Map entry and a socket.io room; no peer connections exist.
 *
 * ## Persistence
 *
 * Fire-and-forget, always, and serialised per call so the `GroupCall` row
 * exists before its `GroupCallParticipant` children reference it. Nothing in a
 * signalling path ever awaits the database.
 *
 * Rate-limit rules live in `config.ts#SOCKET_RATE_LIMITS` under `gcall:*`.
 *
 * Registered per-connection from `index.ts`:
 *   registerGroupCallHandlers(io, socket)
 *   handleGroupCallDisconnect(io, socket)   // in the disconnect block
 */

import { randomBytes } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../prisma-client';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { claimBusy, getBusy, releaseBusy } from '../busy-registry';
import { isPartyMember, onPartyMemberRemoved } from './party';
import {
  GCALL_C2S,
  GCALL_S2C,
  GROUP_RING_TIMEOUT_MS,
  MAX_GROUP_CALL_INVITES,
  MAX_GROUP_CALL_PARTICIPANTS,
  MAX_ICE_BYTES,
  MAX_SDP_BYTES,
  isGroupCallOrigin,
} from '../../../lib/groupcall/events';
import type {
  CallPeer,
  GroupCallEndReason,
  GroupCallErrorCode,
  GroupCallLeaveReason,
  GroupCallOrigin,
  GroupCallParticipantView,
  GroupCallRejectReason,
  OpenRoomOrigin,
} from '../../../lib/groupcall/events';
import {
  canJoinGroupCall,
  canJoinOpenRoom,
  isRosterFull,
  persistedOrigin,
  persistedParticipantStatus,
  persistedStatus,
  shouldOffer,
} from '../../../lib/groupcall/state';
import { isCallPrivacy, type CallPrivacy } from '../../../lib/call/state';
import { userChipSelect } from '../../../lib/user-display';
import { PEER_GRACE_MS } from '../../../lib/shared/realtime/types';

/** cuid is 25 chars, uuidv7 36, `GroupCall.partyId` is VarChar(64). */
const MAX_ID_LENGTH = 64;

/**
 * How many roster rows ride along on `gcall:active`.
 *
 * The payload feeds a stack of avatars on a "Join voice" pill, not a roster —
 * the contract says the server trims it, and four is what a stack shows before
 * it collapses into "+3".
 */
const ACTIVE_AVATAR_LIMIT = 4;

/**
 * Which refusal wins when a whole `START` has to be refused with one reason.
 *
 * Ordered by how *final* the answer is: a block is permanent, a privacy setting
 * is a decision, busy and offline are both "try later". The strongest reason is
 * the honest summary of a call that could not be placed to anybody.
 */
const REJECT_PRECEDENCE: readonly GroupCallRejectReason[] = [
  'blocked',
  'privacy',
  'busy',
  'not-member',
  'full',
  'gone',
  'failed',
];

/* -------------------------------------------------------------------------- */
/* In-memory state                                                            */
/* -------------------------------------------------------------------------- */

interface LiveParticipant {
  userId: string;
  name: string;
  image: string | null;
  handle: string | null;
  /**
   * The socket that sent `JOIN` — this user's single media leg.
   *
   * `null` while they are only ringing. Every SDP and ICE relay is addressed
   * here and nowhere else.
   */
  socketId: string | null;
  muted: boolean;
  /** `null` means invited-and-ringing; see `GroupCallParticipantView.joinedAt`. */
  joinedAt: number | null;
}

/**
 * One live room. Ephemeral by design, exactly like `LiveCall` in `call.ts` — a
 * hub restart drops the rooms and the peers find out through ICE rather than
 * through us. The DB rows left behind are swept by the janitor query the
 * `[status, createdAt]` index in `schema.prisma` exists for.
 */
interface LiveGroupCall {
  id: string;
  hostId: string;
  /** Cached so a mid-call invite's card can name the person who opened the room. */
  host: CallPeer;
  origin: GroupCallOrigin;
  /** Community id or party id; `null` for `adhoc`. */
  originId: string | null;
  conversationId: string | null;
  /** Keyed by userId — the roster, joined and still-ringing alike. */
  participants: Map<string, LiveParticipant>;
  /**
   * Everyone this room has ever admitted — the host plus every invitee who
   * passed the screen. The roster is who is *here*; this is the guest list, and
   * the two are not the same thing once anybody's connection wobbles.
   *
   * An ad-hoc room has no membership rule to re-derive admission from, so
   * without this a participant whose socket drops for two seconds comes back to
   * a room that no longer recognises them — and the client's reconnect path
   * (`rejoinAfterReconnect` in `lib/groupcall/store.ts`) re-sends `JOIN`
   * precisely then. It also lets somebody who declined change their mind, which
   * is a thing the host already consented to by inviting them.
   */
  invited: Set<string>;
  /**
   * Who declined this room. A mid-call invite skips them, so a refusal cannot
   * be answered with another ring, and another; they can still walk back in
   * from the guest list themselves.
   */
  declinedBy: Set<string>;
  /**
   * Per person who left and came back: when they first got in, and the seconds
   * they had already spent here. One history row per person per room, so a
   * re-join adds to it rather than overwriting the first stint.
   */
  earlierStints: Map<string, { firstJoinedAt: number; seconds: number }>;
  /** Ring timers, keyed by the invitee they will give up on. */
  ringTimers: Map<string, ReturnType<typeof setTimeout>>;
  /**
   * Seats held for joined participants whose media socket dropped, keyed by
   * userId. Media is peer-to-peer and usually outlives a signalling blip, and
   * the client re-sends `JOIN` on reconnect; dropping them at once would end
   * every two-person ad-hoc room on the first network hiccup.
   */
  graceTimers: Map<string, ReturnType<typeof setTimeout>>;
  createdAt: number;
  /** The host's own join, which is when the room opened. Drives the call timer. */
  startedAt: number;
  /** Denormalised onto the row so history can say "5 people" without a replay. */
  peakParticipants: number;
  /** Did anyone other than the host ever get in? Decides the persisted status. */
  othersJoined: boolean;
  /** Ad-hoc bookkeeping, to tell "everyone declined" from "nobody answered". */
  rung: number;
  declined: number;
  /**
   * Serialised fire-and-forget write chain.
   *
   * A promise chain rather than N loose `.catch()`es because
   * `GroupCallParticipant` has a foreign key to `GroupCall`: a join that lands
   * before the room's own INSERT would fail on the FK. Chaining costs nothing
   * (nothing awaits it) and makes the ordering a property of the code rather
   * than of how fast the first query happened to be.
   */
  persistChain: Promise<void>;
  /**
   * Admissions to this room, one at a time.
   *
   * Each admission checks blocks against the roster and then awaits before it
   * commits, so two that overlap each see a roster without the other: two
   * people with a block between them could both get in and be meshed. Running
   * them in turn means the second check sees the first person in the room.
   */
  admission: Promise<void>;
}

/**
 * How long a joined participant's seat survives their media socket dropping.
 * The same window the game hubs give a dropped player (`PEER_GRACE_MS`).
 */
export const GROUP_CALL_SEAT_GRACE_MS = PEER_GRACE_MS;

const calls = new Map<string, LiveGroupCall>();
/** userId → callId, so a disconnect can find the room in O(1). */
const byUser = new Map<string, string>();
/** `community:<id>` / `party:<id>` → callId, so an origin can only have one room. */
const byOrigin = new Map<string, string>();

/**
 * How soon one person may ring (or ping) the same person again. Per pair rather
 * than per socket, so neither a second room nor a second tab resets it.
 */
export const RING_COOLDOWN_MS = 30_000;
/** `${from}>${to}` → when `from` last rang or pinged `to`. */
const lastRung = new Map<string, number>();

function recentlyRang(from: string, to: string, now = Date.now()): boolean {
  const at = lastRung.get(`${from}>${to}`);
  return at !== undefined && now - at < RING_COOLDOWN_MS;
}

function noteRang(from: string, to: string, now = Date.now()): void {
  // Bounded without a timer: prune the stale entries once the map is large.
  if (lastRung.size > 10_000) {
    for (const [key, at] of lastRung) if (now - at >= RING_COOLDOWN_MS) lastRung.delete(key);
  }
  lastRung.set(`${from}>${to}`, now);
}

/**
 * Close persisted rooms left behind when the previous signaling process died.
 *
 * Only rows created before `before` (this process's boot) are touched: the
 * sweep runs after the hub is already accepting connections, and a room opened
 * in the meantime is live, not orphaned.
 */
export async function reconcileOrphanedGroupCalls(before: Date): Promise<void> {
  const prisma = getPrismaClient();
  const now = new Date();
  const orphaned = await prisma.groupCall.findMany({
    where: { endedAt: null, status: { in: ['ACTIVE', 'RINGING'] }, createdAt: { lt: before } },
    // Bounded per boot; anything beyond it is swept on the next start.
    take: 200,
    select: {
      id: true,
      status: true,
      participants: {
        where: { status: 'JOINED' },
        select: { userId: true, joinedAt: true },
      },
    },
  });
  if (orphaned.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const call of orphaned) {
      for (const participant of call.participants) {
        await tx.groupCallParticipant.updateMany({
          where: { callId: call.id, userId: participant.userId, status: 'JOINED' },
          data: {
            status: 'LEFT',
            leftAt: now,
            durationSec: participant.joinedAt
              ? Math.max(0, Math.round((now.getTime() - participant.joinedAt.getTime()) / 1000))
              : 0,
          },
        });
      }
    }

    await tx.groupCallParticipant.updateMany({
      where: { callId: { in: orphaned.map((call) => call.id) }, status: 'INVITED' },
      data: { status: 'MISSED', leftAt: now },
    });

    const ringingIds = orphaned.filter((call) => call.status === 'RINGING').map((call) => call.id);
    const activeIds = orphaned.filter((call) => call.status === 'ACTIVE').map((call) => call.id);
    if (ringingIds.length > 0) {
      await tx.groupCall.updateMany({
        where: { id: { in: ringingIds }, endedAt: null, status: 'RINGING' },
        data: { status: 'MISSED', endedAt: now },
      });
    }
    if (activeIds.length > 0) {
      await tx.groupCall.updateMany({
        where: { id: { in: activeIds }, endedAt: null, status: 'ACTIVE' },
        data: { status: 'ENDED', endedAt: now },
      });
    }
    // One update per joined participant (each has its own duration), so a
    // large backlog needs more than Prisma's 5 s interactive default.
  }, { timeout: 30_000 });

  logger.info({ event: 'group_call_orphans_reconciled', count: orphaned.length });
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function callRoom(callId: string): string {
  return `gcall:${callId}`;
}

function originKey(origin: OpenRoomOrigin, originId: string): string {
  return `${origin}:${originId}`;
}

/**
 * The presence room an open room's `gcall:active` pushes land in.
 *
 * Sockets are subscribed by `LOOKUP`: asking whether a community has a voice
 * room is exactly the act of wanting to know when that answer changes, and it
 * is the only origin-addressed event on the contract, so there is nothing else
 * a subscribe could hang off without inventing an event the contract does not
 * have.
 */
function originPresenceRoom(origin: OpenRoomOrigin, originId: string): string {
  return `gcall:origin:${originKey(origin, originId)}`;
}

/**
 * A time-sortable id, matching `GroupCall.id`'s `@default(uuid(7))`.
 *
 * Minted here rather than read back from the INSERT because the row is written
 * fire-and-forget: the room exists in memory the instant the host presses call,
 * and waiting on Postgres to name it would put a database round trip in front
 * of the first ring. `node:crypto`'s `randomUUID` is v4, so the 48-bit
 * big-endian millisecond prefix is laid down by hand.
 */
function uuidV7(): string {
  const bytes = randomBytes(16);
  let ms = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* -------------------------------------------------------------------------- */
/* Payload validation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A payload id, or `''`.
 *
 * Rejects an over-long value rather than truncating it (which `sanitizeString`
 * would): a truncated id is a *different* id, and silently addressing a
 * different room is worse than refusing a malformed request.
 */
function asId(raw: unknown, maxLength = MAX_ID_LENGTH): string {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= maxLength ? raw : '';
}

/** A deduplicated id list, capped. Non-string and over-long entries are dropped. */
function asIdList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const value of raw) {
    const id = asId(value);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

function isDescription(value: object): value is { type: 'offer' | 'answer'; sdp: string } {
  const d = value as { type?: unknown; sdp?: unknown };
  return (d.type === 'offer' || d.type === 'answer') && typeof d.sdp === 'string' && d.sdp.length > 0;
}

/** An `RTCIceCandidateInit`. The empty-string candidate is the legal end-of-candidates marker. */
function isCandidate(value: object): boolean {
  return typeof (value as { candidate?: unknown }).candidate === 'string';
}

/* -------------------------------------------------------------------------- */
/* Views and broadcasts                                                       */
/* -------------------------------------------------------------------------- */

function participantView(call: LiveGroupCall, p: LiveParticipant): GroupCallParticipantView {
  return {
    userId: p.userId,
    name: p.name,
    image: p.image,
    handle: p.handle,
    muted: p.muted,
    host: p.userId === call.hostId,
    joinedAt: p.joinedAt,
  };
}

function rosterOf(call: LiveGroupCall): GroupCallParticipantView[] {
  return Array.from(call.participants.values(), (p) => participantView(call, p));
}

/** How many people are actually in. Ringing invitees do not occupy a slot. */
function joinedCount(call: LiveGroupCall): number {
  let n = 0;
  for (const p of call.participants.values()) if (p.joinedAt !== null) n += 1;
  return n;
}

/**
 * Everyone on the roster hears this — the joined through the socket room, the
 * still-ringing through their user rooms.
 */
function broadcast(io: Server, call: LiveGroupCall, event: string, payload: unknown): void {
  io.to(callRoom(call.id)).emit(event, payload);
  for (const p of call.participants.values()) {
    if (p.joinedAt === null) io.to(userRoom(p.userId)).emit(event, payload);
  }
}

function emitRoster(io: Server, call: LiveGroupCall): void {
  broadcast(io, call, GCALL_S2C.ROSTER, { callId: call.id, participants: rosterOf(call) });
}

/**
 * "You are in", to the one socket that asked.
 *
 * Sent last, never first: `reduce()` only accepts a `roster` snapshot for a room
 * it already believes it is in, so whatever roster rides on this payload is the
 * one the joiner starts from. Emitting it before the rest of the roster exists
 * would show the host an empty room until the next delta arrived.
 */
function emitJoined(socket: Socket, call: LiveGroupCall, userId: string): void {
  socket.emit(GCALL_S2C.JOINED, {
    callId: call.id,
    origin: call.origin,
    originId: call.originId,
    conversationId: call.conversationId,
    // Echoed so the mesh's offer rule has both sides of its compare.
    selfId: userId,
    hostId: call.hostId,
    // The peer list to mesh with — `meshPeers()` filters out this user and
    // anyone still ringing.
    participants: rosterOf(call),
    startedAt: call.startedAt,
  });
}

/**
 * Open-room presence.
 *
 * Pushed when a room opens or closes, as the contract requires, and also when
 * its roster changes — the payload carries the count the pill renders, and a
 * count that only updates on open/close is a pill that lies for the whole life
 * of the room. A superset of the contract, and cheap: one emit into a room
 * nobody has joined unless they asked.
 */
function emitActive(
  io: Server,
  origin: OpenRoomOrigin,
  originId: string,
  call: LiveGroupCall | null,
): void {
  io.to(originPresenceRoom(origin, originId)).emit(GCALL_S2C.ACTIVE, {
    origin,
    originId,
    callId: call ? call.id : null,
    participantCount: call ? joinedCount(call) : 0,
    participants: call ? rosterOf(call).slice(0, ACTIVE_AVATAR_LIMIT) : [],
  });
}

/** `gcall:active` for whatever origin this room is scoped to. No-op for ad-hoc. */
function pushActive(io: Server, call: LiveGroupCall, live: boolean): void {
  if (call.origin === 'adhoc' || !call.originId) return;
  emitActive(io, call.origin, call.originId, live ? call : null);
}

/* -------------------------------------------------------------------------- */
/* Persistence — fire-and-forget, never awaited in a signalling path           */
/* -------------------------------------------------------------------------- */

type HubPrisma = ReturnType<typeof getPrismaClient>;

function persist(
  call: LiveGroupCall,
  op: string,
  run: (prisma: HubPrisma) => Promise<unknown>,
): void {
  call.persistChain = call.persistChain.then(
    () =>
      run(getPrismaClient()).then(
        () => undefined,
        (err: unknown) => {
          logger.warn({
            event: 'group_call_persist_failed',
            op,
            callId: call.id,
            error: String(err),
          });
        },
      ),
    () => undefined,
  );
}

function persistRoomCreated(call: LiveGroupCall): void {
  persist(call, 'create', (prisma) =>
    prisma.groupCall.create({
      data: {
        id: call.id,
        hostId: call.hostId,
        origin: persistedOrigin(call.origin),
        communityId: call.origin === 'community' ? call.originId : null,
        partyId: call.origin === 'party' ? call.originId : null,
        conversationId: call.conversationId,
        // An open room is live from the instant it opens; an ad-hoc one is
        // ringing until somebody other than the host is in it.
        status: call.origin === 'adhoc' ? 'RINGING' : 'ACTIVE',
        createdAt: new Date(call.createdAt),
        startedAt: new Date(call.startedAt),
        peakParticipants: call.peakParticipants,
      },
    }),
  );
}

function persistRoomProgress(call: LiveGroupCall): void {
  persist(call, 'progress', (prisma) =>
    prisma.groupCall.update({
      where: { id: call.id },
      data: { status: 'ACTIVE', peakParticipants: call.peakParticipants },
    }),
  );
}

function persistRoomEnded(call: LiveGroupCall, reason: GroupCallEndReason, at: number): void {
  persist(call, 'end', (prisma) =>
    prisma.groupCall.update({
      where: { id: call.id },
      data: {
        // An open room is never rung, so it cannot be "missed": somebody sat in
        // it, alone or not, and then it closed.
        status: persistedStatus(reason, call.othersJoined || call.origin !== 'adhoc'),
        endedAt: new Date(at),
        peakParticipants: call.peakParticipants,
      },
    }),
  );
}

/**
 * One participant's row.
 *
 * `durationSec` here is that person's own time in the room — which is not the
 * same number as the `durationSec` on `gcall:ended`, where the contract defines
 * it as the room's lifetime. Somebody who joined late was not in the call for
 * as long as the call existed, and their history row should say so.
 */
function persistParticipant(
  call: LiveGroupCall,
  p: LiveParticipant,
  args: { left: boolean; reason?: GroupCallEndReason; at: number },
): void {
  const joinedAt = p.joinedAt;
  const joined = joinedAt !== null;
  const earlier = call.earlierStints.get(p.userId);
  // Somebody who was in earlier and is now only being rung again (or whose
  // re-ring ended) is still, for history, someone who was in and left.
  const status = persistedParticipantStatus({
    joined: joined || earlier !== undefined,
    left: args.left || (!joined && earlier !== undefined),
    reason: args.reason,
  });
  const stint = joined && args.left ? Math.max(0, Math.round((args.at - joinedAt) / 1000)) : 0;
  const durationSec = (earlier?.seconds ?? 0) + stint;
  const firstJoinedAt = earlier?.firstJoinedAt ?? joinedAt;
  if (joined && args.left) {
    call.earlierStints.set(p.userId, {
      firstJoinedAt: firstJoinedAt ?? joinedAt,
      seconds: durationSec,
    });
  }
  const row = {
    status,
    joinedAt: firstJoinedAt !== null ? new Date(firstJoinedAt) : null,
    leftAt: args.left ? new Date(args.at) : null,
    durationSec,
  };
  persist(call, 'participant', (prisma) =>
    prisma.groupCallParticipant.upsert({
      where: { callId_userId: { callId: call.id, userId: p.userId } },
      create: { callId: call.id, userId: p.userId, ...row },
      update: row,
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Admission                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Load a person's public identity for the roster.
 *
 * Falls back to what the handshake attached, the way `call.ts` falls back to
 * "Someone": a roster row with a slightly stale name is better than a call that
 * does not happen because a `SELECT` failed.
 */
async function loadPeer(
  userId: string,
  fallbackName: string,
  fallbackImage: string | null,
): Promise<CallPeer> {
  const row = await getPrismaClient()
    .user.findUnique({
      where: { id: userId },
      select: userChipSelect,
    })
    .catch((err: unknown) => {
      logger.warn({ event: 'group_call_peer_load_failed', userId, error: String(err) });
      return null;
    });
  return {
    id: userId,
    name: row?.name ?? fallbackName,
    image: row?.image ?? fallbackImage,
    handle: row?.handle ?? null,
  };
}

/**
 * Is there a block, in either direction, between `userId` and any of `others`?
 * Fails closed: an unreadable block table must never resolve to "connect them".
 */
async function hasBlockWithAny(userId: string, others: readonly string[]): Promise<boolean> {
  if (others.length === 0) return false;
  const row = await getPrismaClient()
    .userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: [...others] } },
          { blockerId: { in: [...others] }, blockedId: userId },
        ],
      },
      select: { blockerId: true },
    })
    .catch((err: unknown) => {
      logger.warn({ event: 'group_call_block_check_failed', userId, error: String(err) });
      return { blockerId: 'unknown' };
    });
  return row !== null;
}

/**
 * May these people be rung into an ad-hoc room?
 *
 * The same three facts `loadCallPermission` in `call.ts` loads, fed to
 * `canJoinGroupCall` — which *is* `canCall`, deliberately, because being rung
 * by a group is not less intrusive than being rung by one person (see the
 * argument in `lib/groupcall/state.ts`). Batched into four queries regardless
 * of how many invitees there are, rather than three per invitee.
 *
 * The follow direction is load-bearing and reads backwards on purpose:
 * `followerId = invitee, followingId = inviter` asks "does the person being
 * rung follow the person ringing them", because permission is granted by the
 * person whose phone buzzes, never claimed by the person making it buzz.
 *
 * Everyone who fails is dropped from the ring with a reason, not raised as an
 * error: one unreachable invitee must not cancel a call to four others.
 */
async function screenInvitees(
  io: Server,
  inviterId: string,
  inviteeIds: string[],
  /** Everyone already on the roster besides the inviter, joined or ringing. */
  roomIds: readonly string[] = [],
): Promise<{ admitted: CallPeer[]; refusals: GroupCallRejectReason[] }> {
  const admitted: CallPeer[] = [];
  const refusals: GroupCallRejectReason[] = [];
  if (inviteeIds.length === 0) return { admitted, refusals };

  const prisma = getPrismaClient();
  let blocks: Array<{ blockerId: string; blockedId: string }>;
  let pairBlocks: Array<{ blockerId: string; blockedId: string }>;
  let prefs: Array<{ userId: string; callPrivacy: string }>;
  let follows: Array<{ followerId: string }>;
  let users: Array<{ id: string; name: string | null; image: string | null; handle: string | null }>;
  try {
    // A mesh connects every pair directly — each sees the other's IP and
    // hears their voice — so a block between an invitee and anybody else in
    // the room bars the ring just as one with the inviter does.
    const others = [...new Set([...roomIds, ...inviteeIds])].filter((id) => id !== inviterId);
    [blocks, pairBlocks, prefs, follows, users] = await Promise.all([
      prisma.userBlock.findMany({
        // Either direction bars the ring.
        where: {
          OR: [
            { blockerId: inviterId, blockedId: { in: inviteeIds } },
            { blockerId: { in: inviteeIds }, blockedId: inviterId },
          ],
        },
        select: { blockerId: true, blockedId: true },
      }),
      prisma.userBlock.findMany({
        where: {
          OR: [
            { blockerId: { in: inviteeIds }, blockedId: { in: others } },
            { blockerId: { in: others }, blockedId: { in: inviteeIds } },
          ],
        },
        select: { blockerId: true, blockedId: true },
      }),
      prisma.notificationPreference.findMany({
        where: { userId: { in: inviteeIds } },
        select: { userId: true, callPrivacy: true },
      }),
      prisma.follow.findMany({
        where: { followerId: { in: inviteeIds }, followingId: inviterId },
        select: { followerId: true },
      }),
      prisma.user.findMany({
        where: { id: { in: inviteeIds } },
        select: userChipSelect,
      }),
    ]);
  } catch (err) {
    logger.warn({ event: 'group_call_permission_failed', error: String(err) });
    // Refusing everyone is the safe direction: an unreadable block table must
    // never resolve to "ring them anyway".
    return { admitted, refusals: inviteeIds.map(() => 'failed') };
  }

  const blocked = new Set<string>();
  for (const b of blocks) blocked.add(b.blockerId === inviterId ? b.blockedId : b.blockerId);
  const conflicts = new Map<string, Set<string>>();
  for (const b of pairBlocks) {
    for (const [a, z] of [
      [b.blockerId, b.blockedId],
      [b.blockedId, b.blockerId],
    ]) {
      let set = conflicts.get(a);
      if (!set) conflicts.set(a, (set = new Set()));
      set.add(z);
    }
  }
  // Who this invitee would be meshed with: the room as it stands, plus the
  // invitees admitted ahead of them in this batch.
  const present = new Set(roomIds);
  const privacyBy = new Map<string, CallPrivacy>();
  for (const p of prefs) {
    if (isCallPrivacy(p.callPrivacy)) privacyBy.set(p.userId, p.callPrivacy);
  }
  const followsInviter = new Set(follows.map((f) => f.followerId));
  const userById = new Map(users.map((u) => [u.id, u]));

  // Presence, once per invitee. `fetchSockets` is the adapter-aware way to ask
  // and it is what `call.ts` uses; the answers are gathered together so seven
  // invitees cost one await rather than seven.
  const presence = await Promise.all(
    inviteeIds.map(async (id) => {
      try {
        return [id, (await io.in(userRoom(id)).fetchSockets()).length > 0] as const;
      } catch {
        // If we cannot tell, assume they are there: the ring simply times out,
        // which is a far better failure than refusing a call to someone online.
        return [id, true] as const;
      }
    }),
  );
  const online = new Set(presence.filter(([, up]) => up).map(([id]) => id));

  for (const id of inviteeIds) {
    const user = userById.get(id);
    if (!user) {
      // No such account. Nothing on this contract says "no such user" — the
      // closest honest answer is that the ring could not be placed.
      refusals.push('failed');
      continue;
    }
    const verdict = canJoinGroupCall({
      privacy: privacyBy.get(id) ?? 'following',
      blocked: blocked.has(id),
      calleeFollowsCaller: followsInviter.has(id),
    });
    if (!verdict.allowed) {
      refusals.push(verdict.reason);
      continue;
    }
    const theirs = conflicts.get(id);
    if (theirs && [...present].some((other) => theirs.has(other))) {
      // Reported as `privacy`, not `blocked`: the block is between two other
      // people, and the inviter has no business learning it exists.
      refusals.push('privacy');
      continue;
    }
    if (getBusy(id)) {
      refusals.push('busy');
      continue;
    }
    if (!online.has(id)) {
      // The group contract has no `offline` — unlike `CallRejectReason`, which
      // does. `failed` is the nearest member: the ring could not be placed.
      refusals.push('failed');
      continue;
    }
    present.add(id);
    admitted.push({
      id,
      name: user.name ?? 'Someone',
      image: user.image,
      handle: user.handle,
    });
  }

  return { admitted, refusals };
}

/** The most final of a set of refusals, for a `START` that reached nobody. */
function strongestReason(reasons: readonly GroupCallRejectReason[]): GroupCallRejectReason {
  for (const candidate of REJECT_PRECEDENCE) {
    if (reasons.includes(candidate)) return candidate;
  }
  return 'failed';
}

/**
 * Does this person belong to the thing an open room is scoped to?
 *
 * Communities are rows, so this is the `(communityId, userId)` unique. Parties
 * are in-memory only — there is no table — so party membership is read from
 * `handlers/party.ts` through the one accessor it exports for the purpose.
 *
 * A database failure resolves to "not a member". Letting an unreadable
 * membership table open a community's voice room to everyone is the one outcome
 * worth failing closed for.
 */
async function isOriginMember(
  origin: OpenRoomOrigin,
  originId: string,
  userId: string,
): Promise<boolean> {
  if (origin === 'party') return isPartyMember(originId, userId);
  const row = await getPrismaClient()
    .communityMember.findUnique({
      where: { communityId_userId: { communityId: originId, userId } },
      select: { userId: true },
    })
    .catch((err: unknown) => {
      logger.warn({
        event: 'group_call_membership_failed',
        communityId: originId,
        error: String(err),
      });
      return null;
    });
  return row !== null;
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Put a ringing invitee on the roster.
 *
 * Separate from {@link emitIncoming} because a batch of invitees has to be
 * *entirely* on the roster before the first card goes out. A client in the
 * `incoming` phase ignores `gcall:roster` — `reduce()` only trusts a snapshot
 * for a room it is already in — so the participant list attached to the
 * incoming card is the only complete roster that invitee will see before they
 * answer. Ringing and emitting in one pass would show the first person a card
 * that says "Ana is calling" for a room that already had four people in it.
 *
 * The timer is the server's, not the client's, so a client that ignores its own
 * countdown cannot leave a room ringing on someone's phone indefinitely.
 */
function addRinging(io: Server, call: LiveGroupCall, peer: CallPeer): boolean {
  // Screening checked `getBusy` before an await; the invitee may have been
  // claimed by another room or a 1:1 since. Claim first and touch nothing on a
  // loss — overwriting `byUser` would point their disconnect at the wrong room.
  if (!claimBusy(peer.id, 'gcall', call.id)) return false;
  const participant: LiveParticipant = {
    userId: peer.id,
    name: peer.name,
    image: peer.image,
    handle: peer.handle,
    socketId: null,
    muted: false,
    joinedAt: null,
  };
  call.participants.set(peer.id, participant);
  call.invited.add(peer.id);
  call.rung += 1;
  byUser.set(peer.id, call.id);

  const timer = setTimeout(() => {
    const live = calls.get(call.id);
    if (!live) return;
    const still = live.participants.get(peer.id);
    if (!still || still.joinedAt !== null) return;
    dropParticipant(io, live, peer.id, 'unanswered');
    io.to(userRoom(peer.id)).emit(GCALL_S2C.ENDED, { callId: live.id, reason: 'unanswered' });
    settle(io, live);
  }, GROUP_RING_TIMEOUT_MS);
  call.ringTimers.set(peer.id, timer);

  persistParticipant(call, participant, { left: false, at: Date.now() });
  return true;
}

/**
 * Make one person's devices buzz with the room as it stands.
 *
 * Also the whole of an open room's "courtesy ping" (contract decision #3): the
 * card is the same, the roster is the same, and the only difference is that
 * nothing was added to the roster for them, because nobody is ever *rung* into
 * an open room — they have to pass its membership rule when they act on it.
 */
function emitIncoming(io: Server, call: LiveGroupCall, userId: string): void {
  io.to(userRoom(userId)).emit(GCALL_S2C.INCOMING, {
    callId: call.id,
    origin: call.origin,
    originId: call.originId,
    conversationId: call.conversationId,
    from: call.host,
    participants: rosterOf(call),
    expiresAt: Date.now() + GROUP_RING_TIMEOUT_MS,
  });
}

/**
 * Take one person off the roster.
 *
 * Removes the row, releases every index and claim keyed on them, tells the room
 * with both the delta and a fresh snapshot, and writes their outcome. Does not
 * decide whether the room survives — that is `settle`'s job, so that the two
 * cannot disagree.
 */
function dropParticipant(
  io: Server,
  call: LiveGroupCall,
  userId: string,
  reason: GroupCallLeaveReason,
): void {
  const p = call.participants.get(userId);
  if (!p) return;
  call.participants.delete(userId);

  const timer = call.ringTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    call.ringTimers.delete(userId);
  }
  clearGrace(call, userId);
  if (byUser.get(userId) === call.id) byUser.delete(userId);
  releaseBusy(userId, call.id);
  if (p.socketId) io.sockets.sockets.get(p.socketId)?.leave(callRoom(call.id));

  const endReason: GroupCallEndReason =
    reason === 'declined' ? 'declined' : reason === 'unanswered' ? 'unanswered' : reason === 'failed' ? 'failed' : 'left';
  persistParticipant(call, p, { left: true, reason: endReason, at: Date.now() });

  broadcast(io, call, GCALL_S2C.PEER_LEFT, { callId: call.id, userId, reason });
  emitRoster(io, call);
  pushActive(io, call, true);
}

/** Run `work` after every admission to `call` already queued, and before the next. */
function admit<T>(call: LiveGroupCall, work: () => Promise<T>): Promise<T> {
  const run = call.admission.then(work, work);
  call.admission = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Cancel a held seat, if there is one. */
function clearGrace(call: LiveGroupCall, userId: string): void {
  const timer = call.graceTimers.get(userId);
  if (!timer) return;
  clearTimeout(timer);
  call.graceTimers.delete(userId);
}

/**
 * Decide whether the room survives its current roster.
 *
 * The asymmetry between ad-hoc and open rooms is argued at the top of this
 * file. Called after every removal, and only after a removal — a room is never
 * ended by somebody arriving.
 */
function settle(io: Server, call: LiveGroupCall): void {
  if (calls.get(call.id) !== call) return;
  const joined = joinedCount(call);

  if (call.origin !== 'adhoc') {
    // An open room waits at one for company. Zero is what closes it.
    if (joined === 0) endRoom(io, call, 'empty');
    return;
  }

  if (joined >= 2) return;
  // Nobody left in it. Anyone still ringing would be answering into an empty
  // room — the host cancelled — so their cards go too.
  if (joined === 0) {
    endRoom(io, call, call.othersJoined ? 'empty' : 'unanswered');
    return;
  }
  // Somebody is still ringing: the one person here is waiting for an answer,
  // not sitting in a dead room.
  if (call.participants.size > joined) return;

  if (call.othersJoined) {
    endRoom(io, call, 'empty');
  } else if (call.declined > 0 && call.declined >= call.rung) {
    endRoom(io, call, 'declined');
  } else {
    endRoom(io, call, 'unanswered');
  }
}

/** End the room for everyone in it, once. */
function endRoom(io: Server, call: LiveGroupCall, reason: GroupCallEndReason): void {
  if (calls.get(call.id) !== call) return;
  calls.delete(call.id);

  for (const timer of call.ringTimers.values()) clearTimeout(timer);
  for (const timer of call.graceTimers.values()) clearTimeout(timer);
  call.graceTimers.clear();
  call.ringTimers.clear();

  if (call.origin !== 'adhoc' && call.originId) {
    const key = originKey(call.origin, call.originId);
    if (byOrigin.get(key) === call.id) byOrigin.delete(key);
  }

  const endedAt = Date.now();
  const durationSec = Math.max(0, Math.round((endedAt - call.startedAt) / 1000));

  for (const p of call.participants.values()) {
    if (byUser.get(p.userId) === call.id) byUser.delete(p.userId);
    releaseBusy(p.userId, call.id);
    persistParticipant(call, p, { left: true, reason, at: endedAt });
    // User rooms rather than the call room: this has to reach the tab that is
    // only ringing and the tabs that are merely watching, not just the one
    // holding the microphone.
    io.to(userRoom(p.userId)).emit(GCALL_S2C.ENDED, { callId: call.id, reason, durationSec });
  }
  persistRoomEnded(call, reason, endedAt);

  io.in(callRoom(call.id)).socketsLeave(callRoom(call.id));
  call.participants.clear();
  pushActive(io, call, false);

  logger.info({
    event: 'group_call_ended',
    callId: call.id,
    origin: call.origin,
    reason,
    durationSec,
    peakParticipants: call.peakParticipants,
  });
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

export function registerGroupCallHandlers(io: Server, socket: Socket): void {
  const uid = (): string => (typeof socket.data.userId === 'string' ? socket.data.userId : '');
  const selfName = (): string => (socket.data.userName as string) || 'Player';
  const selfImage = (): string | null => (socket.data.avatarUrl as string) ?? null;

  // Every authenticated socket joins its own user room so a ring reaches the
  // person rather than a tab. `call.ts` performs the same join for its own
  // handler: both do it because either can be registered without the other, and
  // joining a room twice is a no-op.
  const self = uid();
  if (self) void socket.join(userRoom(self));

  const fail = (code: GroupCallErrorCode, message: string, callId?: string): void => {
    socket.emit(GCALL_S2C.ERROR, callId ? { code, message, callId } : { code, message });
  };
  const reject = (
    reason: GroupCallRejectReason,
    operation: 'start' | 'join' | 'invite',
    extra?: { callId?: string; origin?: GroupCallOrigin; originId?: string | null },
  ): void => {
    socket.emit(GCALL_S2C.REJECTED, { reason, operation, ...extra });
  };

  /**
   * Put this socket's user into a room that already exists.
   *
   * Shared by `JOIN` and by a `START` that turned out to be a join, because
   * "create or join" must not mean two different admissions.
   */
  const enterRoom = (call: LiveGroupCall, operation: 'start' | 'join'): Promise<void> =>
    admit(call, () => enterRoomInTurn(call, operation));

  const enterRoomInTurn = async (
    call: LiveGroupCall,
    operation: 'start' | 'join',
  ): Promise<void> => {
    const userId = uid();
    if (!userId) return fail('unauthenticated', 'Sign in to join a call');

    // Refusals from an open room never name it. Most are sent before (or
    // instead of) a membership pass, and a callId — or a reply that differs
    // between "live room" and "no room" — would tell a non-member that a space
    // they cannot see has a call going, which `LOOKUP` deliberately hides.
    // An ad-hoc room's guests were sent its id; naming it tells them nothing.
    // An open room's refusal carries exactly the fields a START refused before
    // any room exists does (origin and originId, which the caller sent), so
    // the payloads are identical down to their shape.
    const roomRef =
      call.origin === 'adhoc'
        ? { callId: call.id }
        : { origin: call.origin, originId: call.originId };

    const busy = getBusy(userId);
    if (busy && busy.id !== call.id) return reject('busy', operation, roomRef);

    const existing = call.participants.get(userId);

    // Already in, from another tab: move the media leg rather than opening a
    // second one. Peers are told the old leg went and a new one arrived, which
    // is exactly what they need in order to tear down a peer connection whose
    // far end no longer exists and negotiate against the new tab.
    if (existing && existing.joinedAt !== null && existing.socketId !== socket.id) {
      if (call.origin !== 'adhoc') {
        // Membership is the whole admission rule of an open room, and a seat
        // being re-claimed (a reconnect, another tab) is the moment to ask it
        // again: they may have been removed while they were away. A refusal
        // leaves the seat to its grace timer rather than evicting outright,
        // so a database blip here costs a reconnect, not a place in the room.
        const member = await isOriginMember(call.origin, call.originId ?? '', userId);
        if (calls.get(call.id) !== call || call.participants.get(userId) !== existing) {
          return reject('gone', operation, roomRef);
        }
        if (!member) return reject('not-member', operation, roomRef);
        if (socket.disconnected) return;
        if (existing.socketId === socket.id) {
          emitJoined(socket, call, userId);
          return;
        }
      }
      // Also the way back from a dropped socket: the seat was held (socketId
      // null) and this is the reconnect claiming it.
      clearGrace(call, userId);
      const previous = existing.socketId ? io.sockets.sockets.get(existing.socketId) : undefined;
      previous?.leave(callRoom(call.id));
      // The old tab is told it is out, or it keeps an open microphone and an
      // in-call bar for a room that no longer routes anything to it. Sent to
      // that one socket: the new tab shares the user room.
      previous?.emit(GCALL_S2C.ENDED, {
        callId: call.id,
        reason: 'left' satisfies GroupCallEndReason,
        durationSec: Math.max(0, Math.round((Date.now() - call.startedAt) / 1000)),
      });
      broadcast(io, call, GCALL_S2C.PEER_LEFT, {
        callId: call.id,
        userId,
        reason: 'left' satisfies GroupCallLeaveReason,
      });
      existing.socketId = socket.id;
      // The new leg's microphone starts unmuted; its client re-publishes a
      // mute it is carrying. Keeping the old leg's flag would show a live mic
      // as muted to everyone.
      existing.muted = false;
      void socket.join(callRoom(call.id));
      emitJoined(socket, call, userId);
      broadcast(io, call, GCALL_S2C.PEER_JOINED, {
        callId: call.id,
        participant: participantView(call, existing),
      });
      emitRoster(io, call);
      return;
    }

    if (existing && existing.joinedAt !== null && existing.socketId === socket.id) {
      // A duplicate press from the tab that is already the media leg. Re-send
      // the snapshot so a client that lost it can recover, and change nothing.
      emitJoined(socket, call, userId);
      return;
    }

    if (call.origin === 'adhoc') {
      // Ad-hoc rooms are by invitation, and the guest list — not the roster —
      // is what admission is checked against, so a dropped connection can come
      // back. The contract has no "not invited"; `not-member` is the member of
      // `GroupCallRejectReason` that means "this room is not open to you".
      if (!existing && !call.invited.has(userId)) {
        // Not on the guest list: from where they stand there is no call here.
        return reject('gone', operation, roomRef);
      }
      // Answering a ring, or walking back in from the guest list: they were
      // screened against the room as it was when they were rung, and a block
      // may have appeared since (or the room may hold somebody new). In a mesh
      // that is a direct connection, so ask again at the door. Everyone on the
      // roster counts, ringing included: they are meshed the moment they answer.
      const others = [...call.participants.keys()].filter((id) => id !== userId);
      if (await hasBlockWithAny(userId, others)) {
        return reject('privacy', operation, roomRef);
      }
      if (isRosterFull(joinedCount(call))) {
        return reject('full', operation, roomRef);
      }
    } else {
      const originId = call.originId ?? '';
      const member = await isOriginMember(call.origin, originId, userId);
      // `canJoinOpenRoom` owns the ordering: a ban before membership before
      // capacity, so nobody is told a room is merely full when they were never
      // getting in. We have no community ban table yet, so `banned` is always
      // false — the parameter is where it will land.
      const verdict = canJoinOpenRoom({
        origin: call.origin,
        isMember: member,
        banned: false,
        participantCount: joinedCount(call),
      });
      if (!verdict.allowed) return reject(verdict.reason, operation, roomRef);
      // A shared community is not consent to a direct connection. Everyone in
      // a mesh sees everyone else's IP and hears their voice, so a block in
      // either direction with anybody in the room keeps this person out
      // while that one is in it.
      const others = [...call.participants.keys()].filter((id) => id !== userId);
      if (await hasBlockWithAny(userId, others)) {
        // `privacy`, never `blocked`: which of the two set the block, and that
        // it is somebody in this room, is not this joiner's to learn.
        return reject('privacy', operation, roomRef);
      }
    }

    // Every await happens before this point. From the re-checks below to the
    // roster write the run is synchronous, so the room cannot end, fill up or
    // change our place in it between the checks and the busy claim — a claim
    // taken on a room that then ended would never be released.
    const peer = call.participants.has(userId)
      ? null
      : await loadPeer(userId, selfName(), selfImage());

    if (calls.get(call.id) !== call) return reject('gone', operation, roomRef);
    const onRoster = call.participants.get(userId);
    // Another tab of ours got in while we were waiting; that tab is the leg.
    if (onRoster && onRoster.joinedAt !== null) {
      return reject('busy', operation, roomRef);
    }
    // We were ringing when we started and have since been dropped (declined
    // from another tab, or the ring ran out): that invitation is over.
    const identity = onRoster ?? peer;
    if (!identity) return reject('gone', operation, roomRef);
    // Others may have joined while we awaited membership or the peer row.
    if (isRosterFull(joinedCount(call))) return reject('full', operation, roomRef);
    // This socket closed while we awaited. Its disconnect handler has already
    // run and found nothing to clean up, so binding it now would leave a ghost
    // on the roster and a busy claim nobody releases.
    if (socket.disconnected) return;
    if (!claimBusy(userId, 'gcall', call.id)) {
      return reject('busy', operation, roomRef);
    }

    const at = Date.now();
    const participant: LiveParticipant = onRoster ?? {
      userId,
      name: identity.name,
      image: identity.image,
      handle: identity.handle,
      socketId: socket.id,
      muted: false,
      joinedAt: at,
    };
    participant.socketId = socket.id;
    participant.joinedAt = at;
    call.participants.set(userId, participant);

    const timer = call.ringTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      call.ringTimers.delete(userId);
    }
    // An answered ring is not one to throttle: whoever rang them may call them
    // straight back once this call is over.
    for (const otherId of call.participants.keys()) lastRung.delete(`${otherId}>${userId}`);
    byUser.set(userId, call.id);
    if (userId !== call.hostId) call.othersJoined = true;
    call.peakParticipants = Math.max(call.peakParticipants, joinedCount(call));

    void socket.join(callRoom(call.id));

    persistParticipant(call, participant, { left: false, at });
    persistRoomProgress(call);

    emitJoined(socket, call, userId);
    broadcast(io, call, GCALL_S2C.PEER_JOINED, {
      callId: call.id,
      participant: participantView(call, participant),
    });
    emitRoster(io, call);
    pushActive(io, call, true);
  };

  // ─── Start ───
  socket.on(GCALL_C2S.START, async (payload: Record<string, unknown>) => {
    const userId = uid();
    if (!userId) return fail('unauthenticated', 'Sign in to start a call');
    if (!checkRateLimit(socket.id, GCALL_C2S.START)) {
      return fail('rate-limited', 'Too many calls — slow down');
    }

    const origin = payload?.origin;
    if (!isGroupCallOrigin(origin)) return fail('malformed', 'Unknown call origin');
    const originId = asId(payload?.originId);
    const conversationId = asId(payload?.conversationId) || null;

    if (origin === 'adhoc') {
      const requested = asIdList(payload?.inviteeIds, MAX_GROUP_CALL_INVITES).filter(
        (id) => id !== userId,
      );
      if (requested.length === 0) {
        return fail('malformed', 'An ad-hoc call needs somebody to ring');
      }
      // Calling the same person again straight after is a ring nobody asked
      // for; to them it reads as a line that is still busy.
      const inviteeIds = requested.filter((id) => !recentlyRang(userId, id));
      // `failed` ("couldn't connect"), not `busy`: the caller is not on a call.
      if (inviteeIds.length === 0) return reject('failed', 'start', { origin, originId: null });
      if (getBusy(userId)) return reject('busy', 'start', { origin, originId: null });

      const { admitted, refusals } = await screenInvitees(io, userId, inviteeIds);
      // One refused invitee is dropped in silence — the host cannot tell a
      // block from a busy line from a closed tab, exactly as in the 1:1 flow.
      // Refusing *everybody* is a call that did not happen, and gets a reason.
      if (admitted.length === 0) {
        return reject(strongestReason(refusals), 'start', { origin, originId: null });
      }
      if (getBusy(userId)) return reject('busy', 'start', { origin, originId: null });

      const host = await loadPeer(userId, selfName(), selfImage());
      // Gone while we awaited: a room bound to a dead socket would hold the
      // host busy with nothing left to send the LEAVE that frees them.
      if (socket.disconnected) return;
      const call = openRoom(socket, {
        host,
        origin,
        originId: null,
        conversationId,
      });
      if (!call) return reject('busy', 'start', { origin, originId: null });
      // Everyone onto the roster first, so both the host's `joined` and every
      // invitee's card describe the same complete room.
      const rung = admitted.filter((peer) => addRinging(io, call, peer));
      if (rung.length === 0) {
        // Everyone became busy while we were screening them.
        endRoom(io, call, 'unanswered');
        return reject('busy', 'start', { origin, originId: null });
      }
      emitJoined(socket, call, userId);
      for (const peer of rung) {
        noteRang(userId, peer.id);
        emitIncoming(io, call, peer.id);
      }
      logger.info({
        event: 'group_call_started',
        callId: call.id,
        origin,
        hostId: userId,
        rung: rung.length,
      });
      return;
    }

    // ─── Open room: create-or-join ───
    if (!originId) return fail('malformed', 'An open room needs an origin id');

    const existingId = byOrigin.get(originKey(origin, originId));
    const existing = existingId ? calls.get(existingId) : undefined;
    // Contract decision #1: a second room for one community is a state the UI
    // cannot represent, so starting one that exists is joining it.
    if (existing) return void (await enterRoom(existing, 'start'));

    if (getBusy(userId)) return reject('busy', 'start', { origin, originId });
    if (!(await isOriginMember(origin, originId, userId))) {
      // Covers a private community just as it covers a public one: without a
      // membership row there is nothing to admit.
      return reject('not-member', 'start', { origin, originId });
    }

    const host = await loadPeer(userId, selfName(), selfImage());

    // Somebody may have opened it while we were reading the membership row or
    // our own. Checked after the last await, so nothing can open a second room
    // between this lookup and `openRoom` registering ours in `byOrigin`.
    const raced = byOrigin.get(originKey(origin, originId));
    const racedCall = raced ? calls.get(raced) : undefined;
    if (racedCall) return void (await enterRoom(racedCall, 'start'));

    if (socket.disconnected) return;
    const call = openRoom(socket, { host, origin, originId, conversationId: null });
    if (!call) return reject('busy', 'start', { origin, originId });
    emitJoined(socket, call, userId);
    pushActive(io, call, true);
    logger.info({ event: 'group_call_started', callId: call.id, origin, originId, hostId: userId });
  });

  // ─── Join ───
  socket.on(GCALL_C2S.JOIN, async (payload: Record<string, unknown>) => {
    const userId = uid();
    if (!userId) return fail('unauthenticated', 'Sign in to join a call');
    if (!checkRateLimit(socket.id, GCALL_C2S.JOIN)) {
      return fail('rate-limited', 'Too many joins — slow down');
    }
    const callId = asId(payload?.callId);
    if (!callId) return fail('malformed', 'Missing callId');
    const call = calls.get(callId);
    // A room that ended while the card was on screen, or one lost to a hub
    // restart. Both are `gone`, and both are the client's cue to drop the card.
    if (!call) return reject('gone', 'join', { callId });
    await enterRoom(call, 'join');
  });

  // ─── Invite (mid-call) ───
  socket.on(GCALL_C2S.INVITE, async (payload: Record<string, unknown>) => {
    const userId = uid();
    if (!userId) return fail('unauthenticated', 'Sign in to invite');
    if (!checkRateLimit(socket.id, GCALL_C2S.INVITE)) {
      return fail('rate-limited', 'Too many invites — slow down');
    }
    const callId = asId(payload?.callId);
    if (!callId) return fail('malformed', 'Missing callId');
    const call = calls.get(callId);
    if (!call) return reject('gone', 'invite', { callId });

    const inviter = call.participants.get(userId);
    if (!inviter || inviter.joinedAt === null) {
      return fail('not-participant', 'You are not in this call', callId);
    }
    // Asked again after every await: someone who left, or was evicted, while
    // their invite waited its turn must not ring people on the room's behalf.
    const inviterStillIn = (): boolean =>
      calls.get(callId) === call && call.participants.get(userId) === inviter;

    const targets = asIdList(payload?.userIds, MAX_GROUP_CALL_INVITES).filter(
      (id) =>
        id !== userId &&
        !call.participants.has(id) &&
        !call.declinedBy.has(id) &&
        !recentlyRang(userId, id),
    );
    // Everyone asked for is already here, declined this room, or was rung a
    // moment ago. A refusal the inviter sees, not a protocol error they don't.
    if (targets.length === 0) return reject('busy', 'invite', { callId });

    if (call.origin === 'adhoc') {
      // In turn with every other admission to this room, so the block screen
      // sees anyone admitted while it was waiting (see `LiveGroupCall.admission`).
      return admit(call, async () => {
        // Ringing invitees hold a roster slot even before they answer, so the
        // roster — not the joined count — is what a mid-call invite can fill.
        const room = MAX_GROUP_CALL_PARTICIPANTS - call.participants.size;
        if (room <= 0) return reject('full', 'invite', { callId });
        const { admitted, refusals } = await screenInvitees(
          io,
          userId,
          targets.slice(0, room),
          [...call.participants.keys()].filter((id) => id !== userId),
        );
        if (!inviterStillIn()) return reject('gone', 'invite', { callId });
        if (admitted.length === 0) {
          return reject(strongestReason(refusals), 'invite', { callId });
        }
        // Re-checked after the await: another invite may have filled the roster
        // or rung the same person, and a busy claim may have been taken since.
        const space = MAX_GROUP_CALL_PARTICIPANTS - call.participants.size;
        const rung = admitted
          .filter((peer) => !call.participants.has(peer.id))
          .slice(0, Math.max(0, space))
          .filter((peer) => addRinging(io, call, peer));
        if (rung.length === 0) return reject('busy', 'invite', { callId });
        // Deltas before cards, so an invitee already on the roster learns about
        // the others in this batch and the new ones get a complete list.
        for (const peer of rung) {
          broadcast(io, call, GCALL_S2C.PEER_JOINED, {
            callId: call.id,
            participant: participantView(call, call.participants.get(peer.id) as LiveParticipant),
          });
        }
        for (const peer of rung) {
          noteRang(userId, peer.id);
          emitIncoming(io, call, peer.id);
        }
        emitRoster(io, call);
        return;
      });
    }

    // Contract decision #3: in an open room an invite is a courtesy ping, not
    // an admission grant. Nobody is ever rung into an open room, so nothing
    // joins the roster here — `joinedAt === null` must never appear on one —
    // and the invitee still has to pass the membership rule when they act on
    // it. The privacy/block screen still runs: a ping is a notification, and a
    // blocked stranger must not be able to send one.
    // Screened against everyone in the room, not just the sender: the card
    // names the host and shows the roster, and accepting it meshes the
    // invitee with all of them.
    const { admitted, refusals } = await screenInvitees(
      io,
      userId,
      targets,
      [...call.participants.keys()].filter((id) => id !== userId),
    );
    if (!inviterStillIn()) return reject('gone', 'invite', { callId });
    const originId = call.originId ?? '';
    const eligible = await Promise.all(
      admitted.map(async (peer) => ((await isOriginMember(call.origin as OpenRoomOrigin, originId, peer.id)) ? peer : null)),
    );
    if (!inviterStillIn()) return reject('gone', 'invite', { callId });
    let pinged = 0;
    for (const peer of eligible) {
      if (!peer) continue;
      noteRang(userId, peer.id);
      emitIncoming(io, call, peer.id);
      pinged += 1;
    }
    // Nobody could be pinged: say so, as the ad-hoc path does, rather than
    // closing the inviter's dialog on nothing. Non-members read as `privacy`
    // like any other refusal, so the reply says nothing about who is in what.
    if (pinged === 0) {
      return reject(refusals.length > 0 ? strongestReason(refusals) : 'privacy', 'invite', {
        callId,
      });
    }
  });

  // ─── Decline ───
  socket.on(GCALL_C2S.DECLINE, (payload: Record<string, unknown>) => {
    const userId = uid();
    if (!userId) return fail('unauthenticated', 'Sign in first');
    if (!checkRateLimit(socket.id, GCALL_C2S.DECLINE)) {
      return fail('rate-limited', 'Slow down');
    }
    const callId = asId(payload?.callId);
    const call = callId ? calls.get(callId) : undefined;
    if (!call) return fail('unknown-call', 'That call is over', callId || undefined);
    const p = call.participants.get(userId);
    // Only somebody who is ringing can decline. Once you are in, the verb is
    // leave.
    if (!p || p.joinedAt !== null) {
      return fail('not-participant', 'You are not being called', call.id);
    }

    call.declined += 1;
    call.declinedBy.add(userId);
    dropParticipant(io, call, userId, 'declined');
    // Their other tabs are still showing the card; this is what clears it.
    io.to(userRoom(userId)).emit(GCALL_S2C.ENDED, { callId: call.id, reason: 'declined' });
    settle(io, call);
  });

  // ─── Leave ───
  socket.on(GCALL_C2S.LEAVE, (payload: Record<string, unknown>) => {
    const userId = uid();
    if (!userId) return fail('unauthenticated', 'Sign in first');
    if (!checkRateLimit(socket.id, GCALL_C2S.LEAVE)) return fail('rate-limited', 'Slow down');
    const callId = asId(payload?.callId);
    const call = callId ? calls.get(callId) : undefined;
    if (!call) return fail('unknown-call', 'That call is over', callId || undefined);
    if (!call.participants.has(userId)) {
      return fail('not-participant', 'You are not in this call', call.id);
    }

    const durationSec = Math.max(0, Math.round((Date.now() - call.startedAt) / 1000));
    // Leaving a room you were only being rung into is declining it, and the
    // room's own outcome ("everyone declined") has to count it as one.
    const ringing = call.participants.get(userId)?.joinedAt === null;
    if (ringing) {
      call.declined += 1;
      call.declinedBy.add(userId);
    }
    dropParticipant(io, call, userId, ringing ? 'declined' : 'left');
    io.to(userRoom(userId)).emit(GCALL_S2C.ENDED, {
      callId: call.id,
      reason: ringing ? 'declined' : 'left',
      durationSec,
    });
    settle(io, call);
  });

  // ─── End (host only) ───
  socket.on(GCALL_C2S.END, (payload: Record<string, unknown>) => {
    const userId = uid();
    if (!userId) return fail('unauthenticated', 'Sign in first');
    if (!checkRateLimit(socket.id, GCALL_C2S.END)) return fail('rate-limited', 'Slow down');
    const callId = asId(payload?.callId);
    const call = callId ? calls.get(callId) : undefined;
    if (!call) return fail('unknown-call', 'That call is over', callId || undefined);
    if (!call.participants.has(userId)) {
      return fail('not-participant', 'You are not in this call', call.id);
    }
    // A host who has left cannot end the room they left: the check above is
    // what stops it, and a room without its host simply ends when it empties.
    if (call.hostId !== userId) return fail('not-host', 'Only the host can end this call', call.id);
    endRoom(io, call, 'host-ended');
  });

  /**
   * SDP and ICE relay.
   *
   * Passed through opaquely — we do not parse SDP — but size-capped, addressed
   * to exactly one named peer's media socket, and only ever accepted from a
   * joined participant's own media socket. Without those checks the relay is a
   * general-purpose way to push arbitrary JSON at any user on the site.
   *
   * A dropped rate limit is silent here, unlike the lifecycle events: replying
   * to every dropped frame of a flood doubles the flood.
   */
  const relay = (
    inbound: string,
    outbound: string,
    maxBytes: number,
    key: 'description' | 'candidate',
  ): void => {
    socket.on(inbound, (payload: Record<string, unknown>) => {
      const userId = uid();
      if (!userId || !checkRateLimit(socket.id, inbound)) return;
      const callId = asId(payload?.callId);
      const call = callId ? calls.get(callId) : undefined;
      if (!call) return fail('unknown-call', 'That call is over', callId || undefined);

      const from = call.participants.get(userId);
      if (!from || from.joinedAt === null || from.socketId !== socket.id) {
        return fail('not-participant', 'You are not in this call', call.id);
      }

      const to = asId(payload?.to);
      const target = to ? call.participants.get(to) : undefined;
      if (!target || target.userId === userId || target.joinedAt === null || !target.socketId) {
        // Includes signalling at yourself, which would be a peer connection to
        // your own microphone.
        return fail('unknown-peer', 'No such peer in this call', call.id);
      }

      const body = payload?.[key];
      if (!body || typeof body !== 'object') return fail('malformed', `Missing ${key}`, call.id);
      if (key === 'description') {
        if (!isDescription(body)) return fail('malformed', 'Malformed description', call.id);
        // Exactly one side of every pair offers, decided by comparing the two
        // userIds — the glare rule both halves run from `shouldOffer`. An offer
        // from the wrong side is a client bug that would collide with the offer
        // the other side is making, so it is refused rather than relayed.
        if ((body.type === 'offer') !== shouldOffer(userId, target.userId)) {
          return fail('malformed', 'Wrong side of the offer/answer rule', call.id);
        }
      } else if (!isCandidate(body)) {
        return fail('malformed', 'Malformed candidate', call.id);
      }

      let size: number;
      try {
        size = JSON.stringify(body).length;
      } catch {
        return fail('malformed', `Unserialisable ${key}`, call.id);
      }
      if (size > maxBytes) return fail('too-large', `${key} over ${maxBytes} bytes`, call.id);

      io.to(target.socketId).emit(outbound, {
        callId: call.id,
        // Server-stamped. A sender does not get to say who they are.
        from: userId,
        [key]: body,
      });
    });
  };

  relay(GCALL_C2S.SIGNAL, GCALL_S2C.SIGNAL, MAX_SDP_BYTES, 'description');
  relay(GCALL_C2S.ICE, GCALL_S2C.ICE, MAX_ICE_BYTES, 'candidate');

  // ─── Published state (mute today, more later) ───
  socket.on(GCALL_C2S.STATE, (payload: Record<string, unknown>) => {
    const userId = uid();
    if (!userId || !checkRateLimit(socket.id, GCALL_C2S.STATE)) return;
    const callId = asId(payload?.callId);
    const call = callId ? calls.get(callId) : undefined;
    if (!call) return fail('unknown-call', 'That call is over', callId || undefined);
    const p = call.participants.get(userId);
    // The media socket is the tab holding the microphone, so it is the only tab
    // that can truthfully say whether that microphone is muted.
    if (!p || p.joinedAt === null || p.socketId !== socket.id) {
      return fail('not-participant', 'You are not in this call', call.id);
    }
    const muted = Boolean(payload?.muted);
    if (p.muted === muted) return;
    p.muted = muted;
    broadcast(io, call, GCALL_S2C.STATE, { callId: call.id, userId, muted });
  });

  // ─── Lookup: is there a live open room here? ───
  socket.on(GCALL_C2S.LOOKUP, async (payload: Record<string, unknown>) => {
    const userId = uid();
    if (!userId) return fail('unauthenticated', 'Sign in first');
    if (!checkRateLimit(socket.id, GCALL_C2S.LOOKUP)) return fail('rate-limited', 'Slow down');
    const origin = payload?.origin;
    if (origin !== 'community' && origin !== 'party') {
      return fail('malformed', 'Lookup needs a community or party origin');
    }
    const originId = asId(payload?.originId);
    if (!originId) return fail('malformed', 'Missing originId');

    // Answered only for members. "There is a voice call happening right now,
    // and here are four of the people in it" is a fact about a private
    // community that a non-member has no business learning — and an empty
    // answer leaks nothing, because an empty answer is also the truth most of
    // the time.
    if (!(await isOriginMember(origin, originId, userId))) {
      socket.emit(GCALL_S2C.ACTIVE, {
        origin,
        originId,
        callId: null,
        participantCount: 0,
        participants: [],
      });
      return;
    }

    // Asking is subscribing: from here on this socket gets the open/close
    // pushes for this origin without polling for them.
    void socket.join(originPresenceRoom(origin, originId));

    const liveId = byOrigin.get(originKey(origin, originId));
    const live = liveId ? calls.get(liveId) : undefined;
    socket.emit(GCALL_S2C.ACTIVE, {
      origin,
      originId,
      callId: live ? live.id : null,
      participantCount: live ? joinedCount(live) : 0,
      participants: live ? rosterOf(live).slice(0, ACTIVE_AVATAR_LIMIT) : [],
    });
  });
}

/**
 * Open a new room with its host already inside it.
 *
 * Contract decision #4: there is no pre-join phase for the host. They are a
 * participant from the moment they press call — standing in a room waiting for
 * company, not waiting to be admitted — which is why `startedAt` is set here
 * and never later.
 *
 * Returns `null` only if the busy claim was lost to a race, in which case the
 * caller refuses with `busy` and nothing has been created.
 */
function openRoom(
  socket: Socket,
  args: {
    host: CallPeer;
    origin: GroupCallOrigin;
    originId: string | null;
    conversationId: string | null;
  },
): LiveGroupCall | null {
  const id = uuidV7();
  if (!claimBusy(args.host.id, 'gcall', id)) return null;

  const at = Date.now();
  const call: LiveGroupCall = {
    id,
    hostId: args.host.id,
    host: args.host,
    origin: args.origin,
    originId: args.originId,
    conversationId: args.conversationId,
    participants: new Map([
      [
        args.host.id,
        {
          userId: args.host.id,
          name: args.host.name,
          image: args.host.image,
          handle: args.host.handle,
          socketId: socket.id,
          muted: false,
          joinedAt: at,
        },
      ],
    ]),
    invited: new Set([args.host.id]),
    declinedBy: new Set(),
    earlierStints: new Map(),
    ringTimers: new Map(),
    graceTimers: new Map(),
    createdAt: at,
    startedAt: at,
    peakParticipants: 1,
    othersJoined: false,
    rung: 0,
    declined: 0,
    persistChain: Promise.resolve(),
    admission: Promise.resolve(),
  };

  calls.set(id, call);
  byUser.set(args.host.id, id);
  if (args.origin !== 'adhoc' && args.originId) {
    byOrigin.set(originKey(args.origin, args.originId), id);
  }
  void socket.join(callRoom(id));

  persistRoomCreated(call);
  persistParticipant(call, call.participants.get(args.host.id) as LiveParticipant, {
    left: false,
    at,
  });
  return call;
}

/**
 * Someone stopped being a member of an open room's origin: take them out of its
 * voice room and stop telling their sockets who is in it. Membership is the
 * whole of an open room's admission rule, so it has to keep holding after
 * they are in, not just at the door.
 *
 * Wired for parties, whose membership lives in this process, the moment it
 * changes. A community membership is removed by the web tier, which has no
 * channel to this hub, so {@link sweepCommunityMembership} catches those within
 * {@link MEMBERSHIP_SWEEP_MS}.
 */
export function evictOriginMember(
  io: Server,
  origin: OpenRoomOrigin,
  originId: string,
  userId: string,
): void {
  io.in(userRoom(userId)).socketsLeave(originPresenceRoom(origin, originId));
  const callId = byOrigin.get(originKey(origin, originId));
  const call = callId ? calls.get(callId) : undefined;
  if (!call || !call.participants.has(userId)) return;
  const durationSec = Math.max(0, Math.round((Date.now() - call.startedAt) / 1000));
  dropParticipant(io, call, userId, 'left');
  io.to(userRoom(userId)).emit(GCALL_S2C.ENDED, { callId: call.id, reason: 'left', durationSec });
  settle(io, call);
}

onPartyMemberRemoved((io, partyId, userId) => evictOriginMember(io, 'party', partyId, userId));

/** How often community voice rooms and presence feeds re-check membership. */
export const MEMBERSHIP_SWEEP_MS = 60_000;
const COMMUNITY_PRESENCE_PREFIX = 'gcall:origin:community:';

/**
 * Which of `userIds` are still members of the community, or `null` when that
 * cannot be read. `null` evicts nobody: a database blip must not empty a room.
 */
async function communityMembersAmong(
  communityId: string,
  userIds: readonly string[],
): Promise<Set<string> | null> {
  if (userIds.length === 0) return new Set();
  try {
    const rows = await getPrismaClient().communityMember.findMany({
      where: { communityId, userId: { in: [...userIds] } },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  } catch (err) {
    logger.warn({ event: 'group_call_membership_sweep_failed', communityId, error: String(err) });
    return null;
  }
}

/**
 * Take people who are no longer community members out of its voice room and
 * its presence feed (a private community's "who is talking right now").
 *
 * One query per community with a live room or a subscriber, once a minute.
 */
export async function sweepCommunityMembership(io: Server): Promise<void> {
  for (const call of [...calls.values()]) {
    if (call.origin !== 'community' || !call.originId) continue;
    // Judge only the people asked about: someone who joined while the query
    // was out was admitted on a fresh membership check of their own.
    const asked = [...call.participants.keys()];
    const members = await communityMembersAmong(call.originId, asked);
    if (!members || calls.get(call.id) !== call) continue;
    for (const userId of asked) {
      if (!members.has(userId) && call.participants.has(userId)) {
        evictOriginMember(io, 'community', call.originId, userId);
      }
    }
  }

  const presenceRooms = [...io.sockets.adapter.rooms.keys()].filter((room) =>
    room.startsWith(COMMUNITY_PRESENCE_PREFIX),
  );
  for (const room of presenceRooms) {
    const communityId = room.slice(COMMUNITY_PRESENCE_PREFIX.length);
    const sockets = await io.in(room).fetchSockets();
    const userIds = [
      ...new Set(
        sockets
          .map((s) => s.data.userId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    const members = await communityMembersAmong(communityId, userIds);
    if (!members) continue;
    for (const s of sockets) {
      const id = s.data.userId;
      if (typeof id !== 'string' || !members.has(id)) s.leave(room);
    }
  }
}

/** Run {@link sweepCommunityMembership} on its interval. Never keeps the process alive. */
export function startCommunityMembershipSweep(io: Server): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    sweepCommunityMembership(io)
      .catch((err: unknown) =>
        logger.warn({ event: 'group_call_membership_sweep_failed', error: String(err) }),
      )
      .finally(() => {
        running = false;
      });
  }, MEMBERSHIP_SWEEP_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * A dropped socket.
 *
 * Two different rules, because a media socket and a ringing device are not the
 * same kind of thing:
 *
 * - **In the mesh.** Only the *bound* socket matters. A second tab closing does
 *   not touch the leg the first one is holding. When the bound socket goes, the
 *   seat is held for {@link GROUP_CALL_SEAT_GRACE_MS}: a signalling blip is
 *   usually not a media one, and the reconnecting client re-sends `JOIN`. If
 *   nothing claims it, they leave the room even with other tabs open — their
 *   busy claim is released, so they are reachable again rather than stuck in a
 *   call they cannot hear. A closed tab sends its own `LEAVE` and skips this.
 * - **Still ringing.** Give up only when the *last* device is gone, exactly as
 *   `call.ts` does: someone with the site open in two tabs is still reachable,
 *   and closing one of them should not answer for them.
 */
export async function handleGroupCallDisconnect(io: Server, socket: Socket): Promise<void> {
  const userId = typeof socket.data.userId === 'string' ? socket.data.userId : '';
  if (!userId) return;
  const callId = byUser.get(userId);
  if (!callId) return;
  const call = calls.get(callId);
  if (!call) return;
  const p = call.participants.get(userId);
  if (!p) return;

  if (p.joinedAt !== null) {
    if (p.socketId !== socket.id) return;
    // Hold the seat. A `JOIN` from the user's reconnecting socket inside the
    // window takes it back through `enterRoom`'s move-the-leg path; otherwise
    // they leave exactly as an explicit `LEAVE` would.
    p.socketId = null;
    clearGrace(call, userId);
    call.graceTimers.set(
      userId,
      setTimeout(() => {
        call.graceTimers.delete(userId);
        if (calls.get(call.id) !== call || call.participants.get(userId) !== p) return;
        if (p.socketId !== null) return;
        const durationSec = Math.max(0, Math.round((Date.now() - call.startedAt) / 1000));
        dropParticipant(io, call, userId, 'left');
        io.to(userRoom(userId)).emit(GCALL_S2C.ENDED, { callId: call.id, reason: 'left', durationSec });
        settle(io, call);
      }, GROUP_CALL_SEAT_GRACE_MS),
    );
    return;
  }

  try {
    const remaining = await io.in(userRoom(userId)).fetchSockets();
    if (remaining.length > 0) return;
  } catch {
    // If we cannot tell, stop ringing them — a phone that buzzes for a room
    // nobody can reach them in is worse than an extra missed call.
  }

  // The room, and their place in it, may both have changed while we awaited.
  if (calls.get(callId) !== call) return;
  if (call.participants.get(userId) !== p) return;
  dropParticipant(io, call, userId, 'left');
  settle(io, call);
}

/** Test seam: live-room count, for assertions about cleanup. */
export function __liveGroupCallCount(): number {
  return calls.size;
}
