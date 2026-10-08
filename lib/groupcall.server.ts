/**
 * Group voice calls — the database side.
 *
 * Media never reaches a server (`lib/groupcall/events.ts` explains why the mesh
 * stops at eight), so nothing here touches audio. What these helpers persist is
 * the call *record*: who was rung, who actually got in, how long they stayed and
 * how the room ended — enough for a DM thread to say "Missed group call", for a
 * community to show its voice history, and for the mesh cap to be audited after
 * the fact.
 *
 * ## Who calls what
 *
 * The module is written for the **web tier** — `app/routes/api/groupcalls/*` —
 * which is why the read helpers reach for presence, people search and community
 * membership. The socket hub is a separate bundle: `server/` is esbuilt from its
 * own Dockerfile stage that copies an explicit allowlist of `lib/` files, so the
 * hub cannot import this module unless someone adds it (and its whole import
 * graph) to that list. Rather than pretend otherwise, the write helpers below
 * are shaped so that *if* the hub ever does import them they work unchanged:
 *
 *  - every one takes an optional `db`, defaulting to the web tier's singleton,
 *    so the hub can pass its own client instead of opening a second pool (the
 *    same split `lib/economy/ledger-core.ts` exists for);
 *  - none of them read a session, a request or any web-tier state;
 *  - all of them are idempotent-ish and swallow nothing — the caller decides
 *    whether a failed history write is worth surfacing, which for a hub that is
 *    mid-signalling is always "no", hence {@link fireAndForget}.
 *
 * ## What is deliberately NOT here
 *
 * Admission. Whether someone may ring, join or open a room is decided by
 * `canJoinGroupCall` / `canJoinOpenRoom` in `lib/groupcall/state.ts`, on the hub,
 * before any row exists. A rejected call leaves no record at all, so a block or
 * a privacy setting cannot be read back out of somebody's history.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect, type ResolvedUser } from '@/lib/user-display';
import { getActiveFriends } from '@/lib/presence.server';
import { searchPeople } from '@/lib/search/people.server';
import { getRole } from '@/lib/communities/access.server';
import {
  MAX_GROUP_CALL_PARTICIPANTS,
  type GroupCallEndReason,
  type GroupCallLeaveReason,
  type GroupCallOrigin,
} from '@/lib/groupcall/events';
import { persistedOrigin, persistedStatus } from '@/lib/groupcall/state';

/* -------------------------------------------------------------------------- */
/* Client plumbing                                                            */
/* -------------------------------------------------------------------------- */

/** Any Prisma client: the base client or an interactive-transaction client. */
export type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Run a history write without letting it fail the thing it is recording.
 *
 * The hub is the intended caller: a room's audio does not depend on its row, so
 * a database blip must never take a live call down. Errors are logged, once, at
 * the point they happen.
 */
export function fireAndForget(label: string, work: Promise<unknown>): void {
  void work.catch((err: unknown) => {
    console.error(`[groupcall] ${label} failed:`, err);
  });
}

/** Prisma enum → the lowercase word the wire and the UI use. */
function wireOrigin(origin: 'ADHOC' | 'COMMUNITY' | 'PARTY'): GroupCallOrigin {
  switch (origin) {
    case 'ADHOC':
      return 'adhoc';
    case 'COMMUNITY':
      return 'community';
    case 'PARTY':
      return 'party';
  }
}

/**
 * The `originId` for a persisted row, whichever column it landed in.
 *
 * `communityId` and `partyId` are separate columns because only one of them can
 * be a foreign key (parties have no table); the wire has a single `originId`,
 * so this is the join between the two shapes.
 */
function wireOriginId(row: { communityId: string | null; partyId: string | null }): string | null {
  return row.communityId ?? row.partyId ?? null;
}

/** Whole seconds between two instants, floored at 0. A clock skew is not a debt. */
function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export interface RecordGroupCallStartedInput {
  hostId: string;
  origin: GroupCallOrigin;
  /** Community id or party id. Null for `adhoc`. */
  originId?: string | null;
  /** The DM thread this started from, when it did. */
  conversationId?: string | null;
  /**
   * Who is being rung. `adhoc` only — nobody is rung into an open room — and
   * silently truncated to the mesh cap rather than refused, matching the hub's
   * own handling of an oversized `START`.
   */
  inviteeIds?: readonly string[];
  /** Override the clock, for tests and for replaying a backdated event. */
  now?: Date;
}

