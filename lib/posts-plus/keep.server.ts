/**
 * X8 - restore protection. Its own module (rather than part of lifecycle.server)
 * because the recycle bin imports it and lifecycle.server imports the bin.
 */

import type { Prisma } from '@prisma/client';

/**
 * The author restored the post from the bin: it must not be taken again, by its
 * own TTL or by the auto-delete job. Runs inside the restore transaction.
 */
export async function keepOnRestoreTx(
  tx: Prisma.TransactionClient,
  postId: string,
  userId: string,
): Promise<void> {
  await tx.postLifecycle.upsert({
    where: { postId },
    create: { postId, userId, expiresAt: null, keepForever: true },
    update: { expiresAt: null, keepForever: true },
  });
  await tx.rMHark.updateMany({
    where: { id: postId, expiresAt: { not: null } },
    data: { expiresAt: null },
  });
}
