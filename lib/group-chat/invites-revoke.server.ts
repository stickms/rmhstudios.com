/**
 * The one invite operation `manage.server.ts` needs. It lives apart from `invites.server.ts` (which imports the
 * manage helpers) so the two modules do not import each other. Server-only.
 */

import type { Prisma } from '@prisma/client';

/** Revoke every live link `userId` made for a group (ownership or admin standing moved on); how many were live. Runs inside the caller's transaction. */
export async function revokeInvitesOf(tx: Prisma.TransactionClient, chatId: string, userId: string): Promise<number> {
  const done = await tx.chatInvite.updateMany({
    where: { chatId, createdById: userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  // A stub that records calls answers with an op object, not a count.
  return typeof done?.count === 'number' ? done.count : 0;
}
