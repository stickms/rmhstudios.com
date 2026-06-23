/**
 * Shared Prisma select and resolver for user display data.
 * Resolves custom profile fields (displayName, customImage) with
 * fallback to User model fields (name, image from Discord OAuth).
 * Also joins equipped shop cosmetics so names/avatars render with their
 * purchased styling everywhere the feed shows an author.
 */

import { resolveEquippedCosmetics, type EquippedCosmetics } from '@/lib/shop/equipped';

export const userDisplaySelect = {
  id: true,
  name: true,
  image: true,
  username: true,
  handle: true,
  isVerified: true,
  isAdmin: true,
  profile: {
    select: {
      displayName: true,
      customImage: true,
    },
  },
  inventory: {
    where: { equipped: true },
    select: { itemId: true },
  },
} as const;

type UserWithProfile = {
  name: string | null;
  image: string | null;
  isVerified?: boolean;
  isAdmin?: boolean;
  profile?: { displayName?: string | null; customImage?: string | null } | null;
};

export function resolveUserDisplay(user: UserWithProfile) {
  return {
    name: user.profile?.displayName ?? user.name,
    image: user.profile?.customImage ?? user.image,
  };
}

type UserWithProfileAndId = UserWithProfile & {
  id: string;
  username: string | null;
  handle?: string | null;
  inventory?: { itemId: string }[] | null;
};

/**
 * Returns { id, name, image, username, handle, isVerified, isAdmin, cosmetics }
 * with custom fields resolved. `cosmetics` is the equipped shop styling (name
 * color, avatar frame, badge, …) when the row joined in `inventory`.
 */
export function resolveUser(user: UserWithProfileAndId): {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
  handle: string | null;
  isVerified: boolean;
  isAdmin: boolean;
  cosmetics?: EquippedCosmetics;
} {
  const cosmetics = user.inventory
    ? resolveEquippedCosmetics(user.inventory.map((i) => i.itemId))
    : undefined;
  return {
    id: user.id,
    name: user.profile?.displayName ?? user.name,
    image: user.profile?.customImage ?? user.image,
    username: user.username,
    handle: user.handle ?? null,
    isVerified: user.isVerified ?? false,
    isAdmin: user.isAdmin ?? false,
    ...(cosmetics && Object.keys(cosmetics).length > 0 ? { cosmetics } : {}),
  };
}
