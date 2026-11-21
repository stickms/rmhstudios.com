/**
 * Community ownership handover (s04-17, server-only): offer, cancel, respond, the admin assignment and the
 * reads behind the owner's panel and the recipient's banner.
 *
 * Every write that decides who owns the community takes `community-handover:<id>` first, so an offer, a
 * cancel, an accept and an admin assignment on one community run one at a time; each also claims the offer
 * with a conditional `updateMany` and re-reads `createdById` and the moderator role inside the transaction,
 * so a stale page can never produce two owners. The transfer is logged in the same transaction.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { userChipSelect } from '@/lib/user-display';
import { logModAction } from '@/lib/communities/modlog.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import {
  checkAdminAssign,
  checkOwner,
  checkRecipient,
  checkResponder,
  handoverExpiry,
  handoverState,
  isBanned,
  orphanReason,
  type HandoverOfferDTO,
  type HandoverRefusal,
  type HandoverRole,
  type HandoverStatusDTO,
  type HandoverUserDTO,
  type OwnedCommunityDTO,
} from '@/lib/communities/handover';

export type HandoverResult<T> = { ok: true; value: T } | { ok: false; code: HandoverRefusal };

const refuse = (code: HandoverRefusal): { ok: false; code: HandoverRefusal } => ({ ok: false, code });

const HANDOVER_ENTITY = 'community_handover';
/** At most this many moderators are offered in the owner's select. */
const CANDIDATE_LIMIT = 100;

const lockName = (communityId: string): string => `community-handover:${communityId}`;

/** A community's identity for messages and links. */
interface CommunityRef {
  id: string;
  slug: string;
  name: string;
}

const displayName = (u: { name: string | null; handle: string | null }): string =>
  u.name ?? (u.handle ? `@${u.handle}` : 'A member');

type OfferRow = {
  id: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  decidedAt: Date | null;
  from: HandoverUserDTO;
  to: HandoverUserDTO;
};

const offerSelect = {
  id: true,
  status: true,
  createdAt: true,
  expiresAt: true,
  decidedAt: true,
  from: { select: userChipSelect },
  to: { select: userChipSelect },
} as const satisfies Prisma.CommunityHandoverSelect;

function toOfferDTO(row: OfferRow, now: Date): HandoverOfferDTO {
  return {
    id: row.id,
    from: row.from,
    to: row.to,
    state: handoverState(row, now),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

async function notifySafely(input: Parameters<typeof createNotification>[0]): Promise<void> {
  try {
    await createNotification(input);
  } catch (err) {
    console.error('[handover] notification failed:', err);
  }
}

/** True when either member blocks the other. Read inside the transaction that acts on the answer. */
async function blockedEitherWay(
  tx: Prisma.TransactionClient,
  a: string,
  b: string,
): Promise<boolean> {
  const hit = await tx.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return !!hit;
}

async function roleOf(
  tx: Prisma.TransactionClient,
  communityId: string,
  userId: string,
): Promise<HandoverRole | null> {
  const m = await tx.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
    select: { role: true },
  });
  return (m?.role as HandoverRole | undefined) ?? null;
}

async function banFacts(tx: Prisma.TransactionClient, userId: string) {
  return tx.user.findUnique({
    where: { id: userId },
    select: { id: true, bannedUntil: true, banReason: true },
  });
}

/**
 * What the signed-in viewer sees of this community's handover: the owner the pending (or last expired) offer
 * and the moderators to choose from; the offered moderator the offer addressed to them; everyone else nothing.
 */