/**
 * Open a room's record: the `GroupCall` row plus a participant row per person.
 *
 * The host's row is written as JOINED, because starting a call is joining it —
 * for `adhoc` the starter is already in while everyone else rings, and for an
 * open room the opener is the first one through the door. Invitees are INVITED
 * (`joinedAt` null), which is the same fact the roster expresses as "Ringing…".
 *
 * Returns the new `callId`. Prisma generates the uuid(7) client-side, so the id
 * exists the moment this resolves and the hub can put it on the wire — this is
 * the one write here that must be awaited rather than fired and forgotten.
 */
export async function recordGroupCallStarted(
  input: RecordGroupCallStartedInput,
  db: Db = prisma,
): Promise<{ callId: string; startedAt: Date }> {
  const now = input.now ?? new Date();
  const persisted = persistedOrigin(input.origin);
  const invitees = [...new Set(input.inviteeIds ?? [])]
    .filter((id) => id !== input.hostId)
    // The cap counts the host, so this is what is left of the room.
    .slice(0, MAX_GROUP_CALL_PARTICIPANTS - 1);

  const call = await db.groupCall.create({
    data: {
      hostId: input.hostId,
      origin: persisted,
      communityId: persisted === 'COMMUNITY' ? (input.originId ?? null) : null,
      partyId: persisted === 'PARTY' ? (input.originId ?? null) : null,
      conversationId: input.conversationId ?? null,
      // An open room is live the instant it exists; only an ad-hoc room rings.
      status: persisted === 'ADHOC' ? 'RINGING' : 'ACTIVE',
      createdAt: now,
      startedAt: now,
      peakParticipants: 1,
      participants: {
        create: [
          { userId: input.hostId, status: 'JOINED', invitedAt: now, joinedAt: now },
          ...(persisted === 'ADHOC'
            ? invitees.map((userId) => ({ userId, status: 'INVITED' as const, invitedAt: now }))
            : []),
        ],
      },
    },
    select: { id: true, startedAt: true },
  });

  return { callId: call.id, startedAt: call.startedAt ?? now };
}

/**
 * Ring more people into a room that already exists.
 *
 * `skipDuplicates` rather than an upsert loop: re-inviting someone who is
 * already on the roster — as a mid-call invite race will do — must not reset
 * their JOINED row back to INVITED.
 */
export async function recordParticipantsInvited(
  args: { callId: string; userIds: readonly string[]; now?: Date },
  db: Db = prisma,
): Promise<void> {
  const invitedAt = args.now ?? new Date();
  const userIds = [...new Set(args.userIds)];
  if (userIds.length === 0) return;

  await db.groupCallParticipant.createMany({
    data: userIds.map((userId) => ({
      callId: args.callId,
      userId,
      status: 'INVITED' as const,
      invitedAt,
    })),
    skipDuplicates: true,
  });
}

/**
 * Someone entered the room.
 *
 * Upsert rather than update, because an open room has no invite step at all —
 * the first this table hears of a community member is that they walked in.
 *
 * Also moves the call out of RINGING and keeps `peakParticipants` monotonic.
 * `participantCount` is the hub's own roster size when it has one (it always
 * does); without it the count is read back, which is a second query but never a
 * wrong answer.
 */
export async function recordParticipantJoined(
  args: { callId: string; userId: string; participantCount?: number; now?: Date },
  db: Db = prisma,
): Promise<void> {
  const now = args.now ?? new Date();

  await db.groupCallParticipant.upsert({
    where: { callId_userId: { callId: args.callId, userId: args.userId } },
    create: {
      callId: args.callId,
      userId: args.userId,
      status: 'JOINED',
      invitedAt: now,
      joinedAt: now,
    },
    update: { status: 'JOINED', joinedAt: now, leftAt: null },
  });

  const peak =
    args.participantCount ??
    (await db.groupCallParticipant.count({
      where: { callId: args.callId, status: 'JOINED' },
    }));

  // `updateMany` with the guards in the WHERE clause, not a read-then-write:
  // two people joining at once must not let the lower peak win, and a room that
  // has already ENDED must not be dragged back to ACTIVE by a late join event.
  await db.groupCall.updateMany({
    where: { id: args.callId, status: 'RINGING' },
    data: { status: 'ACTIVE' },
  });
  await db.groupCall.updateMany({
    where: { id: args.callId, peakParticipants: { lt: peak } },
    data: { peakParticipants: peak },
  });
}

/**
 * Someone is off the roster.
 *
 * The reason only decides how a **never-joined** row is described; a person who
 * was actually in the room always ends up LEFT (or FAILED), with the time they
 * spent there denormalised onto their row so a history list never has to
 * subtract two timestamps per participant.
 */
