/**
 * Wishlists — server logic (§8). Add/remove/list entries and resolve them to
 * display shapes. The match/alert sweep (pg-boss over the reverse index) is a
 * follow-up; the reverse index (@@index([entityType, entityId])) is in place.
 */
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import type { WishlistEntityType, WishlistItemView } from '@/lib/wishlist/types';

export async function addWish(
  userId: string,
  input: { entityType: WishlistEntityType; entityId: string; targetPrice?: number | null },
): Promise<void> {
  await prisma.wishlistEntry.upsert({
    where: {
      userId_entityType_entityId: { userId, entityType: input.entityType, entityId: input.entityId },
    },
    create: {
      userId,
      entityType: input.entityType,
      entityId: input.entityId,
      targetPrice: input.targetPrice ?? null,
    },
    update: input.targetPrice !== undefined ? { targetPrice: input.targetPrice } : {},
  });
}

export async function removeWish(
  userId: string,
  entityType: WishlistEntityType,
  entityId: string,
): Promise<void> {
  await prisma.wishlistEntry.deleteMany({ where: { userId, entityType, entityId } });
}

type WishRow = {
  id: string;
  entityType: string;
  entityId: string;
  targetPrice: number | null;
  createdAt: Date;
};

async function hydrate(rows: WishRow[]): Promise<WishlistItemView[]> {
  // creator_builds entries reference a user id — resolve their display name.
  const creatorIds = rows.filter((r) => r.entityType === 'creator_builds').map((r) => r.entityId);
  const creatorMap = new Map<string, string>();
  if (creatorIds.length) {
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: userDisplaySelect,
    });
    for (const c of creators) {
      const u = resolveUser(c);
      creatorMap.set(c.id, u.name ?? u.handle ?? 'Creator');
    }
  }
  return rows.map((r): WishlistItemView => {
    if (r.entityType === 'creator_builds') {
      const name = creatorMap.get(r.entityId);
      return {
        id: r.id,
        entityType: r.entityType,
        entityId: r.entityId,
        targetPrice: r.targetPrice,
        createdAt: r.createdAt.toISOString(),
        title: name ? `Builds by ${name}` : 'Creator builds',
        href: `/u/${r.entityId}`,
      };
    }
    return {
      id: r.id,
      entityType: r.entityType as WishlistEntityType,
      entityId: r.entityId,
      targetPrice: r.targetPrice,
      createdAt: r.createdAt.toISOString(),
      title: r.entityId,
      href: null,
    };
  });
}

export async function listWishlist(userId: string): Promise<WishlistItemView[]> {
  const rows = await prisma.wishlistEntry.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, entityType: true, entityId: true, targetPrice: true, createdAt: true },
  });
  return hydrate(rows);
}

/** Another user's wishlist — only when they've left it public. */
export async function listPublicWishlist(targetUserId: string): Promise<WishlistItemView[] | null> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId: targetUserId },
    select: { wishlistPublic: true },
  });
  if (profile && profile.wishlistPublic === false) return null;
  return listWishlist(targetUserId);
}