export async function getHandoverStatus(
  communityId: string,
  createdById: string,
  userId: string,
  now = new Date(),
): Promise<HandoverStatusDTO> {
  if (userId === createdById) {
    const [latest, mods, blocks] = await Promise.all([
      prisma.communityHandover.findFirst({
        where: { communityId, fromId: userId, status: 'pending' },
        orderBy: { createdAt: 'desc' },
        select: offerSelect,
      }),
      prisma.communityMember.findMany({
        where: { communityId, role: 'MOD', user: { OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] } },
        select: { user: { select: userChipSelect } },
        orderBy: { joinedAt: 'asc' },
        take: CANDIDATE_LIMIT,
      }),
      prisma.userBlock.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
        take: 1000,
      }),
    ]);
    const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
    return {
      viewer: 'owner',
      offer: latest ? toOfferDTO(latest, now) : null,
      candidates: mods.map((m) => m.user).filter((u) => !blocked.has(u.id)),
    };
  }
  const offered = await prisma.communityHandover.findFirst({
    where: { communityId, toId: userId, status: 'pending', expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    select: offerSelect,
  });
  if (!offered) return { viewer: 'other', offer: null, candidates: [] };
  return { viewer: 'recipient', offer: toOfferDTO(offered, now), candidates: [] };
}

/** The owner offers the community to one moderator. At most one unexpired offer exists per community. */
export async function offerHandover(input: {
  community: CommunityRef;
  ownerId: string;
  toId: string;
  now?: Date;
}): Promise<HandoverResult<HandoverOfferDTO>> {
  const now = input.now ?? new Date();
  const { community } = input;
  const result = await prisma.$transaction(async (tx): Promise<HandoverResult<HandoverOfferDTO>> => {
    await lockKey(tx, lockName(community.id));
    const current = await tx.community.findUnique({
      where: { id: community.id },
      select: { createdById: true },
    });
    if (!current) return refuse('not-owner');
    const notOwner = checkOwner(input.ownerId, current.createdById);
    if (notOwner) return refuse(notOwner);

    const [toRole, to, blocked] = await Promise.all([
      roleOf(tx, community.id, input.toId),
      banFacts(tx, input.toId),
      blockedEitherWay(tx, input.ownerId, input.toId),
    ]);
    const refusal = checkRecipient({
      ownerId: input.ownerId,
      toId: input.toId,
      toRole,
      toBanned: !to || isBanned(to, now),
      blocked,
    });
    if (refusal) return refuse(refusal);

    const pending = await tx.communityHandover.findMany({
      where: { communityId: community.id, status: 'pending' },
      select: { id: true, status: true, expiresAt: true },
    });
    if (pending.some((p) => handoverState(p, now) === 'pending')) return refuse('pending-exists');
    // An expired offer reads "Expired" and is replaced: close the stale row so one pending row is the norm.
    if (pending.length > 0) {
      await tx.communityHandover.updateMany({
        where: { id: { in: pending.map((p) => p.id) }, status: 'pending' },
        data: { status: 'cancelled', decidedAt: now },
      });
    }
    const row = await tx.communityHandover.create({
      data: {
        communityId: community.id,
        fromId: input.ownerId,
        toId: input.toId,
        expiresAt: handoverExpiry(now),
      },
      select: offerSelect,
    });
    return { ok: true, value: toOfferDTO(row, now) };
  });
  if (result.ok) {
    await notifySafely({
      userId: input.toId,
      type: 'SYSTEM',
      entityType: HANDOVER_ENTITY,
      entityId: community.id,
      preview: `${displayName(result.value.from)} offered you ownership of ${community.name}`,
      link: `/c/${community.slug}`,
    });
  }
  return result;
}

