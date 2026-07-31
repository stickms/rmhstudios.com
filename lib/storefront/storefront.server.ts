/**
 * Creator storefronts (#19). Peer-to-peer digital products priced in coins.
 * On purchase, coins move buyer → creator minus a platform fee (burned as a
 * coin sink). The product's `deliverable` is revealed to the buyer afterwards.
 */

import { prisma } from '@/lib/prisma.server';
import { transferCoins, InsufficientFundsError } from '@/lib/economy/ledger.server';

export const STOREFRONT_FEE_RATE = 0.1; // 10% burned

export class StorefrontError extends Error {}

/** Purchase a product. Returns the deliverable + new buyer balance. */
export async function buyProduct(
  productId: string,
  buyerId: string
): Promise<{ deliverable: string | null; balance: number; creatorId: string }> {
  return prisma.$transaction(async (tx) => {
    const product = await tx.storefrontProduct.findUnique({
      where: { id: productId },
      select: { id: true, creatorId: true, price: true, active: true, deliverable: true },
    });
    if (!product || !product.active) throw new StorefrontError('UNAVAILABLE');
    if (product.creatorId === buyerId) throw new StorefrontError('OWN_PRODUCT');

    const already = await tx.storefrontPurchase.findUnique({
      where: { productId_buyerId: { productId, buyerId } },
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

    await tx.storefrontPurchase.create({
      data: { productId, buyerId, pricePaid: product.price },
    });
    await tx.storefrontProduct.update({
      where: { id: productId },
      data: { salesCount: { increment: 1 } },
    });

    return { deliverable: product.deliverable, balance: updatedBuyer?.coins ?? 0, creatorId: product.creatorId };
  });
}
