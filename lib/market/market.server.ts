/**
 * Player Marketplace (§8) — server transactions.
 *
 * This module handles **real coin movement + inventory transfer**, so
 * correctness of the escrow/transfer transaction is paramount. The invariants:
 *
 *  1. An inventory item can never be duplicated. The escrow lock is the
 *     `MarketListing.inventoryId @unique` column: at most one listing per
 *     inventory row can exist, ever. `buyListing` re-parents that exact row to
 *     the buyer inside the same transaction that debits/credits coins — transfer
 *     and payment commit together or not at all.
 *  2. A listing sells at most once. The claim is an atomic conditional update
 *     (`updateMany where status = ACTIVE`) — the repo-wide READ COMMITTED idiom
 *     (see `lib/wager/escrow.server.ts`): a losing concurrent buyer's `count`
 *     comes back 0 and is rejected.
 *  3. Coins are conserved with a 10% burn. Buyer pays `price`; seller is
 *     credited `proceeds` (90%); `fee` (10%) is credited to nobody — it is a
 *     pure sink. The buyer's `PURCHASE` ledger row records the full debit and
 *     notes the burn; the seller's `MARKET` credit records the proceeds. Summing
 *     market debits minus market credits over the ledger yields the total burned.
 *  4. Market proceeds are NOT creator earnings. The seller credit is typed
 *     `MARKET`, which `lib/creator/earnings.server.ts` deliberately excludes from
 *     its "earned" derivation — closing the coins→cash redemption laundering path.
 */

import type { Prisma, MarketListing } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { debitCoins, creditCoins, EscrowError } from '@/lib/wager/escrow.server';
import { getShopItem, type ShopItem } from '@/lib/shop/catalog';
import { levelFromXp } from '@/lib/xp/levels';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { notifyAdminsOfReview } from '@/lib/admin-review.server';
import {
  isTradable,
  isPriceInBounds,
  minPriceFor,
  marketFee,
  isAnomalousPrice,
  MIN_PRICE,
  MAX_PRICE,
  MIN_SELLER_LEVEL,
  MIN_ACCOUNT_AGE_DAYS,
  MAX_ACTIVE_LISTINGS,
} from '@/lib/market/tradable';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Typed marketplace error with an HTTP status the API layer maps directly. */
export class MarketError extends Error {
  constructor(
    public readonly code: MarketErrorCode,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'MarketError';
  }
}

export type MarketErrorCode =
  | 'NOT_TRADABLE'
  | 'BAD_PRICE'
  | 'BELOW_FLOOR'
  | 'NOT_OWNED'
  | 'EQUIPPED'
  | 'ALREADY_LISTED'
  | 'TOO_MANY_LISTINGS'
  | 'ACCOUNT_TOO_NEW'
  | 'LEVEL_TOO_LOW'
  | 'NOT_FOUND'
  | 'NOT_AVAILABLE'
  | 'SELF_BUY'
  | 'ALREADY_OWNED'
  | 'INSUFFICIENT_COINS'
  | 'NOT_OWNER';

// ─── List ────────────────────────────────────────────────────────────────────

export interface ListItemInput {
  sellerId: string;
  itemId: string;
  priceCoins: number;
}

/**
 * Escrow a tradable inventory item for sale. Verifies tradability, price bounds
 * (incl. the primary-shop floor), the seller's account-age + level gates, that
 * the seller actually owns the item and it isn't equipped, and the per-seller
 * active-listing cap. The created listing's `@unique inventoryId` is the lock.
 *
 * Re-listing a previously-traded item reuses that single allowed listing row
 * (its `inventoryId` is unique, so a second row can't exist): a terminal
 * (SOLD/CANCELED) listing for the row is reset back to ACTIVE for the new seller.
 */
