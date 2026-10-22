/**
 * Join requests for private communities (server-only).
 *
 * One row per (community, user). A denied user may ask again after
 * {@link DENIED_COOLDOWN_MS}: the existing row is reset to PENDING rather than a
 * second row being inserted, which keeps the unique key and the pending list
 * trivially correct, and the cooldown stops a denied user re-queuing themselves
 * in front of the same moderators every few minutes. (An APPROVED row for a user
 * who later left is reset immediately: they were let in once, so there is nothing
 * to throttle.)
 *
 * Approving creates the membership in the same transaction as the status change,
 * and a decision only applies to a PENDING row (`updateMany … status: PENDING`),
 * so two moderators approving at once cannot double-count the member.
 */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { resolveUser, userDisplaySelect, type ResolvedUser } from '@/lib/user-display';

export const DENIED_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const CANCELLED_COOLDOWN_MS = 60 * 60 * 1000;
export const JOIN_REQUEST_MESSAGE_MAX = 280;

/** What the requester sees about their own request. */
export type OwnRequestState = 'PENDING' | 'DENIED' | null;

export type RequestResult =
  | { ok: true; status: 'PENDING' }
  | { ok: false; reason: 'member' }
  | { ok: false; reason: 'cooldown'; retryAt: string };

export interface JoinRequestDTO {
  id: string;
  message: string | null;
  createdAt: string;
  user: ResolvedUser;
}

/** The viewer's own request state for a community. */
export async function getOwnRequestState(
  communityId: string,
  userId: string,
): Promise<OwnRequestState> {
  const row = await prisma.communityJoinRequest.findUnique({
    where: { communityId_userId: { communityId, userId } },
    select: { status: true },
  });
  if (row?.status === 'PENDING') return 'PENDING';
  // A removal reads to the person as "not approved", like a denial.
  return row?.status === 'DENIED' || row?.status === 'REMOVED' ? 'DENIED' : null;
}

export async function requestToJoin(
  community: { id: string; slug: string; name: string },
  userId: string,
  userName: string | null,
  message: string | null,
): Promise<RequestResult> {
  const member = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: community.id, userId } },
    select: { id: true },
  });
  if (member) return { ok: false, reason: 'member' };

  const existing = await prisma.communityJoinRequest.findUnique({
    where: { communityId_userId: { communityId: community.id, userId } },
    select: { status: true, decidedAt: true },
  });
  if (existing?.status === 'PENDING') return { ok: true, status: 'PENDING' };
  const cooldownMs =
    existing?.status === 'DENIED' || existing?.status === 'REMOVED'
      ? DENIED_COOLDOWN_MS
      : existing?.status === 'CANCELLED'
        ? CANCELLED_COOLDOWN_MS
        : 0;
  if (cooldownMs && existing?.decidedAt) {
    const retryAt = new Date(existing.decidedAt.getTime() + cooldownMs);
    if (retryAt > new Date()) return { ok: false, reason: 'cooldown', retryAt: retryAt.toISOString() };
  }

  const text = message?.trim().slice(0, JOIN_REQUEST_MESSAGE_MAX) || null;
  await prisma.communityJoinRequest.upsert({
    where: { communityId_userId: { communityId: community.id, userId } },
    create: { communityId: community.id, userId, message: text },
    update: { status: 'PENDING', message: text, decidedById: null, decidedAt: null, createdAt: new Date() },
  });

  await notifyModerators(community, userId, userName);
  return { ok: true, status: 'PENDING' };
}

async function notifyModerators(
  community: { id: string; slug: string; name: string },
  requesterId: string,
  requesterName: string | null,
): Promise<void> {
  const mods = await prisma.communityMember.findMany({
    where: { communityId: community.id, role: { in: ['ADMIN', 'MOD'] } },
    select: { userId: true },
    take: 50,
  });
  await Promise.all(
    mods.map((m) =>
      createNotification({
        userId: m.userId,
        actorId: requesterId,
        type: 'SYSTEM',
        entityType: 'community-join-request',
        entityId: community.id,
        preview: `${requesterName ?? 'Someone'} asked to join ${community.name}`,
        link: `/c/${community.slug}`,
        dedupeUnread: true,
      }),
    ),
  );
}

