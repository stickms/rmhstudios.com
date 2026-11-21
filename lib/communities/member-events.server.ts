/**
 * Membership history (s03-15, server-only): one row per join, leave or removal, so the Insights
 * tab can count losses (the member row is deleted when someone leaves). `recordMemberEvent` takes
 * the client of the transaction that changes the membership, so an event exists exactly when the
 * change happened. Rows are de-identified on account erasure, never deleted.
 */
import type { Prisma } from '@prisma/client';
import type { MemberEventKind } from '@/lib/communities/insights';

export function recordMemberEvent(
  tx: Pick<
    Prisma.TransactionClient,
    'communityMemberEvent'
  >,
  communityId: string,
  userId: string,
  kind: MemberEventKind,
) {
  return tx.communityMemberEvent.create(
    {
      data: {
        communityId,
        userId,
        kind,
      },
    },
  );
}
