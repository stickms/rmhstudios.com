/**
 * Creator storefronts (#19). Peer-to-peer digital products priced in coins.
 * On purchase, coins move buyer → creator minus a platform fee (burned as a
 * coin sink). The product's `deliverable` is revealed to the buyer afterwards.
 *
 * The PRODUCT kind of `Listing` (see `lib/listings/listings.server.ts`): a
 * product is a listing that sells to many buyers, one `ListingPurchase` each;
 * `status` ACTIVE is on sale and CANCELED is taken down (the old `active`
 * flag). Was `lib/storefront/storefront.server.ts` + `lib/storefront.server.ts`
 * over `StorefrontProduct` / `StorefrontPurchase`, and moved here unchanged in
 * what it debits, credits and writes to the ledger (the ledger's `entityId` is
 * the product's id, which the copy kept).
 */

import { prisma } from '@/lib/prisma.server';
import { transferCoins, InsufficientFundsError } from '@/lib/economy/ledger.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import type { StorefrontProductRow, StorefrontResult } from '@/lib/listings/views';

export const STOREFRONT_FEE_RATE = 0.1; // 10% burned

/** At most this many products per creator. */
export const MAX_PRODUCTS = 30;

export class StorefrontError extends Error {}

type ProductListing = {
  id: string;
  sellerId: string;
  title: string | null;
  description: string | null;
  priceCoins: number;
  deliverable: string | null;
  status: string;
  salesCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/** A product listing in the shape the storefront API has always answered with. */
function toProductRow(l: ProductListing): StorefrontProductRow {
  return {
    id: l.id,
    creatorId: l.sellerId,
    title: l.title ?? '',
    description: l.description,
    price: l.priceCoins,
    deliverable: l.deliverable,
    active: l.status === 'ACTIVE',
    salesCount: l.salesCount,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

// ─── Manage (owner) ─────────────────────────────────────────────────────────

/** How many products a creator has (live or taken down). */
export function countProducts(creatorId: string): Promise<number> {
  return prisma.listing.count({ where: { kind: 'PRODUCT', sellerId: creatorId } });
}

export async function createProduct(input: {
  creatorId: string;
  title: string;
  description: string | null;
  price: number;
  deliverable: string | null;
}): Promise<StorefrontProductRow> {
  const row = await prisma.listing.create({
    data: {
      kind: 'PRODUCT',
      sellerId: input.creatorId,
      title: input.title,
      description: input.description,
      priceCoins: input.price,
      deliverable: input.deliverable,
      status: 'ACTIVE',
    },
  });
  return toProductRow(row);
}

/** The product's creator, or null when no such product exists. */
export async function productCreator(productId: string): Promise<string | null> {
  const row = await prisma.listing.findUnique({
    where: { id: productId, kind: 'PRODUCT' },
    select: { sellerId: true },
  });
  return row?.sellerId ?? null;
}

export async function updateProduct(
  productId: string,
  patch: {
    title?: string;
    description?: string | null;
    price?: number;
    deliverable?: string | null;
    active?: boolean;
  },
): Promise<StorefrontProductRow> {
  const row = await prisma.listing.update({
    where: { id: productId, kind: 'PRODUCT' },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.price !== undefined ? { priceCoins: patch.price } : {}),
      ...(patch.deliverable !== undefined ? { deliverable: patch.deliverable } : {}),
      ...(patch.active !== undefined ? { status: patch.active ? 'ACTIVE' : 'CANCELED' } : {}),
    },
  });
  return toProductRow(row);
}

/** Delete a product (its purchase records go with it, as they always did). */
export async function deleteProduct(productId: string): Promise<void> {
  await prisma.listing.delete({ where: { id: productId, kind: 'PRODUCT' } });
}

// ─── Buy ────────────────────────────────────────────────────────────────────

/** Purchase a product. Returns the deliverable + new buyer balance. */
export async function buyProduct(
  productId: string,
  buyerId: string,
): Promise<{ deliverable: string | null; balance: number; creatorId: string }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.listing.findUnique({
      where: { id: productId, kind: 'PRODUCT' },
      select: { id: true, sellerId: true, priceCoins: true, status: true, deliverable: true },
    });
    if (!row || row.status !== 'ACTIVE') throw new StorefrontError('UNAVAILABLE');
    const product = {
      id: row.id,
      creatorId: row.sellerId,
      price: row.priceCoins,
      deliverable: row.deliverable,
    };
    if (product.creatorId === buyerId) throw new StorefrontError('OWN_PRODUCT');

    const already = await tx.listingPurchase.findUnique({
      where: { listingId_buyerId: { listingId: productId, buyerId } },
      select: { id: true },
    });
    if (already) throw new StorefrontError('ALREADY_OWNED');

    await tx.userProfile.upsert({
      where: { userId: buyerId },
      create: { userId: buyerId, coins: 10 },
      update: {},
    });

    const fee = Math.floor(product.price * STOREFRONT_FEE_RATE);
    const payout = product.price - fee;

    // Buyer pays `price`, creator receives `payout`, the fee is destroyed —
    // all in one atomic transfer that also writes the ledger rows. The previous
    // pair of rows double-counted the buyer (sender of `payout` AND recipient
    // of `-price`), so the ledger could not be summed against balances.
    try {
      await transferCoins(buyerId, product.creatorId, product.price, {
        tx,
        fee: product.price - payout,
        type: 'PURCHASE',
        entityType: 'storefront',
        entityId: productId,
        note: 'Storefront sale',
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) throw new StorefrontError('INSUFFICIENT_COINS');
      throw err;
    }
    const updatedBuyer = await tx.userProfile.findUnique({
      where: { userId: buyerId },
      select: { coins: true },
    });

    // The (listing, buyer) unique index is the at-most-once guard for a racing
    // second purchase by the same buyer: its insert fails and the transfer
    // above rolls back with it.
    await tx.listingPurchase.create({
      data: { listingId: productId, buyerId, pricePaid: product.price },
    });
    await tx.listing.update({
      where: { id: productId },
      data: { salesCount: { increment: 1 } },
    });

    return {
      deliverable: product.deliverable,
      balance: Number(updatedBuyer?.coins ?? 0),
      creatorId: product.creatorId,
    };
  });
}

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * A creator's storefront, resolved by handle or id and scoped to `viewerId`
 * (deliverables only for the owner or buyers). Returns `null` when the creator
 * doesn't exist so callers can 404.
 *
 * Shared by the `/api/storefront/creator/$userid` GET handler and the
 * `/store/$userid` route loader so the storefront is server-rendered /
 * prefetched instead of fetched client-side on mount.
 */
