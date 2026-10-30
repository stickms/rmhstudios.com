/**
 * The trading-card market: list, buy, cancel, browse. Real coin movement and card
 * transfer, so the invariants (docs/superpowers/specs/2026-10-30-card-market-design.md):
 *
 *  1. A card is in exactly one place: a stack, one ACTIVE listing (escrow), or the
 *     buyer's stack. List = decrement the stack + create the listing in one
 *     transaction, under the owner's card lock.
 *  2. A listing sells at most once: the claim is a conditional `updateMany` on
 *     `status = ACTIVE`; the loser of a race sees count 0 and the transaction rolls back.
 *  3. Coins are conserved with a burn: one `transferCoins({ tx, fee, type: 'MARKET' })`,
 *     so the ledger reproduces every balance and the fee is a recorded sink.
 *  4. An insufficient balance rolls back the claim and the card.
 */

import { prisma } from '@/lib/prisma.server';
import { InsufficientFundsError, transferCoins, getBalance } from '@/lib/economy/ledger.server';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { isTrackableTitle } from '@/lib/games/route-match';
import { levelFromXp } from '@/lib/xp/levels';
import { SET_SIZE, cardName } from '@/lib/cards/cards';
import { lockCards } from '@/lib/cards/cards.server';
import {
  MAX_CARD_LISTINGS,
  MIN_ACCOUNT_AGE_DAYS,
  MIN_SELLER_LEVEL,
  checkAskingPrice,
  marketFee,
  sellerEligible,
} from '@/lib/cards/market-rules';
import type { MarketData, MarketGroup, MyListing } from '@/lib/cards/market-types';

const THIRTY_DAYS_MS = 30 * 86_400_000;
const BROWSE_LIMIT = 500;

export type MarketErrorCode =
  | 'NOT_TRADABLE'
  | 'BAD_PRICE'
  | 'FAR_ABOVE_MARKET'
  | 'NOT_OWNED'
  | 'TOO_MANY_LISTINGS'
  | 'ACCOUNT_TOO_NEW'
  | 'LEVEL_TOO_LOW'
  | 'NOT_FOUND'
  | 'NOT_AVAILABLE'
  | 'SELF_BUY'
  | 'INSUFFICIENT_COINS';

/** A typed refusal with the HTTP status the API layer maps directly. */
export class MarketError extends Error {
  constructor(
    readonly code: MarketErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'MarketError';
  }
}

export type CardRef = { gameId: string; cardIndex: number; foil: boolean };

function assertCard(c: CardRef) {
  if (!isTrackableTitle(c.gameId) || !Number.isInteger(c.cardIndex) || c.cardIndex < 0 || c.cardIndex >= SET_SIZE) {
    throw new MarketError('NOT_TRADABLE', 'That card does not exist');
  }
}

const stackKey = (userId: string, c: CardRef) => ({
  userId_gameId_cardIndex_foil: { userId, gameId: c.gameId, cardIndex: c.cardIndex, foil: c.foil },
});

export async function listCard(input: CardRef & { sellerId: string; priceCoins: number }) {
  const { sellerId, priceCoins } = input;
  assertCard(input);

  // The account gates, read outside the transaction (as the shop market does).
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: sellerId }, select: { createdAt: true } }),
    prisma.userProfile.findUnique({ where: { userId: sellerId }, select: { xp: true } }),
  ]);
  if (!user) throw new MarketError('NOT_FOUND', 'Seller not found', 404);
  const ageDays = (Date.now() - user.createdAt.getTime()) / 86_400_000;
  const level = levelFromXp(profile?.xp ?? 0);
  if (!sellerEligible({ level, accountAgeDays: ageDays })) {
    if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
      throw new MarketError(
        'ACCOUNT_TOO_NEW',
        `Your account must be at least ${MIN_ACCOUNT_AGE_DAYS} days old to sell`,
        403,
      );
    }
    throw new MarketError('LEVEL_TOO_LOW', `You must be level ${MIN_SELLER_LEVEL}+ to sell`, 403);
  }

  const recent = await prisma.cardListing.findMany({
    where: {
      gameId: input.gameId,
      cardIndex: input.cardIndex,
      foil: input.foil,
      status: 'SOLD',
      closedAt: { gte: new Date(Date.now() - THIRTY_DAYS_MS) },
    },
    select: { priceCoins: true },
    orderBy: { closedAt: 'desc' },
    take: 200,
  });
  const verdict = checkAskingPrice(
    priceCoins,
    recent.map((r) => r.priceCoins),
  );
  if (verdict === 'far-above-market') {
    throw new MarketError('FAR_ABOVE_MARKET', 'That price is far above recent sales of this card');
  }
  if (verdict !== 'ok') throw new MarketError('BAD_PRICE', 'Price is outside the allowed range');

  return prisma.$transaction(async (tx) => {
    await lockCards(tx, sellerId);
    const stack = await tx.userCard.findUnique({
      where: stackKey(sellerId, input),
      select: { count: true },
    });
    if (!stack) throw new MarketError('NOT_OWNED', "You don't hold that card");

    const active = await tx.cardListing.count({ where: { sellerId, status: 'ACTIVE' } });
    if (active >= MAX_CARD_LISTINGS) {
      throw new MarketError('TOO_MANY_LISTINGS', `You can have at most ${MAX_CARD_LISTINGS} active listings`);
    }

    // Escrow: the card leaves the stack in the same transaction the listing is made.
    if (stack.count === 1) await tx.userCard.delete({ where: stackKey(sellerId, input) });
    else await tx.userCard.update({ where: stackKey(sellerId, input), data: { count: { decrement: 1 } } });

    return tx.cardListing.create({
      data: {
        sellerId,
        gameId: input.gameId,
        cardIndex: input.cardIndex,
        foil: input.foil,
        priceCoins,
      },
    });
  });
}

