/**
 * Managing a group chat (s04-10): the rules that need no database. Client-safe.
 *
 * Only the owner changes a group; any member reads the list and may leave. The
 * server (`manage.server.ts`) applies these inside a transaction that holds the
 * group's advisory lock and re-reads `Chat.ownerId`, so two changes racing each
 * other cannot leave a group with two owners or none.
 */

/** A group holds at most this many members, the owner included (creation allows 50 others). */
export const GROUP_MEMBER_CAP = 51;

/** The most people one Add request names. */
export const ADD_BATCH_MAX = 10;

export const GROUP_NAME_MAX = 60;

export function isGroupOwner(ownerId: string | null | undefined, userId: string): boolean {
  return !!ownerId && ownerId === userId;
}

/** How many more people a group with `memberCount` members can take. */
export function seatsLeft(memberCount: number): number {
  return Math.max(0, GROUP_MEMBER_CAP - memberCount);
}

export interface CandidateUser {
  id: string;
  bannedUntil: Date | null;
}

/**
 * Who of `requested` may join a group: known, not the adder, not banned, not the tombstone and in no block with
 * the adder (either direction). Duplicates count once. `refused` is every requested person left out: the caller
 * reports the count and never the reason.
 */
export function splitCandidates(input: {
  adderId: string;
  requestedIds: readonly string[];
  found: readonly CandidateUser[];
  blockedIds: ReadonlySet<string>;
  tombstoneId: string;
  now: Date;
}): {
  allowed: string[];
  refused: number;
} {
  const known = new Map(input.found.map((u) => [u.id, u]));
  const allowed: string[] = [];
  let refused = 0;
  for (const id of new Set(input.requestedIds)) {
    if (id === input.adderId) continue;
    const user = known.get(id);
    const banned = !!user?.bannedUntil && user.bannedUntil.getTime() > input.now.getTime();
    if (!user || banned || id === input.tombstoneId || input.blockedIds.has(id)) refused += 1;
    else allowed.push(id);
  }
  return {
    allowed,
    refused,
  };
}

/**
 * Apply the member cap to people who passed the checks and are not yet in the group: the first `seatsLeft` join,
 * the rest are refused like anyone else.
 */
export function applyCap(
  candidates: readonly string[],
  memberCount: number,
): {
  join: string[];
  refused: number;
} {
  const join = candidates.slice(0, seatsLeft(memberCount));
  return {
    join,
    refused: candidates.length - join.length,
  };
}

/** The member who inherits a group the owner leaves: the longest-standing one, ties broken by id. */
export function pickHeir(
  members: readonly {
    userId: string;
    joinedAt: Date;
  }[],
  leavingId: string,
): string | null {
  const rest = members.filter((m) => m.userId !== leavingId);
  rest.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || (a.userId < b.userId ? -1 : 1));
  return rest[0]?.userId ?? null;
}
