import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

export interface StorefrontProductItem {
  id: string;
  title: string;
  description: string | null;
  price: number;
  active: boolean;
  salesCount: number;
  createdAt: string;
  owned: boolean;
  deliverable: string | null;
}

export interface StorefrontResult {
  creator: ReturnType<typeof resolveUser>;
  isOwner: boolean;
  signedIn: boolean;
  products: StorefrontProductItem[];
}

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
  viewerId: string | null
): Promise<StorefrontResult | null> {
  const creator = await prisma.user.findFirst({
    where: { OR: [{ id: userid }, { handle: userid }] },
    select: userDisplaySelect,
  });
  if (!creator) return null;

  const isOwner = viewerId === creator.id;
  const products = await prisma.storefrontProduct.findMany({
    where: { creatorId: creator.id, ...(isOwner ? {} : { active: true }) },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      price: true,
      active: true,
      salesCount: true,
      deliverable: true,
      createdAt: true,
    },
  });

  // Which products the viewer already owns.
  let ownedIds = new Set<string>();
  if (viewerId && !isOwner) {
    const purchases = await prisma.storefrontPurchase.findMany({
      where: { buyerId: viewerId, productId: { in: products.map((p) => p.id) } },
      select: { productId: true },
    });
    ownedIds = new Set(purchases.map((p) => p.productId));
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
        title: p.title,
        description: p.description,
        price: p.price,
        active: p.active,
        salesCount: p.salesCount,
        createdAt: p.createdAt.toISOString(),
        owned,
        deliverable: canSeeDeliverable ? p.deliverable : null,
      };
    }),
  };
}