export async function recordParticipantLeft(
  args: {
    callId: string;
    userId: string;
    reason?: GroupCallLeaveReason;
    now?: Date;
  },
  db: Db = prisma,
): Promise<void> {
  const now = args.now ?? new Date();
  const row = await db.groupCallParticipant.findUnique({
    where: { callId_userId: { callId: args.callId, userId: args.userId } },
    select: { joinedAt: true, leftAt: true },
  });
  if (!row || row.leftAt) return;

  const joined = row.joinedAt !== null;
  const status = joined
    ? args.reason === 'failed'
      ? ('FAILED' as const)
      : ('LEFT' as const)
    : args.reason === 'declined'
      ? ('DECLINED' as const)
      : args.reason === 'failed'
        ? ('FAILED' as const)
        : ('MISSED' as const);

  await db.groupCallParticipant.update({
    where: { callId_userId: { callId: args.callId, userId: args.userId } },
    data: {
      status,
      leftAt: now,
      durationSec: row.joinedAt ? secondsBetween(row.joinedAt, now) : 0,
    },
  });
}

/**
 * A ring was refused.
 *
 * Scoped to `status: 'INVITED'` so a decline arriving from a second tab after
 * the first tab answered cannot un-join someone.
 */
export async function recordParticipantDeclined(
  args: { callId: string; userId: string; now?: Date },
  db: Db = prisma,
): Promise<void> {
  const now = args.now ?? new Date();
  await db.groupCallParticipant.updateMany({
    where: { callId: args.callId, userId: args.userId, status: 'INVITED' },
    data: { status: 'DECLINED', leftAt: now },
  });
}

/**
 * A ring timed out.
 *
 * Takes a list because that is how it actually happens — {@link
 * GROUP_RING_TIMEOUT_MS} fires once and drops every invitee who never answered,
 * not one at a time. Pass a single-element array for the one-person case.
 */
export async function recordParticipantMissed(
  args: { callId: string; userIds: readonly string[]; now?: Date },
  db: Db = prisma,
): Promise<void> {
  const userIds = [...new Set(args.userIds)];
  if (userIds.length === 0) return;
  await db.groupCallParticipant.updateMany({
    where: { callId: args.callId, userId: { in: userIds }, status: 'INVITED' },
    data: { status: 'MISSED', leftAt: args.now ?? new Date() },
  });
}

/**
 * Close the room's record.
 *
 * Three things happen together, and they have to: anyone still marked JOINED is
 * closed out (a hub restart is exactly the case where nobody sent a LEAVE),
 * anyone still INVITED becomes MISSED, and the call takes the status
 * `persistedStatus()` derives from the end reason.
 *
 * `everJoined` — "did anyone besides the host get in" — is read rather than
 * passed, because it is the one input this function cannot be lied to about and
 * the whole distinction between "a call happened" and "a call did not" hangs on
 * it. Safe to call twice: the WHERE clauses make the second pass a no-op.
 */
