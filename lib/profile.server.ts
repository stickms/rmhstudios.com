import { prisma } from '@/lib/prisma.server';
import { cachedMiss, invalidateCached } from '@/lib/cached.server';
import { hashTagged } from '@/lib/redis.server';
import { resolveUserDisplay } from '@/lib/user-display';
import { handleCooldownRemaining } from '@/lib/handle';
import { getEquippedCosmetics } from '@/lib/shop/equipped.server';
import { profileLinkSchema, type ProfileLink } from '@/lib/profile-schema';
import { getMembershipStatus } from '@/lib/memberships.server';
import { resolveStatus, type UserStatus } from '@/lib/profile/status';
import { parseLayout, type ProfileModule } from '@/lib/profile/modules';
import { pronunciationUrl } from '@/lib/profile/plus';
import { isBirthdayOn } from '@/lib/gifting/birthday';
import { filterOnlineUsers } from '@/lib/hot-counters.server';

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
  isBot: true,
  createdAt: true,
  lastSeenAt: true,
  birthday: { select: { month: true, day: true } },
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
      guestbookMode: true,
      dmPrivacy: true,
      profileSongSpotifyId: true,
      profileSongTitle: true,
      profileSongArtist: true,
      profileSongPreviewUrl: true,
      profileSongAlbumArt: true,
      statusEmoji: true,
      statusText: true,
      statusExpires: true,
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
  // Profile v2 (§12): the showcase module layout (empty = classic profile).
  profileLayout: { select: { modules: true } },
  // P05: three small scalars for the header (pronouns, opt-in timezone, and the
  // pronunciation clip's URL). Everything else those features show loads lazily.
  profilePlus: { select: { pronouns: true, timezone: true, pronunciationKey: true } },
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
  /** Synthetic account posted by the bot-worker, not a person. */
  isBot: boolean;
  createdAt: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  links: ProfileLink[];
  bannerUrl: string | null;
  showLikes: boolean;
  /** Plan U15 — 'off' | 'following' | 'everyone'. */
  guestbookMode: string;
  /** G1 — true only on the owner's opted-in birthday (UTC). */
  birthdayToday: boolean;
  dmPrivacy: string;
  profileSongSpotifyId: string | null;
  profileSongTitle: string | null;
  profileSongArtist: string | null;
  profileSongPreviewUrl: string | null;
  profileSongAlbumArt: string | null;
  status: UserStatus | null;
  modules: ProfileModule[];
  /** P3 — optional pronouns, shown in the header. */
  pronouns: string | null;
  /** P4 — opt-in IANA zone; the local time is computed client-side. */
  timezone: string | null;
  /** P3 — playback URL of the <=5 s name-pronunciation clip, if recorded. */
  pronunciationUrl: string | null;
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
 * Negative-cache key for "nothing answers to this handle-or-id" (OPT-47).
 *
 * Hash-tagged so the family shares one Redis Cluster slot. Only the ABSENCE is
 * cached under this key — see `getProfile`.
 */
const profileMissKey = (idOrHandle: string) => hashTagged('profile-miss', idOrHandle);

/**
 * Forget that a handle-or-id resolved to nothing, so a name that has just
 * become real is findable immediately rather than 404ing for the rest of the
 * negative TTL.
 *
 * Call from every path that makes a handle start resolving: signup's
 * auto-handle (`lib/auth.ts`), `changeHandle` (`lib/handles/history.server.ts`),
 * and the handle backfill sweep. `app/routes/api/profile.ts` still renames
 * handles directly instead of delegating to `changeHandle` (noted in
 * `lib/handles/history.server.ts`), so a rename through that route is not
 * announced here; the exposure is bounded by `NEGATIVE_TTL_MS` (10s) and closes
 * when that route delegates.
 */
export function invalidateProfileLookup(idOrHandle: string | null | undefined): void {
  if (!idOrHandle) return;
  // Fire-and-forget: drops L1 locally and broadcasts the drop to every instance.
  void invalidateCached(profileMissKey(idOrHandle));
}

