/**
 * Listings — the one data module for the player marketplaces.
 *
 * Everything a member puts up for coins is a row of `Listing`, told apart by
 * `kind`:
 *
 *  - COSMETIC — a tradable shop item, escrowed by its exact `UserInventory`
 *    row; sells once. Rules and money: `lib/listings/cosmetic.server.ts`.
 *  - CARD — one trading card, escrowed out of the seller's stack; sells once.
 *    The card market's buy orders (bids) fill against these. Rules and money:
 *    `lib/listings/card.server.ts`.
 *  - PRODUCT — a creator's digital product on their storefront; sells to many
 *    buyers, one `ListingPurchase` each. Rules and money:
 *    `lib/listings/product.server.ts`.
 *
 * Only `lib/listings/**` names `prisma.listing` / `prisma.listingPurchase`
 * (`lib/listings/__tests__/one-module.test.ts` holds that, and that nothing
 * outside the schema names the old models). This file is the shared core: the
 * kind-scoped claim and close (the double-sell guards), and the reads other
 * domains need (a cosmetic's lowest asking price for watchers, wishlists and
 * savings goals; counts for the admin queue and a game's hub; account export
 * and erasure).
 *
 * What did not merge, and why:
 *  - The shop catalog (`lib/shop/catalog.ts`) and the daily rotation
 *    (`lib/shop/daily-shop*.ts`) are code, not rows: nobody lists them, they
 *    never sell out, and the platform is the seller. They stay catalogs.
 *  - Card buy orders (`CardBuyOrder`) are bids, the other side of an order
 *    book: no escrow, matched against listings when either side arrives. They
 *    stay their own table, read and written by `card.server.ts`.
 *  - Card trades (`CardTrade`) are card-for-card swaps with no price and no
 *    coins. They stay in `lib/cards/trades.server.ts`.
 *  - Gems (`UserGems` / `GemEntry`) are a second balance people hold; they are
 *    untouched (removing them means converting every balance, see the PR).
 *
 * Expand/contract: the old tables (`market_listing`, `card_listing`,
 * `storefront_product`, `storefront_purchase`) stay until the contract
 * release. The expand migration (20261120000000_listings_one_model) copied
 * them and installed triggers that mirror every write between them and
 * `listing` in both directions, so the release on the other side of a
 * blue/green swap, or a rollback, sees the same open listings: a listing
 * bought on one release is closed on the other in the same transaction.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';

export type ListingKind = 'COSMETIC' | 'CARD' | 'PRODUCT';

/** A transaction client, or the root client outside one. */
export type Db = Prisma.TransactionClient | typeof prisma;

/** The cosmetic columns of a row, narrowed (the schema keeps them nullable for the other kinds). */
export function cosmeticFields(row: { itemId: string | null; inventoryId: string | null }): {
  itemId: string;
  inventoryId: string;
} {
  if (row.itemId == null || row.inventoryId == null) {
    throw new Error('Listing is not a cosmetic listing');
  }
  return { itemId: row.itemId, inventoryId: row.inventoryId };
}

/** The card columns of a row, narrowed. */
export function cardFields(row: { gameId: string | null; cardIndex: number | null; foil: boolean }): {
  gameId: string;
  cardIndex: number;
  foil: boolean;
} {
  if (row.gameId == null || row.cardIndex == null) {
    throw new Error('Listing is not a card listing');
  }
  return { gameId: row.gameId, cardIndex: row.cardIndex, foil: row.foil };
}

/**
 * The double-sell guard every one-shot sale goes through: a conditional
 * `updateMany where status = ACTIVE` (the repo-wide READ COMMITTED idiom, see
 * `lib/wager/escrow.server.ts`). A losing concurrent buyer, on this release or
 * the other one during a swap (the mirror trigger writes the old row under the
 * same row lock), sees count 0. Returns whether this call won.
 */
