/**
 * Card trade offers: propose, accept, decline, cancel, and the reads the pages need.
 * No coins move. The risk is cards, so (docs/superpowers/specs/2026-10-30-card-trades-design.md):
 *
 *  1. Accepting is one transaction under BOTH users' card locks, taken in sorted id order
 *     so two trades between one pair cannot deadlock. It re-reads every stack, refuses if
 *     either side no longer holds what was offered, then moves every card.
 *  2. An offer resolves once: the claim is a conditional `updateMany` on PENDING.
 *  3. Only the recipient accepts or declines; only the proposer cancels.
 *  4. An expired offer cannot be accepted.
 */

import { prisma } from '@/lib/prisma.server';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { userDisplaySelect, resolveUserDisplay } from '@/lib/user-display';
import { isTrackableTitle } from '@/lib/games/route-match';
import { lockCards } from '@/lib/cards/cards.server';
import { notifyTradeOffered, notifyTradeResolved } from '@/lib/cards/notify.server';
import {
  MAX_PENDING_PER_PROPOSER,
  expiresAtFrom,
  isExpired,
  validateOffer,
  type OfferItem,
} from '@/lib/cards/trade-rules';
import type { TradeData, TradeView, TradeCard } from '@/lib/cards/trade-types';

export type TradeErrorCode =
  | 'BAD_OFFER'
  | 'NOT_FOUND'
  | 'NOT_FRIENDS'
  | 'MISSING_CARDS'
  | 'TOO_MANY_PENDING'
  | 'FORBIDDEN'
  | 'NOT_AVAILABLE'
  | 'EXPIRED';

export class TradeError extends Error {
  constructor(
    readonly code: TradeErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'TradeError';
  }
}

const stackKey = (userId: string, i: { gameId: string; cardIndex: number; foil: boolean }) => ({
  userId_gameId_cardIndex_foil: { userId, gameId: i.gameId, cardIndex: i.cardIndex, foil: i.foil },
});

type Db = Pick<typeof prisma, 'userCard'>;

async function holds(db: Db, userId: string, items: readonly OfferItem[]): Promise<boolean> {
  for (const i of items) {
    const s = await db.userCard.findUnique({ where: stackKey(userId, i), select: { count: true } });
    if ((s?.count ?? 0) < i.qty) return false;
  }
  return true;
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  const f = await prisma.follow.findFirst({
    where: {
      OR: [
        { followerId: a, followingId: b },
        { followerId: b, followingId: a },
      ],
    },
    select: { id: true },
  });
  return !!f;
}

export async function proposeTrade(input: {
  fromId: string;
  toId: string;
  give: OfferItem[];
  ask: OfferItem[];
}) {
  const { fromId, toId, give, ask } = input;
  if (fromId === toId) throw new TradeError('BAD_OFFER', 'You cannot trade with yourself');
  if (validateOffer({ give, ask }) !== 'ok') throw new TradeError('BAD_OFFER', 'That offer is not valid');
  if ([...give, ...ask].some((i) => !isTrackableTitle(i.gameId))) {
    throw new TradeError('BAD_OFFER', 'That offer is not valid');
  }

  const people = await prisma.user.findMany({ where: { id: { in: [fromId, toId] } }, select: { id: true } });
  if (people.length !== 2) throw new TradeError('NOT_FOUND', 'That member does not exist', 404);
  if (!(await areFriends(fromId, toId))) {
    throw new TradeError('NOT_FRIENDS', 'You can only trade with someone you follow or who follows you', 403);
  }
  if ((await prisma.cardTrade.count({ where: { fromId, status: 'PENDING' } })) >= MAX_PENDING_PER_PROPOSER) {
    throw new TradeError('TOO_MANY_PENDING', 'You have too many pending offers');
  }
  // Not binding (nothing is escrowed): it only stops offers of cards you do not hold.
  if (!(await holds(prisma, fromId, give))) {
    throw new TradeError('MISSING_CARDS', 'You do not hold those cards');
  }

  const trade = await prisma.cardTrade.create({
    data: {
      fromId,
      toId,
      expiresAt: expiresAtFrom(new Date()),
      items: {
        create: [
          ...give.map((i) => ({ ...i, fromGives: true })),
          ...ask.map((i) => ({ ...i, fromGives: false })),
        ],
      },
    },
  });
  await notifyTradeOffered({ actorId: fromId, userId: toId, tradeId: trade.id });
  return trade;
}

