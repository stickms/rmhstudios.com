/**
 * "Turn off reposts from X" (sprint 05 #07), server side.
 *
 * A member's list of people whose reposts are hidden from their Following and For You timelines. It is a preference,
 * not access control: the timeline reads the ids through `getRepostMutedIds` (cached per viewer for 30 s, the empty
 * list too, and dropped on every change), so a timeline request costs no extra query once warm. The other person is
 * never told and cannot see it.
 *
 * `.server.ts`: never import from a component.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { decodeCursor, encodeCursor } from '@/lib/feed/cursor';
import {
  REPOST_MUTE_LIMIT,
  REPOST_MUTE_PAGE_SIZE,
  type RepostMutePage,
  type RepostMuteRow,
} from '@/lib/feed/repost-mutes';

const MUTED_TTL_MS = 30_000;
const mutedKey = (userId: string) => `repost-mutes:${userId}`;

export type RepostMuteFailure = 'self' | 'not-found' | 'limit';

/** A refusal the endpoint turns into a status: 400 `self`, 404 `not-found`, 409 `limit`. */
export class RepostMuteError extends Error {
  readonly code: RepostMuteFailure;
  constructor(code: RepostMuteFailure) {
    super(code);
    this.name = 'RepostMuteError';
    this.code = code;
  }
}

/**
 * The ids whose reposts `userId` turned off. Cached 30 s per viewer, the empty list included. A failed read serves
 * everyone's reposts rather than failing the timeline: this is a preference, not a block.
 */
export async function getRepostMutedIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  try {
    return await cached<string[]>(mutedKey(userId), MUTED_TTL_MS, async () => {
      const rows = await prisma.repostMute.findMany({
        where: {
          userId,
        },
        select: {
          targetId: true,
        },
        take: REPOST_MUTE_LIMIT,
      });
      return rows.map((r) => r.targetId);
    });
  } catch (err) {
    console.error('[repost-mutes] getRepostMutedIds failed:', err);
    return [];
  }
}

/** Drop the member's cached list so the next timeline read sees the change at once. */
export function invalidateRepostMutes(userId: string): void {
  void invalidateCached(mutedKey(userId));
}

/**
 * Turn reposts from `targetId` off (`off: true`) or back on for `userId`. Idempotent. Turning off refuses yourself, an
 * unknown person and a person in a block with you (404, the same as unknown), and refuses the 1,001st person: the cap
 * is checked inside a transaction that first takes the member's lock, so two requests cannot both take the last place.
 */
export async function toggleRepostMute(
  userId: string,
  targetId: string,
  off: boolean,
): Promise<{
  off: boolean;
  changed: boolean;
}> {
  if (userId === targetId) throw new RepostMuteError('self');
  // The shared "Deleted user" sentinel is not a person whose reposts can be turned off.
  if (off && targetId === DELETED_USER_ID) throw new RepostMuteError('not-found');

  if (!off) {
    const { count } = await prisma.repostMute.deleteMany({
      where: {
        userId,
        targetId,
      },
    });
    invalidateRepostMutes(userId);
    return {
      off: false,
      changed: count > 0,
    };
  }

  const [target, block] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: targetId,
      },
      select: {
        id: true,
      },
    }),
    prisma.userBlock.findFirst({
      where: {
        OR: [
          {
            blockerId: userId,
            blockedId: targetId,
          },
          {
            blockerId: targetId,
            blockedId: userId,
          },
        ],
      },
      select: {
        id: true,
      },
    }),
  ]);
  if (!target || block) throw new RepostMuteError('not-found');

  const changed = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `repost-mutes:${userId}`);
    const existing = await tx.repostMute.findUnique({
      where: {
        userId_targetId: {
          userId,
          targetId,
        },
      },
      select: {
        id: true,
      },
    });
    if (existing) return false;
    if (
      (await tx.repostMute.count({
        where: {
          userId,
        },
      })) >= REPOST_MUTE_LIMIT
    ) {
      throw new RepostMuteError('limit');
    }
    await tx.repostMute.create({
      data: {
        userId,
        targetId,
      },
    });
    return true;
  });
  invalidateRepostMutes(userId);
  return {
    off: true,
    changed,
  };
}

/**
 * Blocking someone makes the repost-mute row dead weight (a block already hides everything), so it goes in the same
 * transaction as the block. The caller drops the cached list once the transaction commits.
 */