export async function endGroupCallRecord(
  args: { callId: string; reason: GroupCallEndReason; now?: Date },
  db: Db = prisma,
): Promise<void> {
  const now = args.now ?? new Date();

  const call = await db.groupCall.findUnique({
    where: { id: args.callId },
    select: {
      hostId: true,
      endedAt: true,
      participants: {
        select: { userId: true, joinedAt: true, leftAt: true, status: true },
      },
    },
  });
  if (!call || call.endedAt) return;

  const everJoined = call.participants.some((p) => p.joinedAt !== null && p.userId !== call.hostId);

  // Still in the room when the lights went out.
  for (const p of call.participants) {
    if (p.leftAt || p.joinedAt === null) continue;
    await db.groupCallParticipant.update({
      where: { callId_userId: { callId: args.callId, userId: p.userId } },
      data: {
        status: args.reason === 'failed' ? 'FAILED' : 'LEFT',
        leftAt: now,
        durationSec: secondsBetween(p.joinedAt, now),
      },
    });
  }

  // Still ringing when the room closed. `declined` is only theirs if that is
  // literally what happened; every other ending leaves them as a missed ring.
  await db.groupCallParticipant.updateMany({
    where: { callId: args.callId, status: 'INVITED' },
    data: { status: args.reason === 'declined' ? 'DECLINED' : 'MISSED', leftAt: now },
  });

  await db.groupCall.updateMany({
    where: { id: args.callId, endedAt: null },
    data: { status: persistedStatus(args.reason, everJoined), endedAt: now },
  });
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Where a history row's own call happened, in the wire's vocabulary. */
export interface GroupCallHistoryEntry {
  callId: string;
  origin: GroupCallOrigin;
  originId: string | null;
  conversationId: string | null;
  hostId: string;
  /** True when the viewer opened the room. */
  hosted: boolean;
  status: 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'DECLINED' | 'FAILED';
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  /** The most people in the room at once — what "5 people" on the row means. */
  peakParticipants: number;
  /** The viewer's own leg of it. */
  self: {
    status: 'INVITED' | 'JOINED' | 'LEFT' | 'DECLINED' | 'MISSED' | 'FAILED';
    invitedAt: Date;
    joinedAt: Date | null;
    leftAt: Date | null;
    durationSec: number;
  };
  /** Everyone else who was on the roster, viewer excluded. */
  participants: ResolvedUser[];
}

export interface GroupCallHistoryPage {
  calls: GroupCallHistoryEntry[];
  /** Opaque; feed it back as `cursor`. Null at the end of the list. */
  nextCursor: string | null;
}

/** Hard ceiling on a history page, whatever the caller asks for. */
const MAX_HISTORY_TAKE = 50;

/**
 * The calls this account took part in, newest first.
 *
 * Scanned from `GroupCallParticipant`, not from `GroupCall`: the viewer is a
 * participant of every row they may see, `@@index([userId, invitedAt DESC])`
 * makes that scan a range read, and starting from the call table instead would
 * mean an `OR` across host and roster that no index covers. It also means a
 * missed ring — a row with no `joinedAt` — is in the list, which is the whole
 * point of a call history.
 *
 * Keyset pagination on `(invitedAt DESC, callId DESC)` with the cursor spelled
 * as the last `callId`, because `GroupCallParticipant.id` is a `BigInt` and
 * putting one on the wire means either a lossy `Number` or a client that has to
 * know about `BigInt` JSON.
 */
export async function getGroupCallHistory(
  userId: string,
  opts: { take?: number; cursor?: string | null } = {},
): Promise<GroupCallHistoryPage> {
  const take = Math.min(Math.max(1, opts.take ?? 20), MAX_HISTORY_TAKE);

  const rows = await prisma.groupCallParticipant.findMany({
    where: { userId },
    orderBy: [{ invitedAt: 'desc' }, { callId: 'desc' }],
    // Fetch one extra to learn whether there is a next page without a COUNT.
    take: take + 1,
    ...(opts.cursor ? { cursor: { callId_userId: { callId: opts.cursor, userId } }, skip: 1 } : {}),
    select: {
      status: true,
      invitedAt: true,
      joinedAt: true,
      leftAt: true,
      durationSec: true,
      call: {
        select: {
          id: true,
          hostId: true,
          origin: true,
          communityId: true,
          partyId: true,
          conversationId: true,
          status: true,
          createdAt: true,
          startedAt: true,
          endedAt: true,
          peakParticipants: true,
          participants: {
            // The roster is capped at eight, so this is a bounded join.
            where: { userId: { not: userId } },
            orderBy: { invitedAt: 'asc' },
            select: { user: { select: userDisplaySelect } },
          },
        },
      },
    },
  });

  const page = rows.slice(0, take);
  return {
    calls: page.map((row) => ({
      callId: row.call.id,
      origin: wireOrigin(row.call.origin),
      originId: wireOriginId(row.call),
      conversationId: row.call.conversationId,
      hostId: row.call.hostId,
      hosted: row.call.hostId === userId,
      status: row.call.status,
      createdAt: row.call.createdAt,
      startedAt: row.call.startedAt,
      endedAt: row.call.endedAt,
      peakParticipants: row.call.peakParticipants,
      self: {
        status: row.status,
        invitedAt: row.invitedAt,
        joinedAt: row.joinedAt,
        leftAt: row.leftAt,
        durationSec: row.durationSec,
      },
      participants: row.call.participants.map((p) => resolveUser(p.user)),
    })),
    nextCursor: rows.length > take ? (page[page.length - 1]?.call.id ?? null) : null,
  };
}

/** One row of the invite picker. */
export interface InvitableUser {
  id: string;
  name: string | null;
  handle: string | null;
  username: string | null;
  image: string | null;
  /** A mutual who is online right now — the people worth ringing first. */
  online: boolean;
}

/**
 * How long the picker list gets. Well above {@link MAX_GROUP_CALL_PARTICIPANTS}
 * on purpose: the cap is how many people can be *in* a room, not how many are
 * worth offering.
 */
const INVITABLE_LIMIT = 20;

/**
 * Who the viewer can sensibly ring into a call.
 *
 * Online mutuals first and always, because a group call is a synchronous thing
 * and a person who is not here cannot answer. Typing a query does not replace
 * that list, it extends it: the mutuals are filtered by the same string and
 * people search fills the rest of the page, so a friend who is online never
 * falls off the list just because someone with a better fuzzy score exists.
 *
 * This is a *convenience* list, not an authorisation. Everyone on it still has
 * to pass `canJoinGroupCall` on the hub when they are actually rung — privacy
 * settings and blocks are decided there, once, where they cannot be raced.
 */
export async function getInvitableUsers(
  viewerId: string,
  opts: { q?: string | null; limit?: number } = {},
): Promise<InvitableUser[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? INVITABLE_LIMIT), INVITABLE_LIMIT);
  const q = opts.q?.trim() ?? '';

  const friends = await getActiveFriends(viewerId).catch(() => []);
  const needle = q.toLowerCase();
  const matches = (u: { name: string | null; handle: string | null; username: string | null }) =>
    !needle || [u.name, u.handle, u.username].some((v) => v?.toLowerCase().includes(needle));

  const out: InvitableUser[] = [];
  const seen = new Set<string>([viewerId]);

  for (const friend of friends) {
    if (seen.has(friend.user.id) || !matches(friend.user)) continue;
    seen.add(friend.user.id);
    out.push({ ...friend.user, online: true });
    if (out.length >= limit) return out;
  }

  if (!q) return out;

  // `excludeUserId` keeps the viewer out at the SQL level; `seen` then drops the
  // mutuals already placed above so nobody appears twice with a different flag.
  const found = await searchPeople(q.slice(0, 64), {
    limit: limit - out.length,
    excludeUserId: viewerId,
  }).catch(() => []);

  for (const hit of found) {
    if (seen.has(hit.user.id)) continue;
    seen.add(hit.user.id);
    out.push({
      id: hit.user.id,
      name: hit.user.name,
      handle: hit.user.handle,
      username: hit.user.username,
      image: hit.user.image,
      online: false,
    });
    if (out.length >= limit) break;
  }

  return out;
}

