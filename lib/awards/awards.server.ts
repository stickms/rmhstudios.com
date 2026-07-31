/**
 * Post awards — server logic (§7). Gives an award atomically (debit giver,
 * credit recipient share, ledger rows, insert award, notify), lists grouped
 * awards for content, and lets a recipient hide an award.
 */
import { prisma } from '@/lib/prisma.server';
import { transferCoins, InsufficientFundsError } from '@/lib/economy/ledger.server';
import { dispatch } from '@/lib/notify/dispatch.server';
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
    // The giver pays `priceCoins`; the recipient receives `share`; the
    // difference is the platform cut and is destroyed. Typed as TIP so it keeps
    // counting toward creator earnings, exactly as the old recipient row did.
    try {
      await transferCoins(giverId, recipientId, def.priceCoins, {
        tx,
        fee: def.priceCoins - share,
        type: 'TIP',
        entityType: input.entityType,
        entityId: input.entityId,
        note: `Award: ${def.name}`,
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) throw new AwardError('INSUFFICIENT_COINS');
      throw err;
    }
    const giver = await tx.userProfile.findUnique({ where: { userId: giverId }, select: { coins: true } });

    await tx.contentAward.create({
      data: {
        awardId: def.id,
        giverId,
        anonymous: input.anonymous ?? false,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });

    return { balance: giver?.coins ?? 0 };
  });

  // §16: awards notify through the dispatch gateway (economy category).
  await dispatch({
    userId: recipientId,
    category: 'economy',
    type: 'SYSTEM',
    actorId: input.anonymous ? null : giverId,
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