async function move(
  tx: Pick<typeof prisma, 'userCard'>,
  from: string,
  to: string,
  i: OfferItem,
): Promise<void> {
  const stack = await tx.userCard.findUnique({ where: stackKey(from, i), select: { count: true } });
  if ((stack?.count ?? 0) < i.qty) throw new TradeError('MISSING_CARDS', 'A card is no longer held', 409);
  if (stack!.count === i.qty) await tx.userCard.delete({ where: stackKey(from, i) });
  else await tx.userCard.update({ where: stackKey(from, i), data: { count: { decrement: i.qty } } });
  await tx.userCard.upsert({
    where: stackKey(to, i),
    create: { userId: to, gameId: i.gameId, cardIndex: i.cardIndex, foil: i.foil, count: i.qty },
    update: { count: { increment: i.qty } },
  });
}

export async function acceptTrade({ userId, tradeId }: { userId: string; tradeId: string }): Promise<void> {
  const proposerId = await prisma.$transaction(async (tx) => {
    const trade = await tx.cardTrade.findUnique({ where: { id: tradeId }, include: { items: true } });
    if (!trade) throw new TradeError('NOT_FOUND', 'Offer not found', 404);
    if (trade.toId !== userId) throw new TradeError('FORBIDDEN', 'This offer is not yours to accept', 403);

    // Both users' stacks change: lock them in sorted order so two trades cannot deadlock.
    for (const id of [trade.fromId, trade.toId].sort()) await lockCards(tx, id);

    // Re-read after locking: the status may have changed while we waited for the locks.
    const fresh = await tx.cardTrade.findUnique({ where: { id: tradeId }, include: { items: true } });
    if (!fresh || fresh.status !== 'PENDING') {
      throw new TradeError('NOT_AVAILABLE', 'This offer is no longer available', 409);
    }
    if (isExpired(fresh.expiresAt, new Date())) throw new TradeError('EXPIRED', 'This offer has expired', 409);

    const claim = await tx.cardTrade.updateMany({
      where: { id: tradeId, status: 'PENDING', toId: userId },
      data: { status: 'ACCEPTED', closedAt: new Date() },
    });
    if (claim.count === 0) throw new TradeError('NOT_AVAILABLE', 'This offer is no longer available', 409);

    for (const i of fresh.items) {
      const item: OfferItem = { gameId: i.gameId, cardIndex: i.cardIndex, foil: i.foil, qty: i.qty };
      if (i.fromGives) await move(tx, fresh.fromId, fresh.toId, item);
      else await move(tx, fresh.toId, fresh.fromId, item);
    }
    return fresh.fromId;
  });
  // After the commit: tell the proposer.
  await notifyTradeResolved({ actorId: userId, userId: proposerId, tradeId, outcome: 'accepted' });
}

async function resolve(
  who: { tradeId: string; userId: string; as: 'to' | 'from' },
  status: 'DECLINED' | 'CANCELED',
): Promise<void> {
  const res = await prisma.cardTrade.updateMany({
    where: {
      id: who.tradeId,
      status: 'PENDING',
      ...(who.as === 'to' ? { toId: who.userId } : { fromId: who.userId }),
    },
    data: { status, closedAt: new Date() },
  });
  if (res.count === 0) throw new TradeError('NOT_AVAILABLE', 'That offer can no longer be changed', 409);
  if (status === 'DECLINED') {
    const t = await prisma.cardTrade.findUnique({ where: { id: who.tradeId }, select: { fromId: true } });
    if (t) {
      await notifyTradeResolved({ actorId: who.userId, userId: t.fromId, tradeId: who.tradeId, outcome: 'declined' });
    }
  }
}

