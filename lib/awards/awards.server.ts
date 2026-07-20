/**
 * Post awards — server logic (§7). Gives an award atomically (debit giver,
 * credit recipient share, ledger rows, insert award, notify), lists grouped
 * awards for content, and lets a recipient hide an award.
 */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import {
  getAward,
  recipientShare,
  type AwardEntityType,
  type AwardGroup,
} from '@/lib/awards/catalog';

export class AwardError extends Error {}

/** Resolve the owner (recipient) of an awardable entity. `guide` lands with §6. */
async function resolveRecipient(
  entityType: AwardEntityType,
  entityId: string,
): Promise<string | null> {
  switch (entityType) {
    case 'rmhark': {
      const row = await prisma.rMHark.findUnique({ where: { id: entityId }, select: { userId: true } });
      return row?.userId ?? null;
    }
    case 'comment': {
      const row = await prisma.rMHarkComment.findUnique({ where: { id: entityId }, select: { userId: true } });
      return row?.userId ?? null;
    }
    case 'build': {
      const row = await prisma.userBuild.findUnique({ where: { id: entityId }, select: { userId: true } });
      return row?.userId ?? null;
    }
    default:
      return null;
  }
}

export interface GiveAwardResult {
  balance: number;
}

export async function giveAward(
  giverId: string,
  input: { awardId: string; entityType: AwardEntityType; entityId: string; anonymous?: boolean },
): Promise<GiveAwardResult> {
  const def = getAward(input.awardId);
  if (!def) throw new AwardError('UNKNOWN_AWARD');

  const recipientId = await resolveRecipient(input.entityType, input.entityId);
  if (!recipientId) throw new AwardError('ENTITY_NOT_FOUND');
  if (recipientId === giverId) throw new AwardError('SELF_AWARD');

  const share = recipientShare(def);

  const result = await prisma.$transaction(async (tx) => {
    await tx.userProfile.upsert({
      where: { userId: giverId },
      create: { userId: giverId, coins: 10 },
      update: {},
    });
    const debit = await tx.userProfile.updateMany({
      where: { userId: giverId, coins: { gte: def.priceCoins } },
      data: { coins: { decrement: def.priceCoins } },
    });
    if (debit.count === 0) throw new AwardError('INSUFFICIENT_COINS');
    const giver = await tx.userProfile.findUnique({ where: { userId: giverId }, select: { coins: true } });

    await tx.userProfile.upsert({
      where: { userId: recipientId },
      create: { userId: recipientId, coins: 10 + share },
      update: { coins: { increment: share } },
    });

    await tx.contentAward.create({
      data: {
        awardId: def.id,
        giverId,
        anonymous: input.anonymous ?? false,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });

    await tx.coinTransaction.createMany({
      data: [
        // Recipient share is a TIP so it counts toward creator earnings.
        {
          senderId: giverId,
          recipientId,
          amount: share,
          type: 'TIP',
          entityType: input.entityType,
          entityId: input.entityId,
          note: `Award: ${def.name}`,
        },
        // Giver spend (negative); the platform cut is price - share (implicit).
        {
          recipientId: giverId,
          amount: -def.priceCoins,
          type: 'PURCHASE',
          entityType: 'award',
          entityId: input.entityId,
          note: `Award: ${def.name}`,
        },
      ],
    });

    return { balance: giver?.coins ?? 0 };
  });

  await createNotification({
    userId: recipientId,
    actorId: input.anonymous ? null : giverId,
    type: 'SYSTEM',
    entityType: input.entityType,
    entityId: input.entityId,
    preview: `Your ${input.entityType === 'rmhark' ? 'post' : input.entityType} received a ${def.name} award ${def.emoji}`,
  }).catch(() => {});

  return result;
}

export interface AwardsForEntity {
  groups: AwardGroup[];
  total: number;
}

export async function listAwards(
  entityType: AwardEntityType,
  entityId: string,
): Promise<AwardsForEntity> {
  const rows = await prisma.contentAward.groupBy({
    by: ['awardId'],
    where: { entityType, entityId, hidden: false },
    _count: { awardId: true },
  });
  const groups = rows
    .map((r) => ({ awardId: r.awardId, count: r._count.awardId }))
    .sort((a, b) => b.count - a.count);
  const total = groups.reduce((sum, g) => sum + g.count, 0);
  return { groups, total };
}

/** Hide an award — only the recipient (the entity's owner) may. */
export async function hideAward(userId: string, awardRowId: string): Promise<void> {
  const award = await prisma.contentAward.findUnique({
    where: { id: awardRowId },
    select: { entityType: true, entityId: true },
  });
  if (!award) throw new AwardError('NOT_FOUND');
  const recipientId = await resolveRecipient(award.entityType as AwardEntityType, award.entityId);
  if (recipientId !== userId) throw new AwardError('FORBIDDEN');
  await prisma.contentAward.update({ where: { id: awardRowId }, data: { hidden: true } });
}
