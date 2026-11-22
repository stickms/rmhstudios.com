/**
 * Pinned posts on a profile (sprint 05 #19), server side.
 *
 * A member pins up to three of their own top-level posts, in the order they were pinned, and can trade places with a
 * neighbour. Every change takes `lockKey(tx, 'profile-pins:' + userId)` first, so two requests cannot both see two
 * pins and both add a third. A pin only counts while its post is live: a deleted post, one moderation took down or
 * one past its expiry frees its slot (every removal path also clears `pinnedAt` as it sets `deletedAt`).
 *
 * `.server.ts`: never import from a component.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import {
  PIN_LIMIT,
  nextPinnedAt,
  pinLimitMessage,
  pinPlace,
  pinsAreFull,
  sortPins,
  swapWithNeighbour,
  type PinDirection,
  type PinSlot,
} from '@/lib/feed/profile-pins';
import type { PinState } from '@/lib/feed/profile-pins.contract';

export type PinFailure = 'not-found' | 'forbidden' | 'not-pinnable' | 'limit' | 'not-pinned' | 'at-end';

/** A refusal the endpoints turn into a status: 404, 403, 400, 409, 409, 409. */
export class PinError extends Error {
  readonly code: PinFailure;
  constructor(code: PinFailure) {
    super(code);
    this.name = 'PinError';
    this.code = code;
  }
}

/** The status each refusal answers with. */
export const PIN_FAILURE_STATUS: Record<PinFailure, number> = {
  'not-found': 404,
  forbidden: 403,
  'not-pinnable': 400,
  limit: 409,
  'not-pinned': 409,
  'at-end': 409,
};

const REFUSALS: Record<PinFailure, string> = {
  'not-found': 'Post not found',
  forbidden: 'You can only pin your own posts',
  'not-pinnable': 'Only your own top-level posts can be pinned to your profile',
  limit: pinLimitMessage(),
  'not-pinned': 'This post is not pinned',
  'at-end': 'This post cannot move further',
};

/** A pin refusal as its response; anything else is rethrown for the handler's own error path. */
export function pinRefusal(err: unknown): Response {
  if (err instanceof PinError) {
    return Response.json(
      {
        error: REFUSALS[err.code],
      },
      {
        status: PIN_FAILURE_STATUS[err.code],
      },
    );
  }
  throw err;
}

/**
 * A member's pins that still count: not deleted (which is also how moderation takes a post down) and not expired.
 * The same filters the profile read applies, so the count and the page agree.
 */
export function livePinsWhere(userId: string, now: Date): Prisma.RMHarkWhereInput {
  return {
    userId,
    pinnedAt: {
      not: null,
    },
    deletedAt: null,
    OR: [
      {
        expiresAt: null,
      },
      {
        expiresAt: {
          gt: now,
        },
      },
    ],
  };
}

type Db = Prisma.TransactionClient | typeof prisma;

/** The member's live pins, in profile order. Rides the `(userId, pinnedAt)` index. */
export async function listPinned(userId: string, db: Db = prisma, now: Date = new Date()): Promise<PinSlot[]> {
  const rows = await db.rMHark.findMany({
    where: livePinsWhere(userId, now),
    orderBy: [
      {
        pinnedAt: 'asc',
      },
      {
        id: 'asc',
      },
    ],
    select: {
      id: true,
      pinnedAt: true,
    },
  });
  return (Array.isArray(rows) ? rows : []).flatMap((r) =>
    r.pinnedAt
      ? [
          {
            id: r.id,
            pinnedAt: r.pinnedAt,
          },
        ]
      : [],
  );
}

function stateOf(pins: readonly PinSlot[], postId: string): PinState {
  const place = pinPlace(pins, postId);
  return {
    pinned: place.order !== null,
    pinnedOrder: place.order,
    pinnedCount: place.count,
    limit: PIN_LIMIT,
  };
}

/** The post must exist, be the caller's and still be live. */
async function ownLivePost(tx: Db, userId: string, postId: string) {
  const post = await tx.rMHark.findUnique({
    where: {
      id: postId,
    },
    select: {
      userId: true,
      deletedAt: true,
      communityId: true,
      expiresAt: true,
      pinnedAt: true,
    },
  });
  if (!post || post.deletedAt) throw new PinError('not-found');
  if (post.userId !== userId) throw new PinError('forbidden');
  return post;
}

/** Where a post stands among its author's pins. */
export async function getPinState(userId: string, postId: string): Promise<PinState> {
  await ownLivePost(prisma, userId, postId);
  return stateOf(await listPinned(userId), postId);
}

