import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay } from '@/lib/user-display';
import { handleCooldownRemaining } from '@/lib/handle';
import { getEquippedCosmetics } from '@/lib/shop/equipped.server';
import { profileLinkSchema, type ProfileLink } from '@/lib/profile-schema';
import { getMembershipStatus } from '@/lib/memberships.server';

/**
 * Coerce the JSON `links` column into a validated ProfileLink[]. Defends the
 * read path against malformed/legacy rows — anything that doesn't match the
 * schema is dropped rather than trusted.
 */
function parseProfileLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = profileLinkSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

const profileSelect = {
  id: true,
  name: true,
  username: true,
  handle: true,
  handleChangedAt: true,
  image: true,
  isVerified: true,
  isAdmin: true,
  createdAt: true,
  lastSeenAt: true,
  profile: {
    select: {
      displayName: true,
      customImage: true,
      bannerUrl: true,
      bio: true,
      location: true,
      website: true,
      links: true,
      showLikes: true,
      dmPrivacy: true,
      profileSongSpotifyId: true,
      profileSongTitle: true,
      profileSongArtist: true,
      profileSongPreviewUrl: true,
      profileSongAlbumArt: true,
      tipGoal: true,
      tipGoalLabel: true,
      membershipPriceCoins: true,
      coins: true,
    },
  },
  // Denormalized counters (maintained on follow/unfollow + post create/delete,
  // reconciled by scripts/reconcile-social-counts.ts) instead of three COUNT(*)
  // aggregates per profile view.
  followerCount: true,
  followingCount: true,
  postCount: true,
} as const;

export interface ProfilePayload {
  cosmetics: Awaited<ReturnType<typeof getEquippedCosmetics>>;
  isOnline: boolean;
  tipGoal: number | null;
  tipGoalLabel: string | null;
  tipsThisMonth: number;
  membershipPriceCoins: number | null;
  memberCount: number;
  isMember: boolean;
  id: string;
  name: string | null;
  username: string | null;
  handle: string | null;
  image: string;
  isVerified: boolean;
  isAdmin: boolean;
  createdAt: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  links: ProfileLink[];
  bannerUrl: string | null;
  showLikes: boolean;
  dmPrivacy: string;
  profileSongSpotifyId: string | null;
  profileSongTitle: string | null;
  profileSongArtist: string | null;
  profileSongPreviewUrl: string | null;
  profileSongAlbumArt: string | null;
  coins: number;
  followerCount: number;
  followingCount: number;
  rmharkCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  handleCooldownMs?: number;
  hasCustomAvatar?: boolean;
}

/**
 * Resolve a public profile by handle (preferred) or id, annotated for the given
 * viewer (follow state, own-profile extras). Shared by the `/api/profile/$id`
 * GET handler and the `/profile/$id` route loader so the page can be
 * server-rendered / prefetched instead of fetched client-side on mount.
 *
 * Returns `null` when no such user exists (the caller maps that to a 404 /
 * not-found state).
 */
export async function getProfile(
  id: string,
  viewer: { id: string | null; isAdmin: boolean }
): Promise<ProfilePayload | null> {
  const viewerId = viewer.id;
  const followerFilter = viewerId
    ? { followers: { where: { followerId: viewerId }, select: { id: true } } }
    : {};

  let user = await prisma.user.findUnique({
    where: { handle: id },
    select: { ...profileSelect, ...followerFilter },
  });
  if (!user) {
    user = await prisma.user.findUnique({
      where: { id },
      select: { ...profileSelect, ...followerFilter },
    });
  }
  if (!user) return null;

  const resolved = resolveUserDisplay(user);
  const isOwnProfile = viewerId === user.id;

  // Cosmetics and the tip-goal aggregate are independent — run them together.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const wantsTipGoal = !!user.profile?.tipGoal && user.profile.tipGoal > 0;
  const [cosmetics, tipAgg, membership] = await Promise.all([
    getEquippedCosmetics(user.id),
    wantsTipGoal
      ? prisma.coinTransaction.aggregate({
          where: { recipientId: user.id, type: 'TIP', amount: { gt: 0 }, createdAt: { gte: monthStart } },
          _sum: { amount: true },
        })
      : Promise.resolve(null),
    getMembershipStatus(user.id, user.profile?.membershipPriceCoins ?? null, viewerId),
  ]);
  const tipsThisMonth = tipAgg?._sum.amount ?? 0;

  const isOnline = !!user.lastSeenAt && Date.now() - user.lastSeenAt.getTime() < 2 * 60 * 1000;

  return {
    cosmetics,
    isOnline,
    tipGoal: user.profile?.tipGoal ?? null,
    tipGoalLabel: user.profile?.tipGoalLabel ?? null,
    tipsThisMonth,
    membershipPriceCoins: membership.priceCoins,
    memberCount: membership.memberCount,
    isMember: membership.isMember,
    id: user.id,
    name: resolved.name,
    username: user.username,
    handle: user.handle,
    image: resolved.image || '/images/social/default_avatar.png',
    isVerified: user.isVerified,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt.toISOString(),
    bio: user.profile?.bio ?? null,
    location: user.profile?.location ?? null,
    website: user.profile?.website ?? null,
    links: parseProfileLinks(user.profile?.links),
    bannerUrl: user.profile?.bannerUrl ?? null,
    showLikes: user.profile?.showLikes ?? false,
    dmPrivacy: user.profile?.dmPrivacy ?? 'EVERYONE',
    profileSongSpotifyId: user.profile?.profileSongSpotifyId ?? null,
    profileSongTitle: user.profile?.profileSongTitle ?? null,
    profileSongArtist: user.profile?.profileSongArtist ?? null,
    profileSongPreviewUrl: user.profile?.profileSongPreviewUrl ?? null,
    profileSongAlbumArt: user.profile?.profileSongAlbumArt ?? null,
    coins: user.profile?.coins ?? 10,
    followerCount: user.followerCount,
    followingCount: user.followingCount,
    rmharkCount: user.postCount,
    isFollowing: viewerId
      ? Boolean((user as Record<string, unknown>).followers) &&
        ((user as Record<string, unknown>).followers as unknown[]).length > 0
      : false,
    isOwnProfile,
    ...(isOwnProfile
      ? {
          handleCooldownMs: handleCooldownRemaining(user.handleChangedAt),
          hasCustomAvatar: !!user.profile?.customImage,
        }
      : {}),
  };
}
