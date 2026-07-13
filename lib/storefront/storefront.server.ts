/**
 * Creator storefronts (#19). Peer-to-peer digital products priced in coins.
 * On purchase, coins move buyer → creator minus a platform fee (burned as a
 * coin sink). The product's `deliverable` is revealed to the buyer afterwards.
 */

import { prisma } from '@/lib/prisma.server';

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

    // Debit buyer atomically (the `coins >= price` guard in the WHERE clause
    // blocks concurrent purchases from overdrafting a stale balance), then credit
    // creator (minus fee) and record the sale.
    const debit = await tx.userProfile.updateMany({
      where: { userId: buyerId, coins: { gte: product.price } },
      data: { coins: { decrement: product.price } },
    });
    if (debit.count === 0) throw new StorefrontError('INSUFFICIENT_COINS');
    const updatedBuyer = await tx.userProfile.findUnique({
      where: { userId: buyerId },
      select: { coins: true },
    });
    await tx.userProfile.upsert({
      where: { userId: product.creatorId },
      create: { userId: product.creatorId, coins: 10 + payout },
      update: { coins: { increment: payout } },
    });

    await tx.storefrontPurchase.create({
      data: { productId, buyerId, pricePaid: product.price },
    });
    await tx.storefrontProduct.update({
      where: { id: productId },
      data: { salesCount: { increment: 1 } },
    });

    // Ledger: buyer purchase + creator earning.
    await tx.coinTransaction.createMany({
      data: [
        { senderId: buyerId, recipientId: product.creatorId, amount: payout, type: 'PURCHASE', entityType: 'storefront', entityId: productId, note: 'Storefront sale' },
        { recipientId: buyerId, amount: -product.price, type: 'PURCHASE', entityType: 'storefront', entityId: productId, note: 'Storefront purchase' },
      ],
    });

    return { deliverable: product.deliverable, balance: updatedBuyer?.coins ?? 0, creatorId: product.creatorId };
  });
}