async function pinInTx(tx: Prisma.TransactionClient, userId: string, postId: string, now: Date): Promise<PinState> {
  const post = await ownLivePost(tx, userId, postId);
  // A community's posts are pinned by its moderators, not on a member's profile.
  if (post.communityId) throw new PinError('not-pinnable');
  const pins = await listPinned(userId, tx, now);
  if (pins.some((p) => p.id === postId)) return stateOf(pins, postId);
  if (pinsAreFull(pins.length)) throw new PinError('limit');
  const pinnedAt = nextPinnedAt(pins, now);
  await tx.rMHark.update({
    where: {
      id: postId,
    },
    data: {
      pinnedAt,
    },
  });
  return stateOf(
    [
      ...pins,
      {
        id: postId,
        pinnedAt,
      },
    ],
    postId,
  );
}

async function unpinInTx(tx: Prisma.TransactionClient, userId: string, postId: string, now: Date): Promise<PinState> {
  await ownLivePost(tx, userId, postId);
  await tx.rMHark.update({
    where: {
      id: postId,
    },
    data: {
      pinnedAt: null,
    },
  });
  return stateOf(await listPinned(userId, tx, now), postId);
}

/** Pin the post as the last of the member's pins. Pinning a post that is already pinned changes nothing. */
export async function pinPost(userId: string, postId: string, now: Date = new Date()): Promise<PinState> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `profile-pins:${userId}`);
    return pinInTx(tx, userId, postId, now);
  });
}

/** Take the post off the profile. The member's other pins keep their order. */
export async function unpinPost(userId: string, postId: string, now: Date = new Date()): Promise<PinState> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `profile-pins:${userId}`);
    return unpinInTx(tx, userId, postId, now);
  });
}

/** The pin button: pins the post, or unpins it when it is already pinned, under one lock. */
export async function togglePin(userId: string, postId: string, now: Date = new Date()): Promise<PinState> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `profile-pins:${userId}`);
    await ownLivePost(tx, userId, postId);
    const pins = await listPinned(userId, tx, now);
    return pins.some((p) => p.id === postId) ? unpinInTx(tx, userId, postId, now) : pinInTx(tx, userId, postId, now);
  });
}

/** Trade places with the neighbouring pin: each takes the other's `pinnedAt`. */
export async function movePin(
  userId: string,
  postId: string,
  direction: PinDirection,
  now: Date = new Date(),
): Promise<PinState> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `profile-pins:${userId}`);
    await ownLivePost(tx, userId, postId);
    const pins = await listPinned(userId, tx, now);
    if (!pins.some((p) => p.id === postId)) throw new PinError('not-pinned');
    const swap = swapWithNeighbour(pins, postId, direction);
    if (!swap) throw new PinError('at-end');
    await tx.rMHark.update({
      where: {
        id: swap.moved.id,
      },
      data: {
        pinnedAt: swap.moved.pinnedAt,
      },
    });
    await tx.rMHark.update({
      where: {
        id: swap.neighbour.id,
      },
      data: {
        pinnedAt: swap.neighbour.pinnedAt,
      },
    });
    return stateOf(
      sortPins(
        pins.map((p) => (p.id === swap.moved.id ? swap.moved : p.id === swap.neighbour.id ? swap.neighbour : p)),
      ),
      postId,
    );
  });
}

/**
 * Each post's 1-based place among its author's live pins, for the developer API. Posts that are not pinned are
 * absent from the map. One query for the posts' pins, one more for those authors' full lists when any are pinned.
 */
export async function pinnedOrderFor(postIds: readonly string[], now: Date = new Date()): Promise<Map<string, number>> {
  const order = new Map<string, number>();
  if (postIds.length === 0) return order;
  const pinnedAmong = await prisma.rMHark.findMany({
    where: {
      id: {
        in: [...postIds],
      },
      pinnedAt: {
        not: null,
      },
      deletedAt: null,
    },
    select: {
      userId: true,
    },
  });
  const authors = [...new Set(pinnedAmong.map((p) => p.userId))];
  if (authors.length === 0) return order;
  const rows = await prisma.rMHark.findMany({
    where: {
      userId: {
        in: authors,
      },
      pinnedAt: {
        not: null,
      },
      deletedAt: null,
      OR: [
        {
          expiresAt: null,
        },
        {
          expiresAt: {
            gt: now,
          },
        },
      ],
    },
    orderBy: [
      {
        pinnedAt: 'asc',
      },
      {
        id: 'asc',
      },
    ],
    select: {
      id: true,
      userId: true,
    },
  });
  const seen = new Map<string, number>();
  for (const r of rows) {
    const n = (seen.get(r.userId) ?? 0) + 1;
    seen.set(r.userId, n);
    order.set(r.id, n);
  }
  return order;
}