export async function clearRepostMuteForBlock(
  tx: Prisma.TransactionClient,
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await tx.repostMute.deleteMany({
    where: {
      userId: blockerId,
      targetId: blockedId,
    },
  });
}

/** `escape` for a LIKE-free `contains`: Prisma parameterises it, so the text only needs trimming. */
function searchWhere(q: string): Prisma.RepostMuteWhereInput {
  return {
    target: {
      OR: [
        {
          name: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          handle: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          username: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          profile: {
            is: {
              displayName: {
                contains: q,
                mode: 'insensitive',
              },
            },
          },
        },
      ],
    },
  };
}

/**
 * One page of the member's list, newest first, keyset-paginated on `(createdAt, id)`. A person who blocked the member
 * is listed as unavailable with no profile details, so the member can still turn the row off but learns nothing else.
 * `target` answers a single "is this person off?" question for the post menu and returns no rows.
 */
export async function listRepostMutes(
  userId: string,
  opts: {
    cursor?: string | null | undefined;
    q?: string | undefined;
    target?: string | undefined;
  } = {},
): Promise<RepostMutePage> {
  const total = await prisma.repostMute.count({
    where: {
      userId,
    },
  });
  if (opts.target) {
    const hit = await prisma.repostMute.findUnique({
      where: {
        userId_targetId: {
          userId,
          targetId: opts.target,
        },
      },
      select: {
        id: true,
      },
    });
    return {
      rows: [],
      nextCursor: null,
      total,
      targetOff: !!hit,
    };
  }

  const cursor = decodeCursor(opts.cursor);
  const q = opts.q?.trim();
  const where: Prisma.RepostMuteWhereInput = {
    userId,
    ...(q ? searchWhere(q) : {}),
    ...(cursor
      ? {
          OR: [
            {
              createdAt: {
                lt: cursor.createdAt,
              },
            },
            {
              createdAt: cursor.createdAt,
              id: {
                lt: cursor.id,
              },
            },
          ],
        }
      : {}),
  };
  const found = await prisma.repostMute.findMany({
    where,
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: REPOST_MUTE_PAGE_SIZE + 1,
    select: {
      id: true,
      targetId: true,
      createdAt: true,
      target: {
        select: userDisplaySelect,
      },
    },
  });
  const hasMore = found.length > REPOST_MUTE_PAGE_SIZE;
  const page = hasMore ? found.slice(0, REPOST_MUTE_PAGE_SIZE) : found;

  const blockedBy = page.length
    ? await prisma.userBlock.findMany({
        where: {
          blockedId: userId,
          blockerId: {
            in: page.map((r) => r.targetId),
          },
        },
        select: {
          blockerId: true,
        },
      })
    : [];
  const blockers = new Set(blockedBy.map((b) => b.blockerId));

  const rows: RepostMuteRow[] = page.map((r) => {
    const since = r.createdAt.toISOString();
    if (blockers.has(r.targetId)) {
      return {
        userId: r.targetId,
        name: null,
        image: null,
        handle: null,
        unavailable: true,
        since,
      };
    }
    const person = resolveUser(r.target);
    return {
      userId: r.targetId,
      name: person.name,
      image: person.image,
      handle: person.handle,
      unavailable: false,
      since,
    };
  });

  const last = page[page.length - 1];
  return {
    rows,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    total,
    targetOff: null,
  };
}

/** The operations `anonymizeAccount` runs: rows where the member is either side. Prisma operations only. */
export function repostMuteErasureOps(userId: string) {
  return [
    prisma.repostMute.deleteMany({
      where: {
        OR: [
          {
            userId,
          },
          {
            targetId: userId,
          },
        ],
      },
    }),
  ];
}

/** The member's own list for the account export: who, and since when. Rows others hold about the member are not theirs. */
export async function exportRepostMutes(userId: string): Promise<
  {
    userId: string;
    handle: string | null;
    since: string;
  }[]
> {
  const rows = await prisma.repostMute.findMany({
    where: {
      userId,
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: REPOST_MUTE_LIMIT,
    select: {
      targetId: true,
      createdAt: true,
      target: {
        select: {
          handle: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    userId: r.targetId,
    handle: r.target.handle ?? null,
    since: r.createdAt.toISOString(),
  }));
}
