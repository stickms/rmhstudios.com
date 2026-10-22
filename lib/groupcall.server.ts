/**
 * Group voice calls — the database side.
 *
 * Media never reaches a server (`lib/groupcall/events.ts` explains why the mesh
 * stops at eight), so nothing here touches audio. What these helpers read is
 * the call *record* the hub writes: who was rung, who actually got in, how long
 * they stayed and how the room ended — enough for a call history, a community's
 * live-room pill, and for the mesh cap to be audited after the fact.
 *
 * ## Who calls what
 *
 * Reads only, for the **web tier** — `app/routes/api/groupcalls/*` — which is
 * why these helpers reach for presence, people search and community membership.
 * Every write happens on the socket hub, which owns the live room and persists
 * it through its own fire-and-forget chain (`persist*` in
 * `server/socket-server/handlers/group-call.ts`); keeping the writes in one
 * place keeps one definition of what a row means.
 *
 * ## What is deliberately NOT here
 *
 * Admission. Whether someone may ring, join or open a room is decided by
 * `canJoinGroupCall` / `canJoinOpenRoom` in `lib/groupcall/state.ts`, on the hub,
 * before any row exists. A rejected call leaves no record at all, so a block or
 * a privacy setting cannot be read back out of somebody's history.
 */

import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect, type ResolvedUser } from '@/lib/user-display';
import { getActiveFriends } from '@/lib/presence.server';
import { searchPeople } from '@/lib/search/people.server';
import { getRole } from '@/lib/communities/access.server';
import { MAX_GROUP_CALL_PARTICIPANTS, type GroupCallOrigin } from '@/lib/groupcall/events';

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                */
/* -------------------------------------------------------------------------- */

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
  /** Number of distinct roster rows for this room, viewer excluded. */
  participantCount: number;
  /** Bounded preview of other participants; the count covers the full history. */
  participants: ResolvedUser[];
}

export interface GroupCallHistoryPage {
  calls: GroupCallHistoryEntry[];
  /** Opaque; feed it back as `cursor`. Null at the end of the list. */
  nextCursor: string | null;
}

/** Hard ceiling on a history page, whatever the caller asks for. */
const MAX_HISTORY_TAKE = 50;
const HISTORY_PARTICIPANT_PREVIEW = 8;

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
          _count: {
            select: { participants: { where: { userId: { not: userId } } } },
          },
          participants: {
            // Open rooms can outlive many successive participants.
            where: { userId: { not: userId } },
            orderBy: { invitedAt: 'asc' },
            take: HISTORY_PARTICIPANT_PREVIEW,
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
      participantCount: row.call._count.participants,
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