/** The live open room for a community, as the "Join voice · 3" pill needs it. */
export interface ActiveRoomSummary {
  callId: string;
  hostId: string;
  startedAt: Date | null;
  /** People actually in the room — invitees do not exist for an open room. */
  participantCount: number;
  /** True at {@link MAX_GROUP_CALL_PARTICIPANTS}: the pill should not invite a ninth. */
  full: boolean;
}

/**
 * Is there a voice room running in this community right now?
 *
 * Backed by `@@index([communityId, status])`, so this is the one lookup the pill
 * costs. `RINGING` is included with `ACTIVE` for robustness only — an open room
 * is created ACTIVE and nobody is ever rung into one — so that a row left in an
 * unexpected state by a crash is still visible to the janitor and to the UI
 * rather than silently invisible.
 *
 * **Membership is not checked here.** Deciding who may know a room exists is the
 * caller's job, and the API route does it before calling this (see
 * `app/routes/api/groupcalls/active.ts`); putting it here as well would mean two
 * places that must agree about what a community member is.
 */
export async function getActiveCommunityRoom(
  communityId: string,
): Promise<ActiveRoomSummary | null> {
  const call = await prisma.groupCall.findFirst({
    where: { communityId, status: { in: ['ACTIVE', 'RINGING'] }, endedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      hostId: true,
      startedAt: true,
      _count: { select: { participants: { where: { status: 'JOINED' } } } },
    },
  });
  if (!call) return null;

  const participantCount = call._count.participants;
  return {
    callId: call.id,
    hostId: call.hostId,
    startedAt: call.startedAt,
    participantCount,
    full: participantCount >= MAX_GROUP_CALL_PARTICIPANTS,
  };
}

/**
 * The viewer's role in a community, or null when they are not a member.
 *
 * Re-exported through this module so the group-call routes have one import for
 * "may this person see this room" rather than reaching around it into the
 * community package — the check itself is still `lib/communities/access.server`.
 */
export async function getCommunityMembership(
  communityId: string,
  userId: string,
): Promise<'MEMBER' | 'MOD' | 'ADMIN' | null> {
  return getRole(communityId, userId);
}