export async function listStorefront(
  userid: string,
  viewerId: string | null,
): Promise<StorefrontResult | null> {
  const creator = await prisma.user.findFirst({
    where: { OR: [{ id: userid }, { handle: userid }] },
    select: userDisplaySelect,
  });
  if (!creator) return null;

  const isOwner = viewerId === creator.id;
  const products = await prisma.listing.findMany({
    where: {
      kind: 'PRODUCT',
      sellerId: creator.id,
      ...(isOwner ? {} : { status: 'ACTIVE' as const }),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      priceCoins: true,
      status: true,
      salesCount: true,
      deliverable: true,
      createdAt: true,
    },
  });

  // Which products the viewer already owns.
  let ownedIds = new Set<string>();
  if (viewerId && !isOwner) {
    const purchases = await prisma.listingPurchase.findMany({
      where: { buyerId: viewerId, listingId: { in: products.map((p) => p.id) } },
      select: { listingId: true },
    });
    ownedIds = new Set(purchases.map((p) => p.listingId));
  }

  return {
    creator: resolveUser(creator),
    isOwner,
    signedIn: !!viewerId,
    products: products.map((p) => {
      const owned = ownedIds.has(p.id);
      const canSeeDeliverable = isOwner || owned;
      return {
        id: p.id,
        title: p.title ?? '',
        description: p.description,
        price: p.priceCoins,
        active: p.status === 'ACTIVE',
        salesCount: p.salesCount,
        createdAt: p.createdAt.toISOString(),
        owned,
        deliverable: canSeeDeliverable ? p.deliverable : null,
      };
    }),
  };
}
