import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import { invalidateTag } from '@/lib/cached.server';

/**
 * The append-only follow log. One row per change to a `Follow` row, written in the SAME
 * transaction as the change, so the log can never disagree with the graph.
 *
 * - `follow`   a follow edge was created
 * - `unfollow` the follower removed their own edge
 * - `blocked`  a block removed the edge (either direction)
 * - `removed`  the followed member removed a follower (feature 16)
 *
 * The audience view counts `follow` as a gain and the other three as a loss, never naming
 * who left. Rows have no foreign keys: an event outlives the account that caused it, and
 * account deletion erases the member's own audience rows and de-identifies the rows where they were the follower, through {@link deleteFollowEventsFor}.
 */
export type FollowEventKind = 'follow' | 'unfollow' | 'blocked' | 'removed';

/** Anything that carries `followEvent`: the global client, or an interactive transaction client. */
type FollowEventClient = Pick<Prisma.TransactionClient, 'followEvent'>;

/** The tag every cached audience read of `userId` is filed under. */
export function audienceTag(userId: string): string {
  return `audience:${userId}`;
}

/**
 * Record one follow change. Pass `prisma` to put it in a batch `prisma.$transaction([...])`
 * beside the `Follow` write, or the client of an interactive transaction. It returns the
 * query unawaited so the batch form works; awaiting it inside an interactive transaction is
 * the caller's job. The insert has no constraint a valid follow could violate.
 *
 * Call {@link invalidateAudience} for the followed member once the transaction has committed.
 */
export function recordFollowEvent(
  tx: FollowEventClient,
  event: {
    followerId: string;
    followingId: string;
    kind: FollowEventKind;
  },
) {
  return tx.followEvent.create({
    data: {
      followerId: event.followerId,
      followingId: event.followingId,
      kind: event.kind,
    },
    select: {
      id: true,
    },
  });
}

/** Drop the cached audience view of `userId`, so their next read counts the change. */
export function invalidateAudience(userId: string): void {
  void invalidateTag(audienceTag(userId));
}

/**
 * Erase a deleted member's footprint in the log, without rewriting anyone else's history.
 *
 * - Events where they were the FOLLOWED member are their own audience history: deleted.
 * - Events where they were the FOLLOWER are de-identified: `followerId` becomes the shared
 *   deleted-user id, and the row stays so the creators they followed keep an unchanged gained
 *   and lost history (their follower count already includes or excludes that edge). Nothing
 *   left in the row points back at the person.
 *
 * Returned unawaited so account deletion can run both in its batch transaction.
 */
export function deleteFollowEventsFor(userId: string, client: FollowEventClient = prisma) {
  return [
    client.followEvent.deleteMany({
      where: {
        followingId: userId,
      },
    }),
    client.followEvent.updateMany({
      where: {
        followerId: userId,
      },
      data: {
        followerId: DELETED_USER_ID,
      },
    }),
  ] as const;
}
