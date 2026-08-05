/**
 * Shared Prisma select and resolver for user display data.
 * Resolves custom profile fields (displayName, customImage) with
 * fallback to User model fields (name, image from Discord OAuth).
 * Also joins equipped shop cosmetics so names/avatars render with their
 * purchased styling everywhere the feed shows an author.
 */

import type { Prisma } from '@prisma/client';
import { resolveEquippedCosmetics, type EquippedCosmetics } from '@/lib/shop/equipped';

/**
 * ## Why these are the only three `User` selects
 *
 * A hand-written `select: { id: true, name: true, image: true }` looks harmless
 * and is not: it drops the `profile` join (so a user who set a custom display
 * name or avatar shows their raw OAuth name/image on that surface only) and it
 * drops the `inventory` join (so a user who equipped a cosmetic frame appears
 * without it here and with it everywhere else). The bug is per-surface and
 * invisible to whoever wrote the query, because their own account usually has
 * neither.
 *
 * So there are exactly three shapes, and `eslint-local-rules/no-adhoc-user-select`
 * warns on anything else:
 *
 * | fragment             | use it for                                              |
 * | -------------------- | ------------------------------------------------------- |
 * | `userChipSelect`     | dense lists where only a link + name renders             |
 * | `userDisplaySelect`  | anywhere an author is rendered (the default)             |
 * | `userProfileSelect`  | profile headers — adds the denormalized counts + join date |
 *
 * All three are `as const satisfies Prisma.UserSelect`: `as const` keeps the
 * literal `true`s that Prisma's `GetPayload` needs to infer a result type, and
 * `satisfies` catches a field renamed in the schema at compile time instead of
 * at query time.
 */
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
} as const satisfies Prisma.UserSelect;

/**
 * Profile headers: everything `userDisplaySelect` resolves, plus the
 * denormalized social counts and the join date.
 *
 * The counts are columns on `User` (maintained on follow/unfollow and post
 * create/delete) rather than relation aggregates, so pulling them here costs
 * nothing extra — which is the point: a profile header that runs three
 * `COUNT(*)`s because it started from `userDisplaySelect` is the alternative.
 */
export const userProfileSelect = {
  ...userDisplaySelect,
  followerCount: true,
  followingCount: true,
  postCount: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

/**
 * The minimum that renders a clickable author chip: a link target and a label.
 *
 * Deliberately has **no** `profile`/`inventory` join, so it is only correct
 * where cosmetics genuinely do not render — mention autocomplete, admin tables,
 * "who reacted" popovers. If the surface draws an avatar, it wants
 * `userDisplaySelect` instead.
 */
export const userChipSelect = {
  id: true,
  handle: true,
  name: true,
  image: true,
} as const satisfies Prisma.UserSelect;

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

/** The viewer-independent display shape returned by {@link resolveUser}. */
export interface ResolvedUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
  handle: string | null;
  isVerified: boolean;
  isAdmin: boolean;
  cosmetics?: EquippedCosmetics;
}

/**
 * Returns { id, name, image, username, handle, isVerified, isAdmin, cosmetics }
 * with custom fields resolved. `cosmetics` is the equipped shop styling (name
 * color, avatar frame, badge, …) when the row joined in `inventory`.
 */
export function resolveUser(user: UserWithProfileAndId): ResolvedUser {
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