/** The owner withdraws the pending offer; the offered moderator is told. */
export async function cancelHandover(input: {
  community: CommunityRef;
  ownerId: string;
  now?: Date;
}): Promise<HandoverResult<null>> {
  const now = input.now ?? new Date();
  const { community } = input;
  const result = await prisma.$transaction(
    async (tx): Promise<HandoverResult<{ toId: string; ownerName: string }>> => {
      await lockKey(tx, lockName(community.id));
      const current = await tx.community.findUnique({
        where: { id: community.id },
        select: { createdById: true },
      });
      if (!current) return refuse('not-owner');
      const notOwner = checkOwner(input.ownerId, current.createdById);
      if (notOwner) return refuse(notOwner);
      const offer = await tx.communityHandover.findFirst({
        where: { communityId: community.id, fromId: input.ownerId, status: 'pending' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, toId: true, from: { select: userChipSelect } },
      });
      if (!offer) return refuse('no-offer');
      const claimed = await tx.communityHandover.updateMany({
        where: { id: offer.id, status: 'pending' },
        data: { status: 'cancelled', decidedAt: now },
      });
      if (claimed.count === 0) return refuse('no-offer');
      return { ok: true, value: { toId: offer.toId, ownerName: displayName(offer.from) } };
    },
  );
  if (!result.ok) return result;
  await notifySafely({
    userId: result.value.toId,
    type: 'SYSTEM',
    entityType: HANDOVER_ENTITY,
    entityId: community.id,
    preview: `${result.value.ownerName} withdrew the offer of ${community.name}`,
    link: `/c/${community.slug}`,
  });
  return { ok: true, value: null };
}

/**
 * The offered moderator accepts or declines. Accepting swaps the roles, moves `createdById` and logs the
 * transfer in one transaction, after claiming the offer and re-reading the owner and the moderator role.
 */
export async function respondHandover(input: {
  community: CommunityRef;
  userId: string;
  action: 'accept' | 'decline';
  now?: Date;
}): Promise<HandoverResult<null>> {
  const now = input.now ?? new Date();
  const { community, userId } = input;
  const result = await prisma.$transaction(
    async (tx): Promise<HandoverResult<{ fromId: string; toName: string }>> => {
      await lockKey(tx, lockName(community.id));
      const current = await tx.community.findUnique({
        where: { id: community.id },
        select: { createdById: true },
      });
      if (!current) return refuse('no-offer');
      const offer = await tx.communityHandover.findFirst({
        where: { communityId: community.id, toId: userId, status: 'pending' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, fromId: true, toId: true, status: true, expiresAt: true, to: { select: userChipSelect } },
      });
      const refusal = checkResponder({ userId, offer, createdById: current.createdById, now });
      if (refusal || !offer) return refuse(refusal ?? 'no-offer');
      const toName = displayName(offer.to);

      if (input.action === 'accept') {
        // The moderator may have been demoted, removed or banned, or blocked the owner, since the offer.
        const [role, facts, blocked] = await Promise.all([
          roleOf(tx, community.id, userId),
          banFacts(tx, userId),
          blockedEitherWay(tx, offer.fromId, userId),
        ]);
        const unfit = checkRecipient({
          ownerId: offer.fromId,
          toId: userId,
          toRole: role,
          toBanned: !facts || isBanned(facts, now),
          blocked,
        });
        if (unfit) return refuse(unfit);
      }

      const claimed = await tx.communityHandover.updateMany({
        where: { id: offer.id, status: 'pending', expiresAt: { gt: now } },
        data: { status: input.action === 'accept' ? 'accepted' : 'declined', decidedAt: now },
      });
      if (claimed.count === 0) return refuse('no-offer');

      if (input.action === 'accept') {
        const moved = await tx.community.updateMany({
          where: { id: community.id, createdById: offer.fromId },
          data: { createdById: userId },
        });
        if (moved.count === 0) return refuse('owner-changed');
        await tx.communityMember.updateMany({
          where: { communityId: community.id, userId, role: 'MOD' },
          data: { role: 'ADMIN' },
        });
        await tx.communityMember.updateMany({
          where: { communityId: community.id, userId: offer.fromId, role: 'ADMIN' },
          data: { role: 'MOD' },
        });
        await logModAction(tx, {
          communityId: community.id,
          actorId: offer.fromId,
          action: 'ownership_transferred',
          targetUserId: userId,
          targetType: 'member',
          detail: { via: 'offer' },
        });
      }
      return { ok: true, value: { fromId: offer.fromId, toName } };
    },
  );
  if (!result.ok) return result;
  await notifySafely({
    userId: result.value.fromId,
    type: 'SYSTEM',
    entityType: HANDOVER_ENTITY,
    entityId: community.id,
    preview:
      input.action === 'accept'
        ? `${result.value.toName} accepted ownership of ${community.name}`
        : `${result.value.toName} declined ownership of ${community.name}`,
    link: `/c/${community.slug}`,
  });
  return { ok: true, value: null };
}