export async function listItem({
  sellerId,
  itemId,
  priceCoins,
}: ListItemInput): Promise<MarketListing> {
  if (!isTradable(itemId)) {
    throw new MarketError('NOT_TRADABLE', 'This item cannot be traded');
  }
  if (!Number.isInteger(priceCoins) || priceCoins < MIN_PRICE || priceCoins > MAX_PRICE) {
    throw new MarketError('BAD_PRICE', `Price must be between ${MIN_PRICE} and ${MAX_PRICE} coins`);
  }
  if (!isPriceInBounds(itemId, priceCoins)) {
    throw new MarketError('BELOW_FLOOR', `Price must be at least ${minPriceFor(itemId)} coins`);
  }

  // Seller eligibility gates (account age + level) — read outside the tx.
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: sellerId }, select: { createdAt: true } }),
    prisma.userProfile.findUnique({ where: { userId: sellerId }, select: { xp: true } }),
  ]);
  if (!user) throw new MarketError('NOT_FOUND', 'Seller not found', 404);
  const ageDays = (Date.now() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
    throw new MarketError(
      'ACCOUNT_TOO_NEW',
      `Your account must be at least ${MIN_ACCOUNT_AGE_DAYS} days old to sell`,
      403,
    );
  }
  if (levelFromXp(profile?.xp ?? 0) < MIN_SELLER_LEVEL) {
    throw new MarketError('LEVEL_TOO_LOW', `You must be level ${MIN_SELLER_LEVEL}+ to sell`, 403);
  }

  return prisma.$transaction(async (tx) => {
    const inv = await tx.userInventory.findUnique({
      where: { userId_itemId: { userId: sellerId, itemId } },
      select: { id: true, equipped: true },
    });
    if (!inv) throw new MarketError('NOT_OWNED', "You don't own that item");
    if (inv.equipped) throw new MarketError('EQUIPPED', 'Unequip the item before listing it');

    const activeCount = await tx.marketListing.count({ where: { sellerId, status: 'ACTIVE' } });
    if (activeCount >= MAX_ACTIVE_LISTINGS) {
      throw new MarketError(
        'TOO_MANY_LISTINGS',
        `You can have at most ${MAX_ACTIVE_LISTINGS} active listings`,
      );
    }

    // The inventory row can carry at most one listing (unique). A live one blocks
    // re-listing; a terminal one is recycled into the new listing.
    const existing = await tx.marketListing.findUnique({ where: { inventoryId: inv.id } });
    if (existing && (existing.status === 'ACTIVE' || existing.status === 'HELD')) {
      throw new MarketError('ALREADY_LISTED', 'That item is already listed');
    }
    if (existing) {
      return tx.marketListing.update({
        where: { inventoryId: inv.id },
        data: {
          sellerId,
          itemId,
          priceCoins,
          status: 'ACTIVE',
          buyerId: null,
          closedAt: null,
          createdAt: new Date(),
        },
      });
    }
    return tx.marketListing.create({
      data: { sellerId, inventoryId: inv.id, itemId, priceCoins, status: 'ACTIVE' },
    });
  });
}

// ─── Buy ─────────────────────────────────────────────────────────────────────

export interface BuyResult {
  /** 'SOLD' when the trade completed; 'HELD' when frozen for anomaly review. */
  status: 'SOLD' | 'HELD';
  listingId: string;
  itemId: string;
  price: number;
  proceeds: number;
  fee: number;
}

/**
 * Purchase a listing in a single transaction. On success: the listing flips
 * ACTIVE→SOLD, the buyer is debited the full price, the seller is credited 90%,
 * 10% is burned, two ledger rows are written, and the inventory row is re-parented
 * to the buyer. Any failure (insufficient coins, lost race, buyer already owns the
 * item) rolls the whole thing back — no coins move and no item transfers.
 *
 * Anomaly path: if the price is ≥ 10× the item's 30-day median sale price, the
 * listing is frozen (ACTIVE→HELD) and **no funds move**; admins are notified to
 * review it. The buyer is told it's under review.
 */