export interface BuyResult {
  listingId: string;
  price: number;
  fee: number;
  proceeds: number;
}

export async function buyCard({
  buyerId,
  listingId,
}: {
  buyerId: string;
  listingId: string;
}): Promise<BuyResult> {
  return prisma.$transaction(async (tx) => {
    // The buyer's stack changes (they receive the card), so take their card lock.
    await lockCards(tx, buyerId);

    const listing = await tx.cardListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new MarketError('NOT_FOUND', 'Listing not found', 404);
    if (listing.status !== 'ACTIVE') {
      throw new MarketError('NOT_AVAILABLE', 'This listing is no longer available', 409);
    }
    if (listing.sellerId === buyerId) throw new MarketError('SELF_BUY', "You can't buy your own listing");

    // The double-buy guard: a concurrent buyer that already flipped the status sees 0.
    const claim = await tx.cardListing.updateMany({
      where: { id: listingId, status: 'ACTIVE' },
      data: { status: 'SOLD', buyerId, closedAt: new Date() },
    });
    if (claim.count === 0) throw new MarketError('NOT_AVAILABLE', 'This listing was just purchased', 409);

    const { fee, proceeds } = marketFee(listing.priceCoins);
    try {
      await transferCoins(buyerId, listing.sellerId, listing.priceCoins, {
        tx,
        fee,
        type: 'MARKET',
        entityType: 'card-market',
        entityId: listing.id,
        note: `${cardName(listing.gameId, listing.cardIndex)} · ${fee} coin fee burned`.slice(0, 280),
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        throw new MarketError('INSUFFICIENT_COINS', 'Not enough coins', 402);
      }
      throw err;
    }

    await tx.userCard.upsert({
      where: stackKey(buyerId, listing),
      create: { userId: buyerId, gameId: listing.gameId, cardIndex: listing.cardIndex, foil: listing.foil, count: 1 },
      update: { count: { increment: 1 } },
    });

    return { listingId, price: listing.priceCoins, fee, proceeds };
  });
}

/** Take a listing down and return the escrowed card. */
export async function cancelCard({
  sellerId,
  listingId,
}: {
  sellerId: string;
  listingId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCards(tx, sellerId);
    const claim = await tx.cardListing.updateMany({
      where: { id: listingId, sellerId, status: 'ACTIVE' },
      data: { status: 'CANCELED', closedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new MarketError('NOT_AVAILABLE', 'That listing can no longer be canceled', 409);
    }
    const listing = await tx.cardListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new MarketError('NOT_FOUND', 'Listing not found', 404);
    await tx.userCard.upsert({
      where: stackKey(sellerId, listing),
      create: { userId: sellerId, gameId: listing.gameId, cardIndex: listing.cardIndex, foil: listing.foil, count: 1 },
      update: { count: { increment: 1 } },
    });
  });
}

/** Everything on sale, grouped per card, plus the viewer's own listings. */
export async function getMarket(viewerId: string | null, gameId?: string): Promise<MarketData> {
  const titles = new Map(listCuratedBuilds().map((b) => [b.id, b]));
  const rows = await prisma.cardListing.findMany({
    where: { status: 'ACTIVE', ...(gameId ? { gameId } : {}) },
    orderBy: [{ priceCoins: 'asc' }, { createdAt: 'asc' }],
    take: BROWSE_LIMIT,
    select: {
      id: true,
      sellerId: true,
      gameId: true,
      cardIndex: true,
      foil: true,
      priceCoins: true,
      createdAt: true,
    },
  });

  const groups = new Map<string, MarketGroup>();
  const mine: MyListing[] = [];
  for (const r of rows) {
    const title = titles.get(r.gameId);
    if (!title) continue;
    if (viewerId && r.sellerId === viewerId) {
      mine.push({
        id: r.id,
        gameId: r.gameId,
        title: title.title,
        hue: title.hue,
        cardIndex: r.cardIndex,
        foil: r.foil,
        priceCoins: r.priceCoins,
        createdAt: r.createdAt.toISOString(),
      });
      continue;
    }
    const k = `${r.gameId}|${r.cardIndex}|${r.foil}`;
    const g = groups.get(k);
    if (g) g.count += 1;
    else {
      groups.set(k, {
        gameId: r.gameId,
        title: title.title,
        hue: title.hue,
        cardIndex: r.cardIndex,
        foil: r.foil,
        lowestPrice: r.priceCoins,
        count: 1,
        buyListingId: r.id,
      });
    }
  }
  return {
    groups: [...groups.values()].sort((a, b) => a.title.localeCompare(b.title) || a.cardIndex - b.cardIndex),
    mine,
    signedIn: !!viewerId,
    balance: viewerId ? await getBalance(viewerId) : null,
  };
}