export async function claimListing(
  tx: Db,
  { id, kind, buyerId }: { id: string; kind: ListingKind; buyerId: string },
): Promise<boolean> {
  const claim = await tx.listing.updateMany({
    where: { id, kind, status: 'ACTIVE' },
    data: { status: 'SOLD', buyerId, closedAt: new Date() },
  });
  return claim.count > 0;
}

/**
 * Close a listing without a sale: CAS its status to CANCELED. `where` carries
 * the caller's conditions (owner, the statuses it may close from). Returns
 * whether this call won, so whatever was escrowed is returned exactly once.
 */
export async function closeListing(
  tx: Db,
  kind: ListingKind,
  where: Prisma.ListingWhereInput,
): Promise<boolean> {
  const res = await tx.listing.updateMany({
    where: { ...where, kind },
    data: { status: 'CANCELED', closedAt: new Date() },
  });
  return res.count > 0;
}

// ─── Reads other domains need ───────────────────────────────────────────────

/**
 * The lowest ACTIVE asking price for a cosmetic item, or null when nothing is
 * listed. `excludeId` leaves one listing out (a new listing comparing itself
 * with the rest); `excludeSellerId`, `createdAfter` and `below` narrow the
 * search for alerts.
 */
export async function lowestCosmeticPrice(
  itemId: string,
  opts: { excludeId?: string; excludeSellerId?: string; createdAfter?: Date; below?: number } = {},
): Promise<number | null> {
  const row = await prisma.listing.findFirst({
    where: {
      kind: 'COSMETIC',
      itemId,
      status: 'ACTIVE',
      ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
      ...(opts.excludeSellerId ? { sellerId: { not: opts.excludeSellerId } } : {}),
      ...(opts.createdAfter ? { createdAt: { gt: opts.createdAfter } } : {}),
      ...(opts.below !== undefined ? { priceCoins: { lt: opts.below } } : {}),
    },
    orderBy: { priceCoins: 'asc' },
    select: { priceCoins: true },
  });
  return row?.priceCoins ?? null;
}

/** The lowest ACTIVE asking price per cosmetic item, for many items in one query. */
export async function lowestCosmeticPrices(itemIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (itemIds.length === 0) return out;
  const mins = await prisma.listing.groupBy({
    by: ['itemId'],
    where: { kind: 'COSMETIC', itemId: { in: itemIds }, status: 'ACTIVE' },
    _min: { priceCoins: true },
  });
  for (const m of mins) {
    if (m.itemId != null && m._min.priceCoins != null) out.set(m.itemId, m._min.priceCoins);
  }
  return out;
}

/** How many cosmetic listings are frozen for admin review. */
export function countHeldCosmetics(): Promise<number> {
  return prisma.listing.count({ where: { kind: 'COSMETIC', status: 'HELD' } });
}

/** ACTIVE card listings of one title, leaving out the viewer's own. */
export function countActiveCards(gameId: string, excludeSellerId: string | null): Promise<number> {
  return prisma.listing.count({
    where: {
      kind: 'CARD',
      gameId,
      status: 'ACTIVE',
      ...(excludeSellerId ? { sellerId: { not: excludeSellerId } } : {}),
    },
  });
}

/**
 * Account erasure: the person's live card listings go (the escrowed card goes
 * with the rest of their cards); finished sales stay as anonymous price
 * history. Returned unawaited, for the caller's `$transaction([...])`.
 */
export function deleteActiveCardListingsOf(userId: string) {
  return prisma.listing.deleteMany({ where: { kind: 'CARD', sellerId: userId, status: 'ACTIVE' } });
}

/** Account export: card listings as seller or buyer, in the shape the export always had. */
export async function cardListingsForExport(userId: string, take: number) {
  const rows = await prisma.listing.findMany({
    where: { kind: 'CARD', OR: [{ sellerId: userId }, { buyerId: userId }] },
    take,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      sellerId: true,
      gameId: true,
      cardIndex: true,
      foil: true,
      priceCoins: true,
      status: true,
      buyerId: true,
      createdAt: true,
      closedAt: true,
    },
  });
  return rows;
}
