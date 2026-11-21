/**
 * The one invite operation `manage.server.ts` needs. It lives apart from `invites.server.ts` (which imports the
 * manage helpers) so the two modules do not import each other. Server-only.
 */

import type { Prisma } from '@prisma/client';

/** Revoke every live link `userId` made for a group (ownership moved on). Runs inside the caller's transaction. */
export async function revokeInvitesOf(
  tx: Prisma.TransactionClient,
  chatId: string,
  userId: string,
): Promise<void> {
  await tx.chatInvite.updateMany({
    where: { chatId, createdById: userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
