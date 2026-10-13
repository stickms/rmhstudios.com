import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { createNotification } from '@/lib/notifications.server';
import { BASE_RATING, isRankedGame } from '@/lib/ranked/elo';
import { handicapFor, handicapLaunchUrl, HANDICAP_HOOKS } from '@/lib/ranked/handicap';

const CAP = 50;

export async function listFriendly(userId: string) {
  const rows = await prisma.friendlyChallenge.findMany({
    where: {
      status: { in: ['pending', 'accepted'] },
      OR: [{ challengerId: userId }, { opponentId: userId }],
    },
    orderBy: { createdAt: 'desc' },
    take: CAP,
    include: {
      challenger: { select: userDisplaySelect },
      opponent: { select: userDisplaySelect },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    game: c.game,
    status: c.status,
    incoming: c.opponentId === userId,
    other: resolveUser(c.opponentId === userId ? c.challenger : c.opponent),
    handicap:
      c.handicapKind && c.handicapUserId
        ? {
            kind: c.handicapKind,
            amount: c.handicapAmount,
            mine: c.handicapUserId === userId,
            launchUrl:
              c.handicapUserId === userId
                ? handicapLaunchUrl(c.game, c.handicapKind, c.handicapAmount)
                : null,
          }
        : null,
    ratingGap: c.ratingGap,
  }));
}

export async function createFriendly(
  userId: string,
  userName: string | null,
  input: { game: string; opponent: string; handicap: boolean },
) {
  if (!isRankedGame(input.game)) return { ok: false as const, error: 'Unknown game', status: 400 };
  const opponent = await prisma.user.findFirst({
    where: { OR: [{ id: input.opponent }, { handle: input.opponent }] },
    select: { id: true },
  });
  if (!opponent) return { ok: false as const, error: 'Player not found', status: 404 };
  if (opponent.id === userId) {
    return { ok: false as const, error: 'You cannot challenge yourself', status: 400 };
  }
  const open = await prisma.friendlyChallenge.count({
    where: { challengerId: userId, status: { in: ['pending', 'accepted'] } },
  });
  if (open >= 20) return { ok: false as const, error: 'Too many open challenges', status: 429 };

  let handicap: { kind: string; amount: number; userId: string; gap: number } | null = null;
  if (input.handicap && HANDICAP_HOOKS[input.game]) {
    const ratings = await prisma.eloRating.findMany({
      where: { game: input.game, userId: { in: [userId, opponent.id] } },
      select: { userId: true, rating: true },
    });
    const rate = (id: string) => ratings.find((r) => r.userId === id)?.rating ?? BASE_RATING;
    const h = handicapFor(input.game, rate(userId), rate(opponent.id));
    if (h) {
      handicap = {
        kind: h.kind,
        amount: h.amount,
        userId: h.to === 'a' ? userId : opponent.id,
        gap: h.gap,
      };
    }
  }
  const c = await prisma.friendlyChallenge.create({
    data: {
      game: input.game,
      challengerId: userId,
      opponentId: opponent.id,
      handicapKind: handicap?.kind ?? null,
      handicapAmount: handicap?.amount ?? 0,
      handicapUserId: handicap?.userId ?? null,
      ratingGap: handicap?.gap ?? 0,
    },
    select: { id: true },
  });
  await createNotification({
    userId: opponent.id,
    actorId: userId,
    type: 'SYSTEM',
    entityType: 'friendly',
    entityId: c.id,
    preview: `${userName ?? 'Someone'} sent you a friendly challenge`,
    link: '/ranked',
  }).catch(() => {});
  return { ok: true as const, id: c.id };
}

export type FriendlyAction =
  { action: 'accept' } | { action: 'decline' } | { action: 'report'; result: 'win' | 'loss' };

/** Never reads or writes EloRating: friendly results are record-only. */
export async function actOnFriendly(id: string, userId: string, a: FriendlyAction) {
  const c = await prisma.friendlyChallenge.findUnique({ where: { id } });
  if (!c || (c.challengerId !== userId && c.opponentId !== userId)) {
    return { ok: false as const, error: 'Challenge not found', status: 404 };
  }
  if (a.action === 'accept' || a.action === 'decline') {
    if (c.opponentId !== userId)
      return { ok: false as const, error: 'Only the opponent can respond', status: 403 };
    if (c.status !== 'pending')
      return { ok: false as const, error: 'Already answered', status: 409 };
    await prisma.friendlyChallenge.updateMany({
      where: { id, status: 'pending' },
      data: { status: a.action === 'accept' ? 'accepted' : 'declined' },
    });
    return { ok: true as const };
  }
  if (c.status !== 'accepted')
    return { ok: false as const, error: 'Challenge is not active', status: 409 };
  const other = c.challengerId === userId ? c.opponentId : c.challengerId;
  await prisma.friendlyChallenge.updateMany({
    where: { id, status: 'accepted' },
    data: { status: 'done', winnerId: a.result === 'win' ? userId : other, resolvedAt: new Date() },
  });
  return { ok: true as const };
}