/**
 * Withdraw the viewer's own PENDING request. Idempotent. The row is kept as
 * CANCELLED (not deleted) so {@link requestToJoin} can throttle the re-request.
 */
export async function cancelRequest(communityId: string, userId: string): Promise<void> {
  await prisma.communityJoinRequest.updateMany({
    where: { communityId, userId, status: 'PENDING' },
    data: { status: 'CANCELLED', decidedAt: new Date(), decidedById: null },
  });
}

/**
 * Record that a moderator removed `userId` (call in the removal transaction).
 * `acceptInvite` refuses a REMOVED user and `requestToJoin` applies the cooldown;
 * a moderator approving a later request is what lets them back in.
 */
export function markRemoved(
  tx: Pick<typeof prisma, 'communityJoinRequest'>,
  communityId: string,
  userId: string,
  decidedById: string,
) {
  const now = new Date();
  return tx.communityJoinRequest.upsert({
    where: { communityId_userId: { communityId, userId } },
    create: { communityId, userId, status: 'REMOVED', decidedById, decidedAt: now },
    update: { status: 'REMOVED', decidedById, decidedAt: now, message: null },
  });
}

/** Pending requests, oldest first (bounded). Moderators only. */
export async function listPendingRequests(communityId: string): Promise<JoinRequestDTO[]> {
  const rows = await prisma.communityJoinRequest.findMany({
    where: { communityId, status: 'PENDING' },
    orderBy: { id: 'asc' },
    take: 100,
    select: {
      id: true,
      message: true,
      createdAt: true,
      user: { select: userDisplaySelect },
    },
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    message: r.message,
    createdAt: r.createdAt.toISOString(),
    user: resolveUser(r.user),
  }));
}

export type DecisionResult = { ok: true; decision: 'approve' | 'deny' } | { ok: false };

/**
 * Approve or deny one pending request. `{ ok: false }` when it does not exist in
 * this community or was already decided (so a double click or two moderators is
 * harmless). Approving creates the membership in the same transaction.
 */
export async function decideRequest(
  community: { id: string; slug: string; name: string },
  requestId: bigint,
  decidedById: string,
  decision: 'approve' | 'deny',
): Promise<DecisionResult> {
  const requester = await prisma.communityJoinRequest.findFirst({
    where: { id: requestId, communityId: community.id, status: 'PENDING' },
    select: { userId: true },
  });
  if (!requester) return { ok: false };

  const applied = await prisma.$transaction(async (tx) => {
    const res = await tx.communityJoinRequest.updateMany({
      where: { id: requestId, communityId: community.id, status: 'PENDING' },
      data: {
        status: decision === 'approve' ? 'APPROVED' : 'DENIED',
        decidedById,
        decidedAt: new Date(),
      },
    });
    if (res.count === 0) return false;
    if (decision === 'approve') {
      const created = await tx.communityMember.createMany({
        data: [{ communityId: community.id, userId: requester.userId }],
        skipDuplicates: true,
      });
      if (created.count > 0) {
        await tx.community.update({
          where: { id: community.id },
          data: { memberCount: { increment: 1 } },
        });
      }
    }
    return true;
  });
  if (!applied) return { ok: false };

  await createNotification({
    userId: requester.userId,
    actorId: decidedById,
    type: 'SYSTEM',
    entityType: 'community-join-decision',
    entityId: community.id,
    preview:
      decision === 'approve'
        ? `You're in: your request to join ${community.name} was approved`
        : `Your request to join ${community.name} was not approved`,
    link: `/c/${community.slug}`,
  });
  return { ok: true, decision };
}