export const declineTrade = ({ userId, tradeId }: { userId: string; tradeId: string }) =>
  resolve({ tradeId, userId, as: 'to' }, 'DECLINED');

export const cancelTrade = ({ userId, tradeId }: { userId: string; tradeId: string }) =>
  resolve({ tradeId, userId, as: 'from' }, 'CANCELED');

/** Offers waiting on this user: pending and not yet expired (for the Community tab's count). */
export async function countPendingTrades(userId: string): Promise<number> {
  return prisma.cardTrade.count({
    where: { toId: userId, status: 'PENDING', expiresAt: { gt: new Date() } },
  });
}

/** The viewer's incoming and outgoing offers and their recent history. */
export async function listTrades(userId: string): Promise<TradeData> {
  const titles = new Map(listCuratedBuilds().map((b) => [b.id, b]));
  const rows = await prisma.cardTrade.findMany({
    where: { OR: [{ fromId: userId }, { toId: userId }] },
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: {
      items: true,
      from: { select: userDisplaySelect },
      to: { select: userDisplaySelect },
    },
  });
  const now = new Date();
  const toCard = (i: { gameId: string; cardIndex: number; foil: boolean; qty: number }): TradeCard | null => {
    const t = titles.get(i.gameId);
    return t ? { gameId: i.gameId, title: t.title, hue: t.hue, cardIndex: i.cardIndex, foil: i.foil, qty: i.qty } : null;
  };

  const view = (r: (typeof rows)[number]): TradeView => {
    const mine = r.fromId === userId;
    const partner = mine ? r.to : r.from;
    const d = resolveUserDisplay(partner as Parameters<typeof resolveUserDisplay>[0]);
    // "yours" and "theirs" from the viewer's side, whichever of them proposed.
    const gives = r.items.filter((i) => i.fromGives === mine).map(toCard);
    const gets = r.items.filter((i) => i.fromGives !== mine).map(toCard);
    return {
      id: r.id,
      direction: mine ? 'out' : 'in',
      status: r.status === 'PENDING' && isExpired(r.expiresAt, now) ? 'EXPIRED' : r.status,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      partner: {
        userId: partner.id,
        handle: partner.handle ?? null,
        name: d.name ?? partner.handle ?? 'Player',
        image: d.image ?? null,
      },
      yourCards: gives.filter((c): c is TradeCard => !!c),
      theirCards: gets.filter((c): c is TradeCard => !!c),
    };
  };

  const all = rows.map(view);
  return {
    incoming: all.filter((t) => t.direction === 'in' && t.status === 'PENDING'),
    outgoing: all.filter((t) => t.direction === 'out' && t.status === 'PENDING'),
    history: all.filter((t) => t.status !== 'PENDING').slice(0, 10),
  };
}

/** What each side holds, for the composer: only between members who may trade. */
export async function getTradeInventories(viewerId: string, partnerId: string) {
  if (viewerId === partnerId) throw new TradeError('BAD_OFFER', 'You cannot trade with yourself');
  if (!(await areFriends(viewerId, partnerId))) {
    throw new TradeError('NOT_FRIENDS', 'You can only trade with someone you follow or who follows you', 403);
  }
  const titles = new Map(listCuratedBuilds().map((b) => [b.id, b]));
  const read = async (id: string): Promise<TradeCard[]> => {
    const rows = await prisma.userCard.findMany({
      where: { userId: id },
      orderBy: [{ gameId: 'asc' }, { cardIndex: 'asc' }],
      select: { gameId: true, cardIndex: true, foil: true, count: true },
    });
    return rows.flatMap((r) => {
      const t = titles.get(r.gameId);
      return t ? [{ gameId: r.gameId, title: t.title, hue: t.hue, cardIndex: r.cardIndex, foil: r.foil, qty: r.count }] : [];
    });
  };
  const [mine, theirs] = await Promise.all([read(viewerId), read(partnerId)]);
  return { mine, theirs };
}
