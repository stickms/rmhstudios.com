/**
 * Shared Prisma select and resolver for user display data.
 * Resolves custom profile fields (displayName, customImage) with
 * fallback to User model fields (name, image from Discord OAuth).
 */

export const userDisplaySelect = {
  id: true,
  name: true,
  image: true,
  username: true,
  isVerified: true,
  isAdmin: true,
  profile: {
    select: {
      displayName: true,
      customImage: true,
    },
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
};

/** Returns { id, name, image, username, isVerified, isAdmin } with custom fields resolved. */
export function resolveUser(user: UserWithProfileAndId) {
  return {
    id: user.id,
    name: user.profile?.displayName ?? user.name,
    image: user.profile?.customImage ?? user.image,
    username: user.username,
    isVerified: user.isVerified ?? false,
    isAdmin: user.isAdmin ?? false,
  };
}