export async function buyListing({
  buyerId,
  listingId,
}: {
  buyerId: string;
  listingId: string;
}): Promise<BuyResult> {
  const result = await prisma.$transaction(async (tx) => {
    const listing = await tx.marketListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new MarketError('NOT_FOUND', 'Listing not found', 404);
    if (listing.status !== 'ACTIVE')
      throw new MarketError('NOT_AVAILABLE', 'This listing is no longer available', 409);
    if (listing.sellerId === buyerId)
      throw new MarketError('SELF_BUY', "You can't buy your own listing");

    // Buyer must not already own this itemId — inventory is unique per (user,item),
    // so re-parenting would collide. Reject gracefully instead of exploding.
    const dup = await tx.userInventory.findUnique({
      where: { userId_itemId: { userId: buyerId, itemId: listing.itemId } },
      select: { id: true },
    });
    if (dup) throw new MarketError('ALREADY_OWNED', 'You already own this item');

    // Anomaly guard: freeze suspiciously-priced buys before any money moves.
    const recentSold = await tx.marketListing.findMany({
      where: {
        itemId: listing.itemId,
        status: 'SOLD',
        closedAt: { gte: new Date(Date.now() - THIRTY_DAYS_MS) },
      },
      select: { priceCoins: true },
      orderBy: { closedAt: 'desc' },
      take: 500,
    });
    if (
      isAnomalousPrice(
        listing.priceCoins,
        recentSold.map((r) => r.priceCoins),
      )
    ) {
      const held = await tx.marketListing.updateMany({
        where: { id: listingId, status: 'ACTIVE' },
        data: { status: 'HELD' },
      });
      if (held.count === 0)
        throw new MarketError('NOT_AVAILABLE', 'This listing is no longer available', 409);
      const { fee, proceeds } = marketFee(listing.priceCoins);
      return {
        status: 'HELD' as const,
        listingId,
        itemId: listing.itemId,
        price: listing.priceCoins,
        proceeds,
        fee,
      };
    }

    // Atomic claim — the double-buy guard. A concurrent buyer that already flipped
    // the status sees count 0 here and is rejected.
    const claim = await tx.marketListing.updateMany({
      where: { id: listingId, status: 'ACTIVE' },
      data: { status: 'SOLD', buyerId, closedAt: new Date() },
    });
    if (claim.count === 0)
      throw new MarketError('NOT_AVAILABLE', 'This listing was just purchased', 409);

    const { fee, proceeds } = marketFee(listing.priceCoins);

    // Move coins: debit the buyer the full price (throws INSUFFICIENT_COINS →
    // rolls back the claim), credit the seller their proceeds. The fee is burned.
    await debitCoins(tx, buyerId, listing.priceCoins);
    await creditCoins(tx, listing.sellerId, proceeds);

    // Ledger rows (inside the tx). Buyer PURCHASE debit records the full outflow
    // and the burn; seller MARKET credit records the proceeds (excluded from
    // creator "earned").
    const item = getShopItem(listing.itemId);
    const label = item?.name ?? listing.itemId;
    await tx.coinTransaction.create({
      data: {
        senderId: null,
        recipientId: buyerId,
        amount: -listing.priceCoins,
        type: 'PURCHASE',
        entityType: 'market',
        entityId: listing.id,
        note: `Bought ${label} · ${fee} coin fee burned`.slice(0, 280),
      },
    });
    await tx.coinTransaction.create({
      data: {
        senderId: buyerId,
        recipientId: listing.sellerId,
        amount: proceeds,
        type: 'MARKET',
        entityType: 'market',
        entityId: listing.id,
        note: `Sold ${label}`.slice(0, 280),
      },
    });

    // Re-parent the escrowed inventory row to the buyer (same row id → no
    // duplication). Reset equip state + acquisition time for the new owner.
    await tx.userInventory.update({
      where: { id: listing.inventoryId },
      data: { userId: buyerId, equipped: false, acquiredAt: new Date() },
    });

    return {
      status: 'SOLD' as const,
      listingId,
      itemId: listing.itemId,
      price: listing.priceCoins,
      proceeds,
      fee,
    };
  });

  // Side effects AFTER the tx commits (never inside): queue anomaly review.
  if (result.status === 'HELD') {
    void notifyAdminsOfReview({
      preview: `Marketplace listing held for review: ${result.price} coins (≥10× median)`,
      kind: 'market',
      link: '/admin/reports',
    }).catch(() => {});
  }
  return result;
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

/** Release escrow: flip an ACTIVE listing owned by `sellerId` to CANCELED. */
export async function cancelListing(listingId: string, sellerId: string): Promise<void> {
  const res = await prisma.marketListing.updateMany({
    where: { id: listingId, sellerId, status: 'ACTIVE' },
    data: { status: 'CANCELED', closedAt: new Date() },
  });
  if (res.count === 0) {
    // Either it doesn't exist, isn't yours, or isn't ACTIVE (sold/held/canceled).
    throw new MarketError('NOT_AVAILABLE', 'That listing can no longer be canceled', 409);
  }
}

// ─── Browse / read ─────────────────────────────────────────────────────────

export type BrowseSort = 'price_asc' | 'price_desc' | 'recent';

export interface BrowseListing {
  id: string;
  itemId: string;
  priceCoins: number;
  createdAt: string;
  item: Pick<ShopItem, 'id' | 'name' | 'kind' | 'rarity' | 'data'> | null;
  seller: ReturnType<typeof resolveUser>;
}

export interface BrowseInput {
  itemId?: string | null;
  sort?: BrowseSort;
  limit?: number;
}

/** Browse ACTIVE listings, optionally filtered by item, with a sort. Public. */
export async function browse({ itemId, sort = 'recent', limit = 60 }: BrowseInput = {}): Promise<
  BrowseListing[]
> {
  const orderBy: Prisma.MarketListingOrderByWithRelationInput =
    sort === 'price_asc'
      ? { priceCoins: 'asc' }
      : sort === 'price_desc'
        ? { priceCoins: 'desc' }
        : { createdAt: 'desc' };

  const rows = await prisma.marketListing.findMany({
    where: { status: 'ACTIVE', ...(itemId ? { itemId } : {}) },
    orderBy,
    take: Math.min(Math.max(limit, 1), 100),
    include: { seller: { select: userDisplaySelect } },
  });

  return rows.map((r) => {
    const item = getShopItem(r.itemId);
    return {
      id: r.id,
      itemId: r.itemId,
      priceCoins: r.priceCoins,
      createdAt: r.createdAt.toISOString(),
      item: item
        ? { id: item.id, name: item.name, kind: item.kind, rarity: item.rarity, data: item.data }
        : null,
      seller: resolveUser(r.seller),
    };
  });
}

export interface PriceHistory {
  itemId: string;
  sales: { price: number; at: string }[];
  count: number;
  low: number | null;
  high: number | null;
  average: number | null;
  median: number | null;
}

/** Recent SOLD-price history for an item — powers the detail sparkline. */
export async function priceHistory(itemId: string, limit = 30): Promise<PriceHistory> {
  const rows = await prisma.marketListing.findMany({
    where: { itemId, status: 'SOLD' },
    orderBy: { closedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    select: { priceCoins: true, closedAt: true },
  });
  // Oldest→newest so the sparkline reads left-to-right.
  const sales = rows
    .slice()
    .reverse()
    .map((r) => ({ price: r.priceCoins, at: (r.closedAt ?? new Date()).toISOString() }));
  const prices = sales.map((s) => s.price);
  const count = prices.length;
  const sorted = [...prices].sort((a, b) => a - b);
  const med =
    count === 0
      ? null
      : sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[(sorted.length - 1) / 2];
  return {
    itemId,
    sales,
    count,
    low: count ? sorted[0] : null,
    high: count ? sorted[sorted.length - 1] : null,
    average: count ? Math.round(prices.reduce((s, p) => s + p, 0) / count) : null,
    median: med,
  };
}

/** Re-export so the API layer can distinguish escrow overdrafts. */
export { EscrowError };