/**
 * A site admin gives a community whose owner is gone (a deletion tombstone, or banned right now) to one of
 * its moderators. The previous owner's row, if it is still a member, drops to moderator, any open offer is
 * closed, and the action is recorded in the admin audit log and the community's mod log.
 */
export async function assignOwnerAsAdmin(input: {
  community: CommunityRef;
  adminId: string;
  toId: string;
  now?: Date;
}): Promise<HandoverResult<null>> {
  const now = input.now ?? new Date();
  const { community } = input;
  const result = await prisma.$transaction(async (tx): Promise<HandoverResult<null>> => {
    await lockKey(tx, lockName(community.id));
    const current = await tx.community.findUnique({
      where: { id: community.id },
      select: { createdById: true, createdBy: { select: { id: true, bannedUntil: true, banReason: true } } },
    });
    if (!current) return refuse('no-offer');
    const [toRole, to] = await Promise.all([
      roleOf(tx, community.id, input.toId),
      banFacts(tx, input.toId),
    ]);
    const refusal = checkAdminAssign({
      ownerOrphan: orphanReason(current.createdBy, now),
      toId: input.toId,
      ownerId: current.createdById,
      toRole,
      toBanned: !to || isBanned(to, now),
    });
    if (refusal) return refuse(refusal);

    const moved = await tx.community.updateMany({
      where: { id: community.id, createdById: current.createdById },
      data: { createdById: input.toId },
    });
    if (moved.count === 0) return refuse('owner-changed');
    await tx.communityMember.updateMany({
      where: { communityId: community.id, userId: input.toId, role: 'MOD' },
      data: { role: 'ADMIN' },
    });
    await tx.communityMember.updateMany({
      where: { communityId: community.id, userId: current.createdById, role: 'ADMIN' },
      data: { role: 'MOD' },
    });
    await tx.communityHandover.updateMany({
      where: { communityId: community.id, status: 'pending' },
      data: { status: 'cancelled', decidedAt: now },
    });
    await logModAction(tx, {
      communityId: community.id,
      actorId: input.adminId,
      action: 'ownership_transferred',
      targetUserId: input.toId,
      targetType: 'member',
      detail: { via: 'admin' },
    });
    await recordAdminActionIn(tx, input.adminId, 'community.assign-owner', {
      targetType: 'community',
      targetId: community.id,
      detail: `to ${input.toId}`,
    });
    return { ok: true, value: null };
  });
  if (result.ok) {
    await notifySafely({
      userId: input.toId,
      type: 'SYSTEM',
      entityType: HANDOVER_ENTITY,
      entityId: community.id,
      preview: `You are now the owner of ${community.name}`,
      link: `/c/${community.slug}`,
    });
  }
  return result;
}

/** The communities a user created, each with whether its owner is gone and the moderators who could take over. */
export async function listOwnedCommunities(
  userId: string,
  now = new Date(),
): Promise<OwnedCommunityDTO[]> {
  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, bannedUntil: true, banReason: true },
  });
  if (!owner) return [];
  const orphan = orphanReason(owner, now);
  const communities = await prisma.community.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: {
      id: true,
      slug: true,
      name: true,
      members: {
        where: {
          role: 'MOD',
          user: { OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] },
        },
        orderBy: { joinedAt: 'asc' },
        take: CANDIDATE_LIMIT,
        select: { user: { select: userChipSelect } },
      },
    },
  });
  return communities.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    orphan,
    moderators: orphan ? c.members.map((m) => m.user) : [],
  }));
}