/**
 * Resolve a public profile by handle (preferred) or id, annotated for the given
 * viewer (follow state, own-profile extras). Shared by the `/api/profile/$id`
 * GET handler and the `/u/$userid` route loader so the page can be
 * server-rendered / prefetched instead of fetched client-side on mount.
 *
 * Returns `null` when no such user exists (the caller maps that to a 404 /
 * not-found state).
 *
 * That not-found answer is negative-cached (`cachedMiss`), which is the only
 * part of this that can be shared: the row itself carries the viewer's follow
 * state, so a hit is never stored. A dead `/@handle` — crawlers, old links,
 * deleted accounts — therefore costs its two `findUnique`s once per negative
 * TTL instead of once per request, and a real profile keeps exactly the query
 * shape it had.
 */
export async function getProfile(
  id: string,
  viewer: { id: string | null; isAdmin: boolean },
): Promise<ProfilePayload | null> {
  const viewerId = viewer.id;
  const followerFilter = viewerId
    ? { followers: { where: { followerId: viewerId }, select: { id: true } } }
    : {};

  const user = await cachedMiss(profileMissKey(id), async () => {
    const byHandle = await prisma.user.findUnique({
      where: { handle: id },
      select: { ...profileSelect, ...followerFilter },
    });
    if (byHandle) return byHandle;
    return prisma.user.findUnique({
      where: { id },
      select: { ...profileSelect, ...followerFilter },
    });
  });
  if (!user) return null;

  const resolved = resolveUserDisplay(user);
  const isOwnProfile = viewerId === user.id;

  // Cosmetics and the tip-goal aggregate are independent — run them together.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const wantsTipGoal = !!user.profile?.tipGoal && user.profile.tipGoal > 0;
  const [cosmetics, tipAgg, membership, onlineIds] = await Promise.all([
    getEquippedCosmetics(user.id),
    wantsTipGoal
      ? prisma.coinTransaction.aggregate({
          where: {
            recipientId: user.id,
            type: 'TIP',
            amount: { gt: 0 },
            createdAt: { gte: monthStart },
          },
          _sum: { amount: true },
        })
      : Promise.resolve(null),
    getMembershipStatus(user.id, user.profile?.membershipPriceCoins ?? null, viewerId),
    // The Redis presence set is written on every heartbeat; `lastSeenAt` only
    // reaches Postgres ~every 5 min, so on its own it under-reports who is online.
    filterOnlineUsers([user.id]).catch(() => null),
  ]);
  const tipsThisMonth = tipAgg?._sum.amount ?? 0;

  const isOnline =
    onlineIds !== null
      ? onlineIds.includes(user.id)
      : !!user.lastSeenAt && Date.now() - user.lastSeenAt.getTime() < 2 * 60 * 1000;

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
    isBot: user.isBot,
    createdAt: user.createdAt.toISOString(),
    bio: user.profile?.bio ?? null,
    location: user.profile?.location ?? null,
    website: user.profile?.website ?? null,
    links: parseProfileLinks(user.profile?.links),
    bannerUrl: user.profile?.bannerUrl ?? null,
    showLikes: user.profile?.showLikes ?? false,
    guestbookMode: user.profile?.guestbookMode ?? 'off',
    birthdayToday: !!user.birthday && isBirthdayOn(user.birthday.month, user.birthday.day, new Date()),
    dmPrivacy: user.profile?.dmPrivacy ?? 'EVERYONE',
    profileSongSpotifyId: user.profile?.profileSongSpotifyId ?? null,
    profileSongTitle: user.profile?.profileSongTitle ?? null,
    profileSongArtist: user.profile?.profileSongArtist ?? null,
    profileSongPreviewUrl: user.profile?.profileSongPreviewUrl ?? null,
    profileSongAlbumArt: user.profile?.profileSongAlbumArt ?? null,
    status: resolveStatus(user.profile),
    modules: parseLayout(user.profileLayout?.modules),
    pronouns: user.profilePlus?.pronouns ?? null,
    timezone: user.profilePlus?.timezone ?? null,
    pronunciationUrl: pronunciationUrl(user.id, user.profilePlus?.pronunciationKey),
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
