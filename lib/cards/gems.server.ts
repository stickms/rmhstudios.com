/**
 * Gems: unpack cards into them, open booster packs with them, buy them with coins.
 * Rules and values are in `gems.ts` (pure); this applies them in transactions. The coin
 * side is one `debitCoins` sink in the same transaction that credits the gems; gems cannot
 * be traded, so they only ever move between a member and the system. Every movement has a
 * `gem_entry` row. See docs/superpowers/specs/2026-10-30-gems-boosters-design.md.
 */

import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { InsufficientFundsError, debitCoins } from '@/lib/economy/ledger.server';
import { isTrackableTitle } from '@/lib/games/route-match';
import { SET_SIZE, cardName } from '@/lib/cards/cards';
import { lockCards } from '@/lib/cards/cards.server';
import {
  PACK_COST,
  coinCostFor,
  drawPack,
  gemValue,
  validateBuyUnits,
  BUY_UNIT_GEMS,
  type DrawnCard,
  type Rng,
} from '@/lib/cards/gems';

export type GemErrorCode = 'BAD_INPUT' | 'NOT_FOUND' | 'NOT_ENOUGH' | 'INSUFFICIENT_GEMS' | 'INSUFFICIENT_COINS';

const STATUS: Record<GemErrorCode, number> = {
  BAD_INPUT: 400,
  NOT_FOUND: 404,
  NOT_ENOUGH: 409,
  INSUFFICIENT_GEMS: 402,
  INSUFFICIENT_COINS: 402,
};

export class GemError extends Error {
  readonly status: number;
  constructor(readonly code: GemErrorCode) {
    super(code);
    this.name = 'GemError';
    this.status = STATUS[code];
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Credit gems and write the entry that explains it. */
async function credit(tx: Tx, userId: string, gems: number, reason: 'unpack' | 'buy') {
  await tx.userGems.upsert({
    where: { userId },
    create: { userId, gems },
    update: { gems: { increment: gems } },
  });
  await tx.gemEntry.create({ data: { userId, delta: gems, reason } });
}

const stackKey = (userId: string, c: { gameId: string; cardIndex: number; foil: boolean }) => ({
  userId_gameId_cardIndex_foil: { userId, gameId: c.gameId, cardIndex: c.cardIndex, foil: c.foil },
});

export async function getGems(userId: string): Promise<number> {
  const row = await prisma.userGems.findUnique({ where: { userId }, select: { gems: true } });
  return row?.gems ?? 0;
}

/** Destroy `qty` of a card for gems. */
export async function unpackCards(input: {
  userId: string;
  gameId: string;
  cardIndex: number;
  foil: boolean;
  qty: number;
}): Promise<{ gems: number }> {
  const { userId, qty } = input;
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new GemError('BAD_INPUT');
  if (!isTrackableTitle(input.gameId) || !Number.isInteger(input.cardIndex) || input.cardIndex < 0 || input.cardIndex >= SET_SIZE) {
    throw new GemError('NOT_FOUND');
  }
  const gems = qty * gemValue(input.foil);
  await prisma.$transaction(async (tx) => {
    await lockCards(tx, userId);
    const stack = await tx.userCard.findUnique({ where: stackKey(userId, input), select: { count: true } });
    if (!stack || stack.count < qty) throw new GemError('NOT_ENOUGH');
    if (stack.count === qty) await tx.userCard.delete({ where: stackKey(userId, input) });
    else await tx.userCard.update({ where: stackKey(userId, input), data: { count: { decrement: qty } } });
    await credit(tx, userId, gems, 'unpack');
  });
  return { gems };
}

const cryptoRng: Rng = (max) => randomInt(max);

/** Spend a pack's worth of gems; receive its cards. */
export async function openPack(input: {
  userId: string;
  gameId: string;
  rng?: Rng;
}): Promise<{ cards: (DrawnCard & { name: string })[] }> {
  const { userId, gameId } = input;
  if (!isTrackableTitle(gameId)) throw new GemError('NOT_FOUND');
  const drawn = await prisma.$transaction(async (tx) => {
    await lockCards(tx, userId);
    // The conditional update IS the balance check: two packs racing for one pack's gems
    // cannot both pass it.
    const paid = await tx.userGems.updateMany({
      where: { userId, gems: { gte: PACK_COST } },
      data: { gems: { decrement: PACK_COST } },
    });
    if (paid.count === 0) throw new GemError('INSUFFICIENT_GEMS');
    await tx.gemEntry.create({ data: { userId, delta: -PACK_COST, reason: 'pack' } });

    const cards = drawPack(input.rng ?? cryptoRng);
    const grouped = new Map<string, { cardIndex: number; foil: boolean; n: number }>();
    for (const c of cards) {
      const k = `${c.cardIndex}|${c.foil}`;
      const g = grouped.get(k);
      if (g) g.n += 1;
      else grouped.set(k, { ...c, n: 1 });
    }
    for (const g of grouped.values()) {
      await tx.userCard.upsert({
        where: stackKey(userId, { gameId, cardIndex: g.cardIndex, foil: g.foil }),
        create: { userId, gameId, cardIndex: g.cardIndex, foil: g.foil, count: g.n },
        update: { count: { increment: g.n } },
      });
    }
    return cards;
  });
  return { cards: drawn.map((c) => ({ ...c, name: cardName(gameId, c.cardIndex) })) };
}

/** Buy gems with coins: the coin debit and the gem credit commit together. */
export async function buyGems(input: { userId: string; units: number }): Promise<{ gems: number; coins: number }> {
  const { userId, units } = input;
  if (!validateBuyUnits(units)) throw new GemError('BAD_INPUT');
  const coins = coinCostFor(units);
  const gems = units * BUY_UNIT_GEMS;
  await prisma.$transaction(async (tx) => {
    try {
      await debitCoins(userId, coins, {
        tx,
        type: 'PURCHASE',
        entityType: 'gems',
        note: `${gems} gems`,
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) throw new GemError('INSUFFICIENT_COINS');
      throw err;
    }
    await credit(tx, userId, gems, 'buy');
  });
  return { gems, coins };
}
